"""
engine/tool_executor.py
Shared tool dispatch logic used by both process_chat and stream_openai_chat.
"""
import json
import copy
from sqlalchemy.orm import Session

from engine.messages import resolve_user_data_placeholders
from skill_registry import skill_registry
from sandbox import sandbox_manager
from engine.tools_builtin import (
    run_upload_to_storage_tool,
    run_download_from_storage_tool,
    run_download_public_file_tool,
    run_list_sandbox_files,
    run_download_sandbox_file,
    run_upload_sandbox_file,
    run_send_email_tool,
    map_local_generated_files_to_tenant,
    run_multimodal_subagent_tool,
)
from artifacts.tools import (
    run_open_or_update_artifact,
    run_open_uploaded_file_as_artifact,
    run_artifact_search,
    run_artifact_semantic_search,
    run_edit_artifact_section,
    run_patch_artifact,
    run_rollback_artifact_block,
)


class SimpleMcpServerObj:
    """Lightweight data object for MCP server parameters."""
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


def prefetch_mcp_servers(tool_calls, db: Session, tenant_id: str = None) -> dict:
    """Pre-resolve MCP server DB rows for all tool calls that need them."""
    mcp_servers = {}
    for tc in tool_calls:
        # Support both dict (streaming) and object (non-streaming) tool call shapes
        fn_name = tc["function"]["name"] if isinstance(tc, dict) else tc.function.name
        _, tool_def = skill_registry.find_tool(fn_name, tenant_id=tenant_id)
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
                        "env": srv_obj.env,
                    }
    return mcp_servers


def execute_tool(fn_name: str, args: dict, tool_def: dict, user_data: dict,
                 tenant, session_id: str, db: Session, mcp_servers: dict,
                 image_model: str = None, image_gen_model: str = None,
                 audio_model: str = None, video_model: str = None,
                 video_gen_model: str = None) -> tuple:
    """
    Dispatch a single tool call and return (command, exec_res, tool_result).

    exec_res is always a dict with keys: stdout, stderr, exit_code,
    execution_time_ms, sandbox_type, generated_files (optional).
    """
    if not session_id:
        session_id = f"session-{tenant.id}" if tenant else "default-session"
    if not tool_def:
        tool_result = f"Error: Tool {fn_name} not found in skill registry."
        exec_res = {
            "stdout": "", "stderr": tool_result,
            "exit_code": 1, "execution_time_ms": 0, "sandbox_type": "process"
        }
        return f"Error: Tool {fn_name}", exec_res, tool_result

    exec_tool_def = resolve_user_data_placeholders(copy.deepcopy(tool_def), user_data)
    exec_args = resolve_user_data_placeholders(copy.deepcopy(args), user_data)
    tool_type = tool_def.get("type", "shell")

    if tool_type in ("http", "rest_api", "api"):
        from executors.http_executor import http_executor
        exec_res = http_executor.execute(tool_def=exec_tool_def, arguments=exec_args)
        command = f"{tool_def.get('method', 'GET')} {tool_def.get('url')} params={json.dumps(args)}"

    elif tool_type in ("mcp", "mcp_stdio"):
        from executors.mcp_executor import mcp_executor
        exec_res = mcp_executor.execute(tool_def=exec_tool_def, arguments=exec_args)
        command = f"MCP tool {tool_def.get('name', fn_name)} params={json.dumps(args)}"

    elif tool_type == "mcp_server":
        srv_id = tool_def.get("mcp_server_id")
        srv_data = mcp_servers.get(srv_id)
        if not srv_data:
            from models import McpServer
            srv_obj = db.query(McpServer).filter(McpServer.id == srv_id).first()
            if not srv_obj:
                tool_result = f"Error: MCP server {srv_id} not found."
                return f"Error: MCP server not found", {"stdout": "", "stderr": tool_result, "exit_code": 1, "execution_time_ms": 0}, tool_result
            srv_data = {"name": srv_obj.name, "transport": srv_obj.transport, "command": srv_obj.command, "url": srv_obj.url, "env": srv_obj.env}

        from mcp_manager import mcp_manager
        real_tool_name = tool_def.get("name", fn_name)
        srv_obj = SimpleMcpServerObj(**srv_data)
        exec_res = mcp_manager.call_tool_sync(srv_obj, real_tool_name, exec_args)
        command = f"MCP [{srv_data['name']}] call {real_tool_name}({json.dumps(args)})"

    else:
        # Shell-based or built-in dispatch
        exec_command = exec_tool_def.get("command", "")
        code = exec_args.get("code") if tool_type == "code" else None
        if tool_type == "code" and code:
            command = code
        else:
            command = exec_command or fn_name
        tenant_name = tenant.name if tenant else "default"

        if fn_name in ("list_sandbox_files", "sandbox_file_manager__list_sandbox_files"):
            exec_res = run_list_sandbox_files(db, session_id=session_id, tenant=tenant)
        elif fn_name in ("download_sandbox_file", "sandbox_file_manager__download_sandbox_file"):
            exec_res = run_download_sandbox_file(db, session_id=session_id, args=exec_args, tenant=tenant)
        elif fn_name in ("upload_sandbox_file", "sandbox_file_manager__upload_sandbox_file", "upload_file_to_sandbox"):
            exec_res = run_upload_sandbox_file(db, session_id=session_id, args=exec_args, tenant=tenant)
        elif fn_name in ("download_from_storage", "cloud_storage__download_from_storage"):
            exec_res = run_download_from_storage_tool(db, args=exec_args, tenant=tenant)
        elif fn_name in ("upload_to_storage", "cloud_storage__upload_to_storage"):
            exec_res = run_upload_to_storage_tool(db, args=exec_args, tenant=tenant, session_id=session_id)
        elif fn_name in ("download_public_file", "http_fetcher__download_public_file"):
            exec_res = run_download_public_file_tool(db, args=exec_args, tenant=tenant)
        elif fn_name in ("send_email", "email__send_email"):
            exec_res = run_send_email_tool(db, args=exec_args, tenant=tenant)
        elif fn_name in ("artifact_editor__open_or_update_artifact", "open_or_update_artifact"):
            exec_res = run_open_or_update_artifact(db, exec_args, tenant, session_id=session_id)
        elif fn_name in ("artifact_editor__open_uploaded_file_as_artifact", "open_uploaded_file_as_artifact"):
            exec_res = run_open_uploaded_file_as_artifact(db, exec_args, tenant, session_id=session_id)
        elif fn_name in ("artifact_editor__search_artifacts", "artifact_search"):
            exec_res = run_artifact_search(db, exec_args)
        elif fn_name in ("artifact_editor__artifact_semantic_search", "artifact_semantic_search"):
            exec_res = run_artifact_semantic_search(db, exec_args)
        elif fn_name in ("artifact_editor__edit_artifact_section", "edit_artifact_section"):
            exec_res = run_edit_artifact_section(db, exec_args, author="assistant", session_id=session_id)
        elif fn_name in ("artifact_editor__patch_artifact", "patch_artifact"):
            exec_res = run_patch_artifact(db, exec_args, author="assistant", session_id=session_id)
        elif fn_name in ("artifact_editor__rollback_artifact_block", "rollback_artifact_block"):
            exec_res = run_rollback_artifact_block(db, exec_args, author="assistant", session_id=session_id)
        elif fn_name.startswith("media_generator__") or fn_name in ("generate_image", "generate_video"):
            exec_res = run_multimodal_subagent_tool(
                db=db,
                args=exec_args,
                tenant=tenant,
                session_id=session_id,
                tool_name=fn_name,
                image_model=image_model,
                image_gen_model=image_gen_model,
                audio_model=audio_model,
                video_model=video_model,
                video_gen_model=video_gen_model
            )
        elif fn_name.startswith("multimodal_analyst__") or fn_name in ("analyze_image", "analyze_audio", "analyze_video"):
            exec_res = run_multimodal_subagent_tool(
                db=db,
                args=exec_args,
                tenant=tenant,
                session_id=session_id,
                tool_name=fn_name,
                image_model=image_model,
                image_gen_model=image_gen_model,
                audio_model=audio_model,
                video_model=video_model,
                video_gen_model=video_gen_model
            )
        else:
            exec_res = sandbox_manager.execute(command=exec_command, code=code, session_id=session_id, tenant_id=tenant.id if tenant else None, tenant_folder=tenant_name)

    tool_result = exec_res.get("stdout") or exec_res.get("stderr") or "Execution completed cleanly with no output."
    generated_files = exec_res.get("generated_files", [])
    if generated_files:
        lines = []
        for f in generated_files:
            if isinstance(f, dict):
                orig = f.get('original_name') or f.get('filename') or 'file'
                url = f.get('url', '')
                path = f.get('sandbox_path', '')
                lines.append(f"- {orig} (URL: {url}, Sandbox Path: {path})")
            elif isinstance(f, str):
                lines.append(f"- {f}")
        if lines:
            tool_result += "\n\nGenerated files:\n" + "\n".join(lines)

    return command, exec_res, tool_result
