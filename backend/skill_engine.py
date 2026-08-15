"""
skill_engine.py
Thin orchestrator for the AI Skill Engine chat loop.
Heavy lifting is delegated to engine sub-modules:
  engine.tool_executor  — tool dispatch & execution
  engine.prochat        — ProChat Generative UI helpers
  engine.session        — session & request persistence
  engine.messages       — system prompt & message list building
  engine.usage          — token/cost accounting
"""
import json
import time
import openai
from concurrent.futures import ThreadPoolExecutor, as_completed
from sqlalchemy.orm import Session

from engine.usage import get_model_rates
from engine.messages import resolve_user_data_placeholders
from engine.tool_executor import execute_tool, prefetch_mcp_servers
from engine.prochat import get_prochat_ui, stream_prochat_ui
from engine.session import (
    get_or_create_session, save_message,
    create_chat_request, finalize_request, resolve_allowed_skills
)

from models import Tenant, ExecutionLog, ChatMessage
from llm_client import get_llm_client, get_model_name
from skill_registry import skill_registry


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _chunk(session_id: str, model_name: str, **delta_fields) -> str:
    """Build and serialise a single SSE chat completion chunk."""
    return f"data: {json.dumps({'id': f'chatcmpl-{session_id}', 'object': 'chat.completion.chunk', 'created': 1700000000, 'model': model_name, 'choices': [{'index': 0, 'delta': delta_fields, 'finish_reason': None}]})}\n\n"


def _build_messages(db, persist, session_obj, user_message, allowed_skills, user_data, client_messages):
    """Build the messages list for the LLM call."""
    sys_content = skill_registry.get_system_instructions(allowed_skills=allowed_skills)
    if user_data:
        sys_content = resolve_user_data_placeholders(sys_content, user_data)
    msgs = [{"role": "system", "content": sys_content}]

    if persist and session_obj:
        db_messages = db.query(ChatMessage).filter(
            ChatMessage.session_id == session_obj.id
        ).order_by(ChatMessage.created_at.asc()).all()

        for msg in db_messages:
            if msg.role == "assistant" and msg.tool_calls:
                item = {"role": "assistant", "content": msg.content if msg.content else None}
                try:
                    item["tool_calls"] = json.loads(msg.tool_calls)
                except Exception:
                    pass
                msgs.append(item)
            elif msg.role == "tool":
                msgs.append({"role": "tool", "tool_call_id": msg.tool_call_id or "call_default", "content": msg.content or ""})
            else:
                content_val = msg.content or ""
                if isinstance(content_val, str) and (content_val.startswith("[") or content_val.startswith("{")):
                    try:
                        content_val = json.loads(content_val)
                    except Exception:
                        pass
                msgs.append({"role": msg.role, "content": content_val})
    else:
        if client_messages:
            for m in client_messages:
                if m.get("role") == "system":
                    msgs[0]["content"] += "\n\n" + str(m.get("content", ""))
                else:
                    msgs.append(m)
        else:
            msgs.append({"role": "user", "content": user_message})

    return msgs


def _resolve_model(db, tenant, model_name):
    """Return model_name, falling back to first active tenant model or default."""
    if model_name:
        return model_name
    from models import TenantLLM
    first = db.query(TenantLLM).filter(
        TenantLLM.tenant_id == tenant.id,
        TenantLLM.is_active == True
    ).first()
    return first.model_name if first else get_model_name()


def _log_and_append_tool_results(db, tenant, session_id, model_name, request_source, request_id,
                                 results, messages, executed_logs, persist, session_obj):
    """Persist execution logs and append tool result messages."""
    for fn_name, args, tc_id, skill_name, command, exec_res, tool_result in results:
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

        messages.append({"role": "tool", "tool_call_id": tc_id, "content": tool_result})
        if persist and session_obj:
            save_message(db, session_obj, "tool", content=tool_result, tool_call_id=tc_id)


# ─────────────────────────────────────────────────────────────────────────────
# SkillEngine
# ─────────────────────────────────────────────────────────────────────────────

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
        request_source: str = "api",
        prochat_model: str = None,
        user_data: dict = None,
        skill_names: list = None,
        client_messages: list = None,
    ) -> dict:
        start_time = time.time()
        persist = (request_source == "dashboard")

        user_message_db = json.dumps(user_message) if not isinstance(user_message, str) else user_message
        chat_req = create_chat_request(db, tenant, session_id, app_id, model_name, request_source, user_message_db)
        request_id = chat_req.id

        try:
            session_obj = None
            if persist:
                session_obj = get_or_create_session(db, tenant, session_id)
                save_message(db, session_obj, "user", content=user_message_db)

            allowed_skills = resolve_allowed_skills(db, tenant, app_id, skill_names)
            messages = _build_messages(db, persist, session_obj, user_message, allowed_skills, user_data, client_messages)
            model_name = _resolve_model(db, tenant, model_name)
            chat_req.model_name = model_name
            db.commit()

            in_r, out_r, au_in_r, au_out_r = get_model_rates(db, tenant.id, model_name)
            llm = get_llm_client(db=db, tenant_id=tenant.id, model_name=model_name)
            available_tools = skill_registry.get_openai_tools(allowed_skills=allowed_skills)
            executed_logs = []

            for turn in range(max_turns):
                kwargs = {"model": model_name, "messages": messages}
                if available_tools and turn < max_turns - 1:
                    kwargs["tools"] = available_tools
                if turn == max_turns - 1:
                    messages.append({"role": "user", "content": "[System Notice: Maximum tool execution turns reached. You can no longer call any tools. Please summarize the tool outputs and provide your final response to the user.]"})

                try:
                    response = llm.chat.completions.create(**kwargs)
                except openai.BadRequestError:
                    if persist and session_obj:
                        db.query(ChatMessage).filter(ChatMessage.session_id == session_obj.id).delete()
                        db.commit()
                        save_message(db, session_obj, "user", content=user_message)
                    sys_content = skill_registry.get_system_instructions()
                    if user_data:
                        sys_content = resolve_user_data_placeholders(sys_content, user_data)
                    messages = [{"role": "system", "content": sys_content}, {"role": "user", "content": user_message}]
                    kwargs["messages"] = messages
                    response = llm.chat.completions.create(**kwargs)

                response_msg = response.choices[0].message

                if response_msg.tool_calls:
                    # Serialize tool calls
                    tool_calls_dict = []
                    for tc in response_msg.tool_calls:
                        extra = getattr(tc, "extra_content", None)
                        if extra:
                            extra = extra.model_dump() if hasattr(extra, "model_dump") else extra.dict() if hasattr(extra, "dict") else extra
                        item = {"id": tc.id, "type": tc.type, "function": {"name": tc.function.name, "arguments": tc.function.arguments or "{}"}}
                        if extra:
                            item["extra_content"] = extra
                        tool_calls_dict.append(item)

                    if persist and session_obj:
                        save_message(db, session_obj, "assistant", content=response_msg.content, tool_calls=tool_calls_dict)
                    messages.append({"role": "assistant", "content": response_msg.content if response_msg.content else None, "tool_calls": tool_calls_dict})

                    mcp_servers = prefetch_mcp_servers(tool_calls_dict, db)

                    def run_one(tc):
                        fn = tc["function"]["name"]
                        try:
                            args = json.loads(tc["function"]["arguments"])
                        except Exception:
                            args = {}
                        skill_name, tool_def = skill_registry.find_tool(fn)
                        command, exec_res, tool_result = execute_tool(fn, args, tool_def, user_data, tenant, session_id, db, mcp_servers)
                        return fn, args, tc["id"], skill_name, command, exec_res, tool_result

                    with ThreadPoolExecutor() as executor:
                        results = list(executor.map(run_one, tool_calls_dict))

                    _log_and_append_tool_results(db, tenant, session_id, model_name, request_source,
                                                 request_id, results, messages, executed_logs, persist, session_obj)

                else:
                    final_answer = response_msg.content or ""
                    extracted_json, extracted_code = None, None
                    if prochat_model:
                        extracted_json, extracted_code = get_prochat_ui(db, tenant, messages, final_answer, prochat_model)

                    if persist and session_obj:
                        save_message(db, session_obj, "assistant", content=final_answer, json_data=extracted_json, code=extracted_code)

                    finalize_request(db, chat_req, final_answer, executed_logs, start_time,
                                     getattr(response, "usage", None), in_r, out_r, au_in_r, au_out_r)
                    return {
                        "response": final_answer, "json": extracted_json, "code": extracted_code,
                        "session_id": session_id, "request_id": request_id,
                        "tenant": tenant.name, "executed_tools": executed_logs
                    }

            # Max turns reached
            final_res = messages[-1].get("content") or "Reached maximum tool execution turns."
            extracted_json, extracted_code = None, None
            if prochat_model:
                extracted_json, extracted_code = get_prochat_ui(db, tenant, messages, final_res, prochat_model)
            if persist and session_obj:
                save_message(db, session_obj, "assistant", content=final_res, json_data=extracted_json, code=extracted_code)
            finalize_request(db, chat_req, final_res, executed_logs, start_time,
                             getattr(response, "usage", None), in_r, out_r, au_in_r, au_out_r)
            return {
                "response": final_res, "json": extracted_json, "code": extracted_code,
                "session_id": session_id, "request_id": request_id,
                "tenant": tenant.name, "executed_tools": executed_logs
            }

        except Exception as e:
            import time as _time
            chat_req.status = "error"
            chat_req.error_detail = str(e)
            chat_req.total_duration_ms = int((_time.time() - start_time) * 1000)
            from datetime import datetime
            chat_req.completed_at = datetime.utcnow()
            db.commit()
            raise

    # ─────────────────────────────────────────────────────────────────────────
    # Streaming path
    # ─────────────────────────────────────────────────────────────────────────

    def stream_openai_chat(
        self,
        db: Session,
        tenant: Tenant,
        session_id: str,
        user_message: str,
        app_id: str = None,
        model_name: str = "gemini-2.5-flash",
        max_turns: int = 25,
        request_source: str = "api",
        prochat_model: str = None,
        user_data: dict = None,
        skill_names: list = None,
        client_messages: list = None,
    ):
        start_time = time.time()

        from database import SessionLocal
        db = SessionLocal()

        persist = (request_source == "dashboard")
        session_obj = None

        try:
            # Re-fetch tenant in local session to avoid detached-instance errors
            tenant = db.query(Tenant).filter(Tenant.id == tenant.id).first() or tenant

            user_message_db = json.dumps(user_message) if not isinstance(user_message, str) else user_message
            chat_req = create_chat_request(db, tenant, session_id, app_id, model_name, request_source, user_message_db)
            request_id = chat_req.id

            executed_logs = []
            final_answer = ""

            if persist:
                session_obj = get_or_create_session(db, tenant, session_id)
                save_message(db, session_obj, "user", content=user_message_db)

            allowed_skills = resolve_allowed_skills(db, tenant, app_id, skill_names)

            yield _chunk(session_id, model_name, reasoning="Analyzing query & active skills...")

            messages = _build_messages(db, persist, session_obj, user_message, allowed_skills, user_data, client_messages)
            model_name = _resolve_model(db, tenant, model_name)
            chat_req.model_name = model_name
            db.commit()

            in_r, out_r, au_in_r, au_out_r = get_model_rates(db, tenant.id, model_name)
            llm = get_llm_client(db=db, tenant_id=tenant.id, model_name=model_name)
            available_tools = skill_registry.get_openai_tools(allowed_skills=allowed_skills)

            for turn in range(max_turns):
                kwargs = {"model": model_name, "messages": messages, "stream": True}
                if "gemini" not in model_name.lower():
                    kwargs["stream_options"] = {"include_usage": True}
                if available_tools and turn < max_turns - 1:
                    kwargs["tools"] = available_tools
                if turn == max_turns - 1:
                    messages.append({"role": "user", "content": "[System Notice: Maximum tool execution turns reached. You can no longer call any tools. Please summarize the tool outputs and provide your final response to the user.]"})

                yield _chunk(session_id, model_name, reasoning=f"Consulting LLM model {model_name} (Turn {turn+1})...")

                try:
                    response_stream = llm.chat.completions.create(**kwargs)
                except openai.BadRequestError:
                    if persist and session_obj:
                        db.query(ChatMessage).filter(ChatMessage.session_id == session_obj.id).delete()
                        db.commit()
                        save_message(db, session_obj, "user", content=user_message)
                    sys_content = skill_registry.get_system_instructions()
                    if user_data:
                        sys_content = resolve_user_data_placeholders(sys_content, user_data)
                    messages = [{"role": "system", "content": sys_content}, {"role": "user", "content": user_message}]
                    kwargs["messages"] = messages
                    response_stream = llm.chat.completions.create(**kwargs)

                full_text = ""
                tool_calls_accumulator = {}
                id_to_index = {}
                last_idx = 0
                last_usage = None

                for chunk in response_stream:
                    if getattr(chunk, "usage", None):
                        last_usage = chunk.usage
                    if not chunk.choices:
                        continue
                    choice = chunk.choices[0]
                    delta = choice.delta

                    if delta.content:
                        full_text += delta.content
                        final_answer = full_text
                        yield f"data: {json.dumps({'id': f'chatcmpl-{session_id}', 'object': 'chat.completion.chunk', 'created': 1700000000, 'model': model_name, 'choices': [{'index': 0, 'delta': {'content': delta.content}, 'finish_reason': choice.finish_reason}]})}\n\n"

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
                                tool_calls_accumulator[tc_idx] = {"id": tc.id or f"call_{tc_idx}", "type": "function", "function": {"name": "", "arguments": ""}}
                            if tc.function and tc.function.name:
                                tool_calls_accumulator[tc_idx]["function"]["name"] += tc.function.name
                            if tc.function and tc.function.arguments:
                                tool_calls_accumulator[tc_idx]["function"]["arguments"] += tc.function.arguments
                            extra = getattr(tc, "extra_content", None)
                            if extra:
                                extra = extra.model_dump() if hasattr(extra, "model_dump") else extra.dict() if hasattr(extra, "dict") else extra
                                tool_calls_accumulator[tc_idx]["extra_content"] = extra

                if tool_calls_accumulator:
                    tool_calls_list = []
                    for _, tc_data in tool_calls_accumulator.items():
                        if not tc_data["function"]["arguments"].strip():
                            tc_data["function"]["arguments"] = "{}"
                        tool_calls_list.append(tc_data)

                    if persist and session_obj:
                        save_message(db, session_obj, "assistant", content=full_text or None, tool_calls=tool_calls_list)
                    messages.append({"role": "assistant", "content": full_text or None, "tool_calls": tool_calls_list})

                    mcp_servers = prefetch_mcp_servers(tool_calls_list, db)

                    # Emit tool-start events
                    for tc in tool_calls_list:
                        fn_name = tc["function"]["name"]
                        try:
                            args = json.loads(tc["function"]["arguments"])
                        except Exception:
                            args = {}
                        skill_name, _ = skill_registry.find_tool(fn_name)
                        yield _chunk(session_id, model_name,
                                     reasoning=f"Invoking tool {fn_name} (Skill: {skill_name})...",
                                     tool_call={"name": fn_name, "arguments": args})

                    # Execute tools in parallel
                    def run_one_stream(tc):
                        fn = tc["function"]["name"]
                        try:
                            args = json.loads(tc["function"]["arguments"])
                        except Exception:
                            args = {}
                        skill_name, tool_def = skill_registry.find_tool(fn)
                        command, exec_res, tool_result = execute_tool(fn, args, tool_def, user_data, tenant, session_id, db, mcp_servers)
                        return tc, skill_name, fn, args, command, exec_res, tool_result

                    with ThreadPoolExecutor() as executor:
                        futures = [executor.submit(run_one_stream, tc) for tc in tool_calls_list]
                        for fut in as_completed(futures):
                            tc, skill_name, fn_name, args, command, exec_res, tool_result = fut.result()

                            log_entry = ExecutionLog(
                                tenant_id=tenant.id, session_id=session_id,
                                skill_name=skill_name or "unknown", tool_name=fn_name,
                                command=command, sandbox_type=exec_res.get("sandbox_type", "process"),
                                stdout=exec_res.get("stdout"), stderr=exec_res.get("stderr"),
                                exit_code=exec_res.get("exit_code", 0),
                                execution_time_ms=exec_res.get("execution_time_ms", 0),
                                model_name=model_name, request_source=request_source, request_id=request_id
                            )
                            db.add(log_entry)
                            db.commit()

                            executed_logs.append({
                                "tool_name": fn_name, "skill_name": skill_name,
                                "exit_code": exec_res.get("exit_code"),
                                "execution_time_ms": exec_res.get("execution_time_ms"),
                                "generated_files": exec_res.get("generated_files", [])
                            })

                            yield _chunk(session_id, model_name,
                                         reasoning=f"Tool {fn_name} finished in {exec_res.get('execution_time_ms')}ms ({exec_res.get('sandbox_type')}).",
                                         tool_result={
                                             "tool_name": fn_name, "skill_name": skill_name,
                                             "stdout": exec_res.get("stdout"), "stderr": exec_res.get("stderr"),
                                             "sandbox_type": exec_res.get("sandbox_type"),
                                             "execution_time_ms": exec_res.get("execution_time_ms"),
                                             "exit_code": exec_res.get("exit_code"),
                                             "generated_files": exec_res.get("generated_files", [])
                                         })

                            messages.append({"role": "tool", "tool_call_id": tc["id"], "content": tool_result})
                            if persist and session_obj:
                                save_message(db, session_obj, "tool", content=tool_result, tool_call_id=tc["id"])

                else:
                    # Final text response — handle ProChat UI
                    last_extracted_json, last_extracted_code = None, None
                    if prochat_model:
                        gen = stream_prochat_ui(db, tenant, full_text, prochat_model, session_id, model_name)
                        try:
                            while True:
                                yield next(gen)
                        except StopIteration as si:
                            last_extracted_json, last_extracted_code = si.value or (None, None)

                    if persist and session_obj:
                        save_message(db, session_obj, "assistant", content=full_text,
                                     json_data=last_extracted_json, code=last_extracted_code)

                    usage_obj = getattr(last_usage, "usage", last_usage) if last_usage else None
                    finalize_request(db, chat_req, full_text, executed_logs, start_time,
                                     usage_obj, in_r, out_r, au_in_r, au_out_r)

                    yield f"data: {json.dumps({'type': 'done', 'request_id': request_id, 'tools_called': len(executed_logs)})}\n\n"
                    yield "data: [DONE]\n\n"
                    return

            # Max turns reached
            last_extracted_json, last_extracted_code = None, None
            if prochat_model:
                gen = stream_prochat_ui(db, tenant, final_answer, prochat_model, session_id, model_name)
                try:
                    while True:
                        yield next(gen)
                except StopIteration as si:
                    last_extracted_json, last_extracted_code = si.value or (None, None)

            if persist and session_obj:
                save_message(db, session_obj, "assistant", content=final_answer,
                             json_data=last_extracted_json, code=last_extracted_code)

            usage_obj = getattr(last_usage, "usage", last_usage) if last_usage else None
            finalize_request(db, chat_req, final_answer, executed_logs, start_time,
                             usage_obj, in_r, out_r, au_in_r, au_out_r)
            yield f"data: {json.dumps({'type': 'done', 'request_id': request_id, 'tools_called': len(executed_logs)})}\n\n"
            yield "data: [DONE]\n\n"

        except Exception as e:
            chat_req.status = "error"
            chat_req.error_detail = str(e)
            chat_req.total_duration_ms = int((time.time() - start_time) * 1000)
            from datetime import datetime
            chat_req.completed_at = datetime.utcnow()
            db.commit()
            yield f"data: {json.dumps({'type': 'error', 'request_id': request_id, 'detail': str(e)})}\n\n"
            yield "data: [DONE]\n\n"
        finally:
            db.close()


skill_engine = SkillEngine()
