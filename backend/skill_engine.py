import json
import time
import openai
from datetime import datetime
from sqlalchemy.orm import Session
from models import Tenant, ConversationSession, ChatMessage, ExecutionLog, ChatRequest
from llm_client import get_llm_client, get_model_name
from skill_registry import skill_registry
from sandbox import sandbox_manager

def update_request_usage(chat_req, prompt_text: str, response_text: str):
    # Standard character-to-token count heuristics: ~4 characters per token
    p_tokens = max(10, len(prompt_text or "") // 4)
    r_tokens = max(5, len(response_text or "") // 4)
    
    model_name = (chat_req.model_name or "").lower()
    input_rate = 1.0   # per 1M tokens
    output_rate = 2.0  # per 1M tokens
    
    if "gpt-4o-mini" in model_name:
        input_rate = 0.15
        output_rate = 0.60
    elif "gpt-4o" in model_name:
        input_rate = 2.50
        output_rate = 10.00
    elif "gemini-2.5" in model_name or "gemini-2.0" in model_name or "flash" in model_name:
        input_rate = 0.075
        output_rate = 0.30
    elif "claude-3-5" in model_name or "sonnet" in model_name:
        input_rate = 3.00
        output_rate = 15.00
        
    chat_req.prompt_tokens = p_tokens
    chat_req.completion_tokens = r_tokens
    chat_req.cost_usd = round((p_tokens * input_rate + r_tokens * output_rate) / 1000000.0, 6)

class SkillEngine:
    def process_chat(
        self,
        db: Session,
        tenant: Tenant,
        session_id: str,
        user_message: str,
        app_id: str = None,
        max_turns: int = 25,
        model_name: str = None,
        request_source: str = "api"
    ) -> dict:
        start_time = time.time()

        # Only persist conversation history for dashboard requests
        persist = (request_source == "dashboard")
        session_obj = None

        import json
        user_message_db = json.dumps(user_message) if not isinstance(user_message, str) else user_message

        # --- Create ChatRequest log entry (all sources) ---
        chat_req = ChatRequest(
            tenant_id=tenant.id,
            session_id=session_id,
            app_id=app_id,
            model_name=model_name,
            request_source=request_source,
            user_message=user_message_db,
            status="pending"
        )
        db.add(chat_req)
        db.commit()
        db.refresh(chat_req)
        request_id = chat_req.id

        try:
            if persist:
                session_obj = db.query(ConversationSession).filter(
                    ConversationSession.tenant_id == tenant.id,
                    ConversationSession.session_id == session_id
                ).first()

                if not session_obj:
                    session_obj = ConversationSession(
                        tenant_id=tenant.id,
                        session_id=session_id
                    )
                    db.add(session_obj)
                    db.commit()
                    db.refresh(session_obj)

                # Save user message
                db.add(ChatMessage(session_id=session_obj.id, role="user", content=user_message_db))
                db.commit()

            # Resolve allowed skills if app_id provided
            allowed_skills = None
            if app_id:
                from models import AppModel, AppSkillMapping
                app_obj = db.query(AppModel).filter(AppModel.id == app_id).first()
                if app_obj:
                    allowed_skills = [m.skill_name for m in app_obj.skills]

            # Build messages list
            def build_messages_list():
                msgs = [{"role": "system", "content": skill_registry.get_system_instructions(allowed_skills=allowed_skills)}]
                if persist and session_obj:
                    db_messages = db.query(ChatMessage).filter(
                        ChatMessage.session_id == session_obj.id
                    ).order_by(ChatMessage.created_at.asc()).all()

                    for msg in db_messages:
                        if msg.role == "assistant" and msg.tool_calls:
                            item = {
                                "role": "assistant",
                                "content": msg.content if msg.content else None
                            }
                            try:
                                item["tool_calls"] = json.loads(msg.tool_calls)
                            except Exception:
                                pass
                            msgs.append(item)
                        elif msg.role == "tool":
                            msgs.append({
                                "role": "tool",
                                "tool_call_id": msg.tool_call_id or "call_default",
                                "content": msg.content or ""
                            })
                        else:
                            content_val = msg.content or ""
                            if isinstance(content_val, str) and (content_val.startswith("[") or content_val.startswith("{")):
                                try:
                                    content_val = json.loads(content_val)
                                except Exception:
                                    pass
                            msgs.append({
                                "role": msg.role,
                                "content": content_val
                            })
                else:
                    msgs.append({"role": "user", "content": user_message})
                return msgs

            messages = build_messages_list()
            if not model_name:
                from models import TenantLLM
                first_model = db.query(TenantLLM).filter(
                    TenantLLM.tenant_id == tenant.id,
                    TenantLLM.is_active == True
                ).first()
                if first_model:
                    model_name = first_model.model_name
                else:
                    model_name = get_model_name()

            # Update resolved model name on the request log
            chat_req.model_name = model_name
            db.commit()

            llm = get_llm_client(db=db, tenant_id=tenant.id, model_name=model_name)
            available_tools = skill_registry.get_openai_tools(allowed_skills=allowed_skills)

            executed_logs = []

            for turn in range(max_turns):
                kwargs = {"model": model_name, "messages": messages}
                if available_tools:
                    kwargs["tools"] = available_tools

                try:
                    response = llm.chat.completions.create(**kwargs)
                except openai.BadRequestError as e:
                    if persist and session_obj:
                        db.query(ChatMessage).filter(ChatMessage.session_id == session_obj.id).delete()
                        db.commit()
                        db.add(ChatMessage(session_id=session_obj.id, role="user", content=user_message))
                        db.commit()

                    messages = [
                        {"role": "system", "content": skill_registry.get_system_instructions()},
                        {"role": "user", "content": user_message}
                    ]
                    kwargs["messages"] = messages
                    response = llm.chat.completions.create(**kwargs)

                response_msg = response.choices[0].message

                if response_msg.tool_calls:
                    tool_calls_dict = []
                    for tc in response_msg.tool_calls:
                        extra = getattr(tc, "extra_content", None)
                        if extra:
                            if hasattr(extra, "model_dump"):
                                extra = extra.model_dump()
                            elif hasattr(extra, "dict"):
                                extra = extra.dict()

                        item = {
                            "id": tc.id,
                            "type": tc.type,
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments or "{}"
                            }
                        }
                        if extra:
                            item["extra_content"] = extra
                        tool_calls_dict.append(item)

                    if persist and session_obj:
                        db.add(ChatMessage(
                            session_id=session_obj.id,
                            role="assistant",
                            content=response_msg.content,
                            tool_calls=json.dumps(tool_calls_dict)
                        ))
                        db.commit()

                    messages.append({
                        "role": "assistant",
                        "content": response_msg.content if response_msg.content else None,
                        "tool_calls": tool_calls_dict
                    })

                    # Pre-resolve MCP servers
                    mcp_servers = {}
                    for tc in response_msg.tool_calls:
                        fn_name = tc.function.name
                        _, tool_def = skill_registry.find_tool(fn_name)
                        if tool_def and tool_def.get("type") == "mcp_server":
                            srv_id = tool_def.get("mcp_server_id")
                            if srv_id and srv_id not in mcp_servers:
                                from models import McpServer
                                srv_obj = db.query(McpServer).filter(McpServer.id == srv_id).first()
                                if srv_obj:
                                    mcp_servers[srv_id] = {
                                        "name": srv_obj.name,
                                        "transport": srv_obj.transport,
                                        "command": srv_obj.command,
                                        "url": srv_obj.url,
                                        "env": srv_obj.env
                                    }

                    class SimpleMcpServerObj:
                        def __init__(self, **kwargs):
                            for k, v in kwargs.items():
                                setattr(self, k, v)

                    def execute_one(tc):
                        fn_name = tc.function.name
                        try:
                            args = json.loads(tc.function.arguments)
                        except Exception:
                            args = {}

                        skill_name, tool_def = skill_registry.find_tool(fn_name)
                        if not tool_def:
                            tool_result = f"Error: Tool {fn_name} not found in skill registry."
                            exec_res = {"stdout": "", "stderr": tool_result, "exit_code": 1, "execution_time_ms": 0, "sandbox_type": "process"}
                            command = f"Error: Tool {fn_name}"
                        else:
                            tool_type = tool_def.get("type", "shell")
                            if tool_type in ["http", "rest_api", "api"]:
                                from executors.http_executor import http_executor
                                exec_res = http_executor.execute(tool_def=tool_def, arguments=args)
                                command = f"{tool_def.get('method', 'GET')} {tool_def.get('url')} params={json.dumps(args)}"
                            elif tool_type in ["mcp", "mcp_stdio"]:
                                from executors.mcp_executor import mcp_executor
                                exec_res = mcp_executor.execute(tool_def=tool_def, arguments=args)
                                command = tool_def.get("mcp_command") or tool_def.get("command") or f"MCP Call {fn_name}"
                            elif tool_type == "mcp_server":
                                from mcp_manager import mcp_manager
                                srv_id = tool_def.get("mcp_server_id")
                                srv_data = mcp_servers.get(srv_id)
                                if srv_data:
                                    srv_obj = SimpleMcpServerObj(**srv_data)
                                    exec_res = mcp_manager.call_tool(srv_obj, tool_def.get("name"), args)
                                    command = f"MCP Server {srv_obj.name} -> tool {tool_def.get('name')}"
                                else:
                                    exec_res = {"stdout": "", "stderr": "MCP Server not found", "exit_code": 1, "execution_time_ms": 0, "sandbox_type": "mcp"}
                                    command = "MCP Call"
                            else:
                                command = tool_def.get("command", "")
                                code = args.get("code") if tool_type == "code" else None
                                tenant_name = tenant.name if tenant else "default"
                                
                                # Intercept explicit cloud & HTTP skills to run on host instead of isolated offline sandbox
                                if fn_name == "cloud_storage__upload_to_storage":
                                    exec_res = run_upload_to_storage_tool(db, args, tenant)
                                elif fn_name == "cloud_storage__download_from_storage":
                                    exec_res = run_download_from_storage_tool(db, args, tenant)
                                elif fn_name == "http_fetcher__download_public_file":
                                    exec_res = run_download_public_file_tool(db, args, tenant)
                                else:
                                    exec_res = sandbox_manager.execute(command=command, code=code)
                                    exec_res = map_local_generated_files_to_tenant(exec_res, tenant_name=tenant_name)

                            tool_result = exec_res.get("stdout") or exec_res.get("stderr") or "Execution completed cleanly with no output."
                            generated_files = exec_res.get("generated_files", [])
                            if generated_files:
                                files_str = "\n\nGenerated files:\n" + "\n".join(
                                    f"- {f['original_name']} (URL: {f['url']}, Sandbox Path: {f['sandbox_path']})"
                                    for f in generated_files
                                )
                                tool_result += files_str

                        return tc, skill_name, fn_name, args, command, exec_res, tool_result

                    from concurrent.futures import ThreadPoolExecutor
                    with ThreadPoolExecutor() as executor:
                        results = list(executor.map(execute_one, response_msg.tool_calls))

                    for tc, skill_name, fn_name, args, command, exec_res, tool_result in results:
                        log_entry = ExecutionLog(
                            tenant_id=tenant.id,
                            session_id=session_id,
                            skill_name=skill_name or "unknown",
                            tool_name=fn_name,
                            command=command,
                            sandbox_type=exec_res.get("sandbox_type", "process"),
                            stdout=exec_res.get("stdout"),
                            stderr=exec_res.get("stderr"),
                            exit_code=exec_res.get("exit_code", 0),
                            execution_time_ms=exec_res.get("execution_time_ms", 0),
                            model_name=model_name,
                            request_source=request_source,
                            request_id=request_id
                        )
                        db.add(log_entry)
                        db.commit()
                        db.refresh(log_entry)

                        executed_logs.append({
                            "id": log_entry.id,
                            "skill_name": log_entry.skill_name,
                            "tool_name": log_entry.tool_name,
                            "sandbox_type": log_entry.sandbox_type,
                            "stdout": log_entry.stdout,
                            "stderr": log_entry.stderr,
                            "exit_code": log_entry.exit_code,
                            "execution_time_ms": log_entry.execution_time_ms,
                            "generated_files": exec_res.get("generated_files", [])
                        })

                        messages.append({
                            "role": "tool",
                            "tool_call_id": tc.id,
                            "content": tool_result
                        })
                        if persist and session_obj:
                            db.add(ChatMessage(
                                session_id=session_obj.id,
                                role="tool",
                                content=tool_result,
                                tool_call_id=tc.id
                            ))
                            db.commit()

                else:
                    final_answer = response_msg.content or ""
                    
                    if persist and session_obj:
                        db.add(ChatMessage(
                            session_id=session_obj.id,
                            role="assistant",
                            content=final_answer
                        ))
                        db.commit()

                    # --- Mark ChatRequest completed ---
                    duration_ms = int((time.time() - start_time) * 1000)
                    chat_req.assistant_response = final_answer
                    chat_req.tools_called = len(executed_logs)
                    chat_req.total_duration_ms = duration_ms
                    chat_req.status = "completed"
                    chat_req.completed_at = datetime.utcnow()
                    update_request_usage(chat_req, user_message, final_answer)
                    db.commit()

                    return {
                        "response": final_answer,
                        "session_id": session_id,
                        "request_id": request_id,
                        "tenant": tenant.name,
                        "executed_tools": executed_logs
                    }

            # Max turns reached
            duration_ms = int((time.time() - start_time) * 1000)
            final_res = messages[-1].get("content") or "Reached maximum tool execution turns."
            chat_req.assistant_response = final_res
            chat_req.tools_called = len(executed_logs)
            chat_req.total_duration_ms = duration_ms
            chat_req.status = "completed"
            chat_req.completed_at = datetime.utcnow()
            update_request_usage(chat_req, user_message, final_res)
            db.commit()

            return {
                "response": final_res,
                "session_id": session_id,
                "request_id": request_id,
                "tenant": tenant.name,
                "executed_tools": executed_logs
            }

        except Exception as e:
            # --- Mark ChatRequest as error ---
            duration_ms = int((time.time() - start_time) * 1000)
            chat_req.status = "error"
            chat_req.error_detail = str(e)
            chat_req.total_duration_ms = duration_ms
            chat_req.completed_at = datetime.utcnow()
            db.commit()
            raise

    def stream_openai_chat(
        self,
        db: Session,
        tenant: Tenant,
        session_id: str,
        user_message: str,
        app_id: str = None,
        model_name: str = "gemini-2.5-flash",
        max_turns: int = 25,
        request_source: str = "api"
    ):
        start_time = time.time()

        db_incoming = db
        tenant_incoming = tenant

        from database import SessionLocal
        db = SessionLocal()

        # Only persist conversation history for dashboard requests
        persist = (request_source == "dashboard")
        session_obj = None

        try:
            # Re-fetch tenant in local session context to prevent session expired errors
            tenant = db.query(Tenant).filter(Tenant.id == tenant_incoming.id).first()
            if not tenant:
                tenant = tenant_incoming

            import json
            user_message_db = json.dumps(user_message) if not isinstance(user_message, str) else user_message

            # --- Create ChatRequest log entry ---
            chat_req = ChatRequest(
                tenant_id=tenant.id,
                session_id=session_id,
                app_id=app_id,
                model_name=model_name,
                request_source=request_source,
                user_message=user_message_db,
                status="pending"
            )
            db.add(chat_req)
            db.commit()
            db.refresh(chat_req)
            request_id = chat_req.id

            executed_logs = []
            final_answer = ""

            if persist:
                session_obj = db.query(ConversationSession).filter(
                    ConversationSession.tenant_id == tenant.id,
                    ConversationSession.session_id == session_id
                ).first()

                if not session_obj:
                    session_obj = ConversationSession(
                        tenant_id=tenant.id,
                        session_id=session_id
                    )
                    db.add(session_obj)
                    db.commit()
                    db.refresh(session_obj)

                db.add(ChatMessage(session_id=session_obj.id, role="user", content=user_message_db))
                db.commit()

            # Resolve allowed skills if app_id provided
            allowed_skills = None
            if app_id:
                from models import AppModel, AppSkillMapping
                app_obj = db.query(AppModel).filter(AppModel.id == app_id).first()
                if app_obj:
                    allowed_skills = [m.skill_name for m in app_obj.skills]

            # Emit initial reasoning chunk
            init_reasoning = {
                "id": f"chatcmpl-{session_id}",
                "object": "chat.completion.chunk",
                "created": 1700000000,
                "model": model_name,
                "choices": [{
                    "index": 0,
                    "delta": {"reasoning": "Analyzing query & active skills..."},
                    "finish_reason": None
                }]
            }
            yield f"data: {json.dumps(init_reasoning)}\n\n"

            def build_messages_list():
                msgs = [{"role": "system", "content": skill_registry.get_system_instructions(allowed_skills=allowed_skills)}]
                if persist and session_obj:
                    db_messages = db.query(ChatMessage).filter(
                        ChatMessage.session_id == session_obj.id
                    ).order_by(ChatMessage.created_at.asc()).all()

                    for msg in db_messages:
                        if msg.role == "assistant" and msg.tool_calls:
                            item = {
                                "role": "assistant",
                                "content": msg.content if msg.content else None
                            }
                            try:
                                item["tool_calls"] = json.loads(msg.tool_calls)
                            except Exception:
                                pass
                            msgs.append(item)
                        elif msg.role == "tool":
                            msgs.append({
                                "role": "tool",
                                "tool_call_id": msg.tool_call_id or "call_default",
                                "content": msg.content or ""
                            })
                        else:
                            content_val = msg.content or ""
                            if isinstance(content_val, str) and (content_val.startswith("[") or content_val.startswith("{")):
                                try:
                                    content_val = json.loads(content_val)
                                except Exception:
                                    pass
                            msgs.append({
                                "role": msg.role,
                                "content": content_val
                            })
                else:
                    msgs.append({"role": "user", "content": user_message})
                return msgs

            messages = build_messages_list()
            if not model_name:
                from models import TenantLLM
                first_model = db.query(TenantLLM).filter(
                    TenantLLM.tenant_id == tenant.id,
                    TenantLLM.is_active == True
                ).first()
                if first_model:
                    model_name = first_model.model_name
                else:
                    model_name = get_model_name()

            # Update resolved model name
            chat_req.model_name = model_name
            db.commit()

            llm = get_llm_client(db=db, tenant_id=tenant.id, model_name=model_name)
            available_tools = skill_registry.get_openai_tools(allowed_skills=allowed_skills)

            for turn in range(max_turns):
                kwargs = {"model": model_name, "messages": messages, "stream": True}
                if available_tools:
                    kwargs["tools"] = available_tools

                turn_reasoning = {
                    "id": f"chatcmpl-{session_id}",
                    "object": "chat.completion.chunk",
                    "created": 1700000000,
                    "model": model_name,
                    "choices": [{
                        "index": 0,
                        "delta": {"reasoning": f"Consulting LLM model {model_name} (Turn {turn+1})..."},
                        "finish_reason": None
                    }]
                }
                yield f"data: {json.dumps(turn_reasoning)}\n\n"

                try:
                    response_stream = llm.chat.completions.create(**kwargs)
                except openai.BadRequestError as e:
                    if persist and session_obj:
                        db.query(ChatMessage).filter(ChatMessage.session_id == session_obj.id).delete()
                        db.commit()
                        db.add(ChatMessage(session_id=session_obj.id, role="user", content=user_message))
                        db.commit()
                    messages = [
                        {"role": "system", "content": skill_registry.get_system_instructions()},
                        {"role": "user", "content": user_message}
                    ]
                    kwargs["messages"] = messages
                    response_stream = llm.chat.completions.create(**kwargs)

                full_text = ""
                tool_calls_accumulator = {}
                id_to_index = {}
                last_idx = 0

                for chunk in response_stream:
                    if not chunk.choices:
                        continue
                    choice = chunk.choices[0]
                    delta = choice.delta

                    if delta.content:
                        full_text += delta.content
                        final_answer = full_text
                        chunk_data = {
                            "id": f"chatcmpl-{session_id}",
                            "object": "chat.completion.chunk",
                            "created": 1700000000,
                            "model": model_name,
                            "choices": [{
                                "index": 0,
                                "delta": {"content": delta.content},
                                "finish_reason": choice.finish_reason
                            }]
                        }
                        yield f"data: {json.dumps(chunk_data)}\n\n"

                    if delta.tool_calls:
                        for tc in delta.tool_calls:
                            tc_idx = tc.index
                            if tc_idx is None:
                                if tc.id:
                                    if tc.id not in id_to_index:
                                        id_to_index[tc.id] = len(id_to_index)
                                    tc_idx = id_to_index[tc.id]
                                else:
                                    tc_idx = last_idx

                            last_idx = tc_idx

                            if tc_idx not in tool_calls_accumulator:
                                tool_calls_accumulator[tc_idx] = {
                                    "id": tc.id or f"call_{tc_idx}",
                                    "type": "function",
                                    "function": {"name": "", "arguments": ""}
                                }
                            if tc.function and tc.function.name:
                                tool_calls_accumulator[tc_idx]["function"]["name"] += tc.function.name
                            if tc.function and tc.function.arguments:
                                tool_calls_accumulator[tc_idx]["function"]["arguments"] += tc.function.arguments

                            extra = getattr(tc, "extra_content", None)
                            if extra:
                                if hasattr(extra, "model_dump"):
                                    extra = extra.model_dump()
                                elif hasattr(extra, "dict"):
                                    extra = extra.dict()
                                tool_calls_accumulator[tc_idx]["extra_content"] = extra

                if tool_calls_accumulator:
                    tool_calls_list = []
                    for tc_idx, tc_data in tool_calls_accumulator.items():
                        args_str = tc_data["function"]["arguments"]
                        if not args_str or not args_str.strip():
                            tc_data["function"]["arguments"] = "{}"
                        tool_calls_list.append(tc_data)

                    if persist and session_obj:
                        db.add(ChatMessage(
                            session_id=session_obj.id,
                            role="assistant",
                            content=full_text if full_text else None,
                            tool_calls=json.dumps(tool_calls_list)
                        ))
                        db.commit()

                    messages.append({
                        "role": "assistant",
                        "content": full_text if full_text else None,
                        "tool_calls": tool_calls_list
                    })

                    # Pre-resolve MCP servers
                    mcp_servers = {}
                    for tc in tool_calls_list:
                        fn_name = tc["function"]["name"]
                        _, tool_def = skill_registry.find_tool(fn_name)
                        if tool_def and tool_def.get("type") == "mcp_server":
                            srv_id = tool_def.get("mcp_server_id")
                            if srv_id and srv_id not in mcp_servers:
                                from models import McpServer
                                srv_obj = db.query(McpServer).filter(McpServer.id == srv_id).first()
                                if srv_obj:
                                    mcp_servers[srv_id] = {
                                        "name": srv_obj.name,
                                        "transport": srv_obj.transport,
                                        "command": srv_obj.command,
                                        "url": srv_obj.url,
                                        "env": srv_obj.env
                                    }

                    class SimpleMcpServerObj:
                        def __init__(self, **kwargs):
                            for k, v in kwargs.items():
                                setattr(self, k, v)

                    def execute_one_stream(tc):
                        fn_name = tc["function"]["name"]
                        try:
                            args = json.loads(tc["function"]["arguments"])
                        except Exception:
                            args = {}

                        skill_name, tool_def = skill_registry.find_tool(fn_name)
                        if not tool_def:
                            tool_result = f"Error: Tool {fn_name} not found in skill registry."
                            exec_res = {"stdout": "", "stderr": tool_result, "exit_code": 1, "execution_time_ms": 0, "sandbox_type": "process"}
                            command = f"Error: Tool {fn_name}"
                        else:
                            tool_type = tool_def.get("type", "shell")
                            if tool_type in ["http", "rest_api", "api"]:
                                from executors.http_executor import http_executor
                                exec_res = http_executor.execute(tool_def=tool_def, arguments=args)
                                command = f"{tool_def.get('method', 'GET')} {tool_def.get('url')} params={json.dumps(args)}"
                            elif tool_type in ["mcp", "mcp_stdio"]:
                                from executors.mcp_executor import mcp_executor
                                exec_res = mcp_executor.execute(tool_def=tool_def, arguments=args)
                                command = tool_def.get("mcp_command") or tool_def.get("command") or f"MCP Call {fn_name}"
                            elif tool_type == "mcp_server":
                                from mcp_manager import mcp_manager
                                srv_id = tool_def.get("mcp_server_id")
                                srv_data = mcp_servers.get(srv_id)
                                if srv_data:
                                    srv_obj = SimpleMcpServerObj(**srv_data)
                                    exec_res = mcp_manager.call_tool(srv_obj, tool_def.get("name"), args)
                                    command = f"MCP Server {srv_obj.name} -> tool {tool_def.get('name')}"
                                else:
                                    exec_res = {"stdout": "", "stderr": "MCP Server not found", "exit_code": 1, "execution_time_ms": 0, "sandbox_type": "mcp"}
                                    command = "MCP Call"
                            else:
                                command = tool_def.get("command", "")
                                code = args.get("code") if tool_type == "code" else None
                                tenant_name = tenant.name if tenant else "default"
                                
                                # Intercept explicit cloud & HTTP skills to run on host instead of isolated offline sandbox
                                if fn_name == "cloud_storage__upload_to_storage":
                                    exec_res = run_upload_to_storage_tool(db, args, tenant)
                                elif fn_name == "cloud_storage__download_from_storage":
                                    exec_res = run_download_from_storage_tool(db, args, tenant)
                                elif fn_name == "http_fetcher__download_public_file":
                                    exec_res = run_download_public_file_tool(db, args, tenant)
                                else:
                                    exec_res = sandbox_manager.execute(command=command, code=code)
                                    exec_res = map_local_generated_files_to_tenant(exec_res, tenant_name=tenant_name)

                            tool_result = exec_res.get("stdout") or exec_res.get("stderr") or "Execution completed cleanly with no output."
                            generated_files = exec_res.get("generated_files", [])
                            if generated_files:
                                files_str = "\n\nGenerated files:\n" + "\n".join(
                                    f"- {f['original_name']} (URL: {f['url']}, Sandbox Path: {f['sandbox_path']})"
                                    for f in generated_files
                                )
                                tool_result += files_str

                        return tc, skill_name, fn_name, args, command, exec_res, tool_result

                    # Yield tool start events
                    for tc in tool_calls_list:
                        fn_name = tc["function"]["name"]
                        try:
                            args = json.loads(tc["function"]["arguments"])
                        except Exception:
                            args = {}
                        skill_name, _ = skill_registry.find_tool(fn_name)

                        tool_start_chunk = {
                            "id": f"chatcmpl-{session_id}",
                            "object": "chat.completion.chunk",
                            "created": 1700000000,
                            "model": model_name,
                            "choices": [{
                                "index": 0,
                                "delta": {
                                    "reasoning": f"Invoking tool {fn_name} (Skill: {skill_name})...",
                                    "tool_call": {"name": fn_name, "arguments": args}
                                },
                                "finish_reason": None
                            }]
                        }
                        yield f"data: {json.dumps(tool_start_chunk)}\n\n"

                    # Execute in parallel
                    from concurrent.futures import ThreadPoolExecutor, as_completed
                    with ThreadPoolExecutor() as executor:
                        futures = [executor.submit(execute_one_stream, tc) for tc in tool_calls_list]

                        for fut in as_completed(futures):
                            tc, skill_name, fn_name, args, command, exec_res, tool_result = fut.result()

                            log_entry = ExecutionLog(
                                tenant_id=tenant.id,
                                session_id=session_id,
                                skill_name=skill_name or "unknown",
                                tool_name=fn_name,
                                command=command,
                                sandbox_type=exec_res.get("sandbox_type", "process"),
                                stdout=exec_res.get("stdout"),
                                stderr=exec_res.get("stderr"),
                                exit_code=exec_res.get("exit_code", 0),
                                execution_time_ms=exec_res.get("execution_time_ms", 0),
                                model_name=model_name,
                                request_source=request_source,
                                request_id=request_id
                            )
                            db.add(log_entry)
                            db.commit()

                            executed_logs.append({
                                "tool_name": fn_name,
                                "skill_name": skill_name,
                                "exit_code": exec_res.get("exit_code"),
                                "execution_time_ms": exec_res.get("execution_time_ms"),
                                "generated_files": exec_res.get("generated_files", [])
                            })

                            tool_end_chunk = {
                                "id": f"chatcmpl-{session_id}",
                                "object": "chat.completion.chunk",
                                "created": 1700000000,
                                "model": model_name,
                                "choices": [{
                                    "index": 0,
                                    "delta": {
                                        "reasoning": f"Tool {fn_name} finished in {exec_res.get('execution_time_ms')}ms ({exec_res.get('sandbox_type')}).",
                                        "tool_result": {
                                            "tool_name": fn_name,
                                            "skill_name": skill_name,
                                            "stdout": exec_res.get("stdout"),
                                            "stderr": exec_res.get("stderr"),
                                            "sandbox_type": exec_res.get("sandbox_type"),
                                            "execution_time_ms": exec_res.get("execution_time_ms"),
                                            "exit_code": exec_res.get("exit_code"),
                                            "generated_files": exec_res.get("generated_files", [])
                                        }
                                    },
                                    "finish_reason": None
                                }]
                            }
                            yield f"data: {json.dumps(tool_end_chunk)}\n\n"

                            messages.append({
                                "role": "tool",
                                "tool_call_id": tc["id"],
                                "content": tool_result
                            })
                            if persist and session_obj:
                                db.add(ChatMessage(
                                    session_id=session_obj.id,
                                    role="tool",
                                    content=tool_result,
                                    tool_call_id=tc["id"]
                                ))
                                db.commit()
                else:
                    if persist and session_obj:
                        db.add(ChatMessage(
                            session_id=session_obj.id,
                            role="assistant",
                            content=full_text
                        ))
                        db.commit()

                    # --- Mark ChatRequest completed ---
                    duration_ms = int((time.time() - start_time) * 1000)
                    chat_req.assistant_response = full_text
                    chat_req.tools_called = len(executed_logs)
                    chat_req.total_duration_ms = duration_ms
                    chat_req.status = "completed"
                    chat_req.completed_at = datetime.utcnow()
                    update_request_usage(chat_req, user_message, full_text)
                    db.commit()

                    # Emit done with request_id
                    done_chunk = {
                        "type": "done",
                        "request_id": request_id,
                        "tools_called": len(executed_logs)
                    }
                    yield f"data: {json.dumps(done_chunk)}\n\n"
                    yield "data: [DONE]\n\n"
                    return

            # Max turns — mark completed
            duration_ms = int((time.time() - start_time) * 1000)
            chat_req.assistant_response = final_answer
            chat_req.tools_called = len(executed_logs)
            chat_req.total_duration_ms = duration_ms
            chat_req.status = "completed"
            chat_req.completed_at = datetime.utcnow()
            update_request_usage(chat_req, user_message, final_answer)
            db.commit()

            done_chunk = {"type": "done", "request_id": request_id, "tools_called": len(executed_logs)}
            yield f"data: {json.dumps(done_chunk)}\n\n"
            yield "data: [DONE]\n\n"

        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            chat_req.status = "error"
            chat_req.error_detail = str(e)
            chat_req.total_duration_ms = duration_ms
            chat_req.completed_at = datetime.utcnow()
            db.commit()
            error_chunk = {"type": "error", "request_id": request_id, "detail": str(e)}
            yield f"data: {json.dumps(error_chunk)}\n\n"
            yield "data: [DONE]\n\n"
        finally:
            db.close()

def run_upload_to_storage_tool(db, args: dict, tenant) -> dict:
    filename = args.get("filename")
    if not filename:
        return {"stdout": "", "stderr": "Error: filename is required.", "exit_code": 1, "execution_time_ms": 0, "sandbox_type": "host"}
        
    import os
    import time
    from storage import get_storage_backend, OUTPUT_DIR, UPLOAD_DIR
    
    start_time = time.time()
    tenant_name = tenant.name if tenant else "default"
    
    local_path = None
    for directory in (OUTPUT_DIR, UPLOAD_DIR):
        p = os.path.join(directory, tenant_name, filename)
        if os.path.exists(p):
            local_path = p
            break
        for folder in ("", "default"):
            p = os.path.join(directory, folder, filename) if folder else os.path.join(directory, filename)
            if os.path.exists(p):
                local_path = p
                break
        if local_path:
            break
            
    if not local_path or not os.path.exists(local_path):
        return {"stdout": "", "stderr": f"Error: File '{filename}' not found.", "exit_code": 1, "execution_time_ms": int((time.time() - start_time) * 1000), "sandbox_type": "host"}
        
    try:
        backend = get_storage_backend(db)
        with open(local_path, "rb") as f:
            data = f.read()
        cloud_url = backend.upload(filename, data, "application/octet-stream", tenant_name=tenant_name)
        elapsed_ms = int((time.time() - start_time) * 1000)
        return {
            "stdout": f"File '{filename}' successfully uploaded to storage. URL: {cloud_url}",
            "stderr": "",
            "exit_code": 0,
            "execution_time_ms": elapsed_ms,
            "sandbox_type": "host",
            "generated_files": [{
                "filename": filename,
                "original_name": filename,
                "url": cloud_url,
                "sandbox_path": f"sandbox/outputs/{tenant_name}/{filename}"
            }]
        }
    except Exception as e:
        return {"stdout": "", "stderr": f"Error uploading file: {str(e)}", "exit_code": 1, "execution_time_ms": int((time.time() - start_time) * 1000), "sandbox_type": "host"}

def run_download_from_storage_tool(db, args: dict, tenant) -> dict:
    filename = args.get("filename")
    if not filename:
        return {"stdout": "", "stderr": "Error: filename is required.", "exit_code": 1, "execution_time_ms": 0, "sandbox_type": "host"}
        
    import os
    import time
    from storage import get_storage_backend, UPLOAD_DIR
    
    start_time = time.time()
    tenant_name = tenant.name if tenant else "default"
    local_path = os.path.join(UPLOAD_DIR, tenant_name, filename)
    
    try:
        backend = get_storage_backend(db)
        if not hasattr(backend, "download"):
            return {"stdout": "", "stderr": "Error: Active backend does not support download.", "exit_code": 1, "execution_time_ms": int((time.time() - start_time) * 1000), "sandbox_type": "host"}
            
        data = backend.download(filename, tenant_name=tenant_name)
        if not data:
            return {"stdout": "", "stderr": f"Error: File '{filename}' not found in cloud storage.", "exit_code": 1, "execution_time_ms": int((time.time() - start_time) * 1000), "sandbox_type": "host"}
            
        tenant_upload_dir = os.path.join(UPLOAD_DIR, tenant_name)
        os.makedirs(tenant_upload_dir, exist_ok=True)
        with open(local_path, "wb") as f:
            f.write(data)
            
        elapsed_ms = int((time.time() - start_time) * 1000)
        return {
            "stdout": f"File '{filename}' successfully downloaded to local sandbox path sandbox/uploads/{tenant_name}/{filename}",
            "stderr": "",
            "exit_code": 0,
            "execution_time_ms": elapsed_ms,
            "sandbox_type": "host"
        }
    except Exception as e:
        return {"stdout": "", "stderr": f"Error downloading file: {str(e)}", "exit_code": 1, "execution_time_ms": int((time.time() - start_time) * 1000), "sandbox_type": "host"}

def run_download_public_file_tool(db, args: dict, tenant) -> dict:
    url = args.get("url")
    filename = args.get("filename")
    if not url or not filename:
        return {"stdout": "", "stderr": "Error: Both url and filename are required.", "exit_code": 1, "execution_time_ms": 0, "sandbox_type": "host"}
        
    import os
    import time
    import urllib.request
    from storage import UPLOAD_DIR
    
    start_time = time.time()
    tenant_name = tenant.name if tenant else "default"
    local_path = os.path.join(UPLOAD_DIR, tenant_name, filename)
    
    try:
        tenant_upload_dir = os.path.join(UPLOAD_DIR, tenant_name)
        os.makedirs(tenant_upload_dir, exist_ok=True)
        
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0'}
        )
        with urllib.request.urlopen(req, timeout=15) as response:
            data = response.read()
            
        with open(local_path, "wb") as f:
            f.write(data)
            
        elapsed_ms = int((time.time() - start_time) * 1000)
        return {
            "stdout": f"Successfully downloaded public file to sandbox/uploads/{tenant_name}/{filename}",
            "stderr": "",
            "exit_code": 0,
            "execution_time_ms": elapsed_ms,
            "sandbox_type": "host"
        }
    except Exception as e:
        return {"stdout": "", "stderr": f"Error downloading public file: {str(e)}", "exit_code": 1, "execution_time_ms": int((time.time() - start_time) * 1000), "sandbox_type": "host"}

def map_local_generated_files_to_tenant(exec_res: dict, tenant_name: str = "default") -> dict:
    generated_files = exec_res.get("generated_files", [])
    if not generated_files:
        return exec_res
    import os
    from storage import OUTPUT_DIR
    for f in generated_files:
        old_path = os.path.join(OUTPUT_DIR, f["filename"])
        if os.path.exists(old_path):
            tenant_output_dir = os.path.join(OUTPUT_DIR, tenant_name)
            os.makedirs(tenant_output_dir, exist_ok=True)
            new_path = os.path.join(tenant_output_dir, f["filename"])
            os.rename(old_path, new_path)
            f["url"] = f"/api/v1/files/download/{tenant_name}/{f['filename']}"
            f["sandbox_path"] = f"sandbox/outputs/{tenant_name}/{f['filename']}"
    return exec_res

skill_engine = SkillEngine()
