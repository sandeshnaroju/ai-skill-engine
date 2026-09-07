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
import os
import json
import time
import openai
from concurrent.futures import ThreadPoolExecutor, as_completed
from sqlalchemy.orm import Session

from engine.usage import get_model_rates, update_request_usage
from engine.limits import check_tenant_quotas, truncate_tool_output, estimate_messages_tokens, generate_prochat_quota_ui
from engine.messages import resolve_user_data_placeholders
from engine.tool_executor import execute_tool, prefetch_mcp_servers
from engine.prochat import get_prochat_ui, stream_prochat_ui
from engine.session import (
    get_or_create_session, save_message,
    create_chat_request, finalize_request, resolve_allowed_skills
)

from models import Tenant, ExecutionLog, ChatMessage
from database import SessionLocal
from llm_client import get_llm_client, get_model_name
from skill_registry import skill_registry


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _chunk(session_id: str, model_name: str, **delta_fields) -> str:
    """Build and serialise a single SSE chat completion chunk."""
    return f"data: {json.dumps({'id': f'chatcmpl-{session_id}', 'object': 'chat.completion.chunk', 'created': 1700000000, 'model': model_name, 'choices': [{'index': 0, 'delta': delta_fields, 'finish_reason': None}]})}\n\n"


def _resolve_local_image_to_base64(url: str) -> str:
    """Resolve a relative file URL, localhost URL, or local sandbox path to a data:<mime>;base64 URI."""
    if not url or not isinstance(url, str):
        return url
    if url.startswith("data:"):
        return url.replace("\n", "").strip()

    import urllib.parse
    import mimetypes
    import base64

    is_local_url = any(url.startswith(p) for p in [
        "/", "http://localhost", "https://localhost",
        "http://127.0.0.1", "https://127.0.0.1",
        "http://0.0.0.0", "https://0.0.0.0",
        "http://host.docker.internal", "sandbox/"
    ])

    # If it's a truly external public internet URL (e.g., https://example.com/img.png), leave it as-is
    if not is_local_url and (url.startswith("http://") or url.startswith("https://")):
        return url

    # Clean and unquote url path
    unquoted = urllib.parse.unquote(url)
    if "://" in unquoted:
        # Strip scheme & host
        unquoted = "/" + unquoted.split("://", 1)[-1].split("/", 1)[-1]

    cleaned = unquoted.split("?")[0].lstrip("/")
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    possible_paths = [
        cleaned,
        os.path.join(base_dir, cleaned),
        os.path.join(base_dir, "sandbox", cleaned),
        os.path.join(base_dir, "sandbox", "uploads", cleaned),
        os.path.join(base_dir, "sandbox", "outputs", cleaned)
    ]

    filename = os.path.basename(cleaned)
    if filename:
        possible_paths.append(os.path.join(base_dir, "sandbox", "uploads", "default", filename))
        possible_paths.append(os.path.join(base_dir, "sandbox", "outputs", "default", filename))
        
        # Search all subdirectories in sandbox/uploads and sandbox/outputs
        for sub_dir_name in ("uploads", "outputs"):
            sub_root = os.path.join(base_dir, "sandbox", sub_dir_name)
            if os.path.exists(sub_root):
                for entry in os.listdir(sub_root):
                    tenant_dir = os.path.join(sub_root, entry)
                    if os.path.isdir(tenant_dir):
                        possible_paths.append(os.path.join(tenant_dir, filename))
                        # Also check if filename is part of a file in that directory
                        for fn in os.listdir(tenant_dir):
                            if fn == filename or fn.endswith(f"_{filename}") or filename in fn:
                                possible_paths.append(os.path.join(tenant_dir, fn))

    for p in possible_paths:
        if os.path.isfile(p):
            try:
                mime_type, _ = mimetypes.guess_type(p)
                if not mime_type:
                    ext = os.path.splitext(p)[1].lower()
                    mime_map = {
                        ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                        ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
                        ".bmp": "image/bmp", ".tiff": "image/tiff",
                        ".pdf": "application/pdf", ".mp3": "audio/mp3", ".wav": "audio/wav",
                        ".ogg": "audio/ogg", ".m4a": "audio/mp4"
                    }
                    mime_type = mime_map.get(ext, "image/png")
                with open(p, "rb") as f:
                    encoded = base64.b64encode(f.read()).decode("utf-8").replace("\n", "").strip()
                return f"data:{mime_type};base64,{encoded}"
            except Exception:
                pass
    return url


def _normalize_multimodal_content(content):
    """Ensure all multimodal formats (OpenAI, Google Gemini, Anthropic Claude, xAI Grok, DeepSeek)
    are normalized to valid OpenAI chat completion standards for execution."""
    if isinstance(content, str):
        if content.startswith("[") and ("image_url" in content or '"type":' in content or '"source":' in content):
            try:
                content = json.loads(content)
            except Exception:
                return content
        else:
            return content

    if not isinstance(content, list):
        return content

    normalized = []
    for part in content:
        if not isinstance(part, dict):
            normalized.append(part)
            continue

        p_type = part.get("type")

        # 1. Anthropic Native Format: {"type": "image" | "document", "source": {"type": "base64", "media_type": "...", "data": "..."}}
        if p_type in ("image", "document") and isinstance(part.get("source"), dict):
            src = part["source"]
            media_type = src.get("media_type") or ("application/pdf" if p_type == "document" else "image/png")
            raw_data = src.get("data", "").replace("\n", "").strip()
            if not raw_data.startswith("data:"):
                data_uri = f"data:{media_type};base64,{raw_data}"
            else:
                data_uri = raw_data
            normalized.append({
                "type": "image_url",
                "image_url": {"url": data_uri}
            })

        # 2. OpenAI / Google Gemini / Grok / DeepSeek format: {"type": "image_url", "image_url": {"url": "..."}}
        elif p_type in ("image_url", "input_image"):
            img_obj = part.get("image_url", {})
            if isinstance(img_obj, dict):
                raw_url = img_obj.get("url", "")
                resolved_url = _resolve_local_image_to_base64(raw_url)
                normalized.append({
                    "type": "image_url",
                    "image_url": {
                        "url": resolved_url,
                        **({"detail": img_obj["detail"]} if "detail" in img_obj else {})
                    }
                })
            elif isinstance(img_obj, str):
                resolved_url = _resolve_local_image_to_base64(img_obj)
                normalized.append({
                    "type": "image_url",
                    "image_url": {"url": resolved_url}
                })
            elif part.get("url"):
                resolved_url = _resolve_local_image_to_base64(part["url"])
                normalized.append({
                    "type": "image_url",
                    "image_url": {"url": resolved_url}
                })
            else:
                normalized.append(part)

        # 3. Audio format: {"type": "input_audio", "input_audio": {"data": "...", "format": "wav" | "mp3"}}
        elif p_type == "input_audio":
            audio_obj = part.get("input_audio", {})
            raw_data = audio_obj.get("data", "")
            if raw_data and not raw_data.startswith("data:"):
                raw_data = _resolve_local_image_to_base64(raw_data)
                if raw_data.startswith("data:"):
                    raw_data = raw_data.split(",", 1)[-1]
            raw_data = raw_data.replace("\n", "").strip()
            normalized.append({
                "type": "input_audio",
                "input_audio": {
                    "data": raw_data,
                    "format": audio_obj.get("format", "wav")
                }
            })

        # 4. Standard text or other payload blocks
        else:
            normalized.append(part)

    return normalized


def _build_messages(db, persist, session_obj, user_message, allowed_skills, user_data, client_messages, tenant_id=None, raw_session_id=None):
    """Build the messages list for the LLM call."""
    sys_content = skill_registry.get_system_instructions(allowed_skills=allowed_skills, tenant_id=tenant_id)
    if user_data:
        sys_content = resolve_user_data_placeholders(sys_content, user_data)
    msgs = [{"role": "system", "content": sys_content}]

    if persist and session_obj:
        db_messages = db.query(ChatMessage).filter(
            ChatMessage.session_id == session_obj.id
        ).order_by(ChatMessage.created_at.asc()).all()

        # If client supplied full history and db is missing previous turns, backfill db
        if len(db_messages) <= 1 and client_messages and len(client_messages) > 1:
            for cm in client_messages[:-1]:
                r = cm.get("role")
                c = cm.get("content")
                if r in ("user", "assistant") and c:
                    save_message(db, session_obj, r, content=json.dumps(c) if not isinstance(c, str) else c)
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
                content_val = _normalize_multimodal_content(content_val)
                msgs.append({"role": msg.role, "content": content_val})

        # Inject active canvas artifacts context into system prompt
        from models import SessionArtifact
        sess_keys = [session_obj.session_id, session_obj.id]
        if raw_session_id and raw_session_id not in sess_keys:
            sess_keys.append(raw_session_id)

        artifacts = db.query(SessionArtifact).filter(
            SessionArtifact.tenant_id == tenant_id,
            SessionArtifact.session_id.in_(sess_keys)
        ).all()
        if artifacts:
            artifact_context = "\n\n[ACTIVE CANVAS ARTIFACTS IN THIS CONVERSATION]\n"
            for art in artifacts:
                outline_items = ", ".join([f"{b.block_key} ('{b.title}')" for b in art.blocks])
                artifact_context += f"- Artifact ID: {art.id} | Title: '{art.title}' | File: '{art.filename}' | Version: {art.current_version}\n  Blocks: {outline_items}\n"
            artifact_context += (
                "To modify existing documents or code, use `artifact_editor__edit_artifact_section` or `artifact_editor__patch_artifact` "
                "with the exact `artifact_id` and `block_key`. Use `artifact_editor__artifact_search` or `artifact_editor__artifact_semantic_search` "
                "if you need to find specific sections or concepts. Never regenerate the entire document if only a section needs editing."
            )
            msgs[0]["content"] += artifact_context
    else:
        if client_messages:
            for m in client_messages:
                if m.get("role") == "system":
                    msgs[0]["content"] += "\n\n" + str(m.get("content", ""))
                else:
                    norm_content = _normalize_multimodal_content(m.get("content"))
                    msgs.append({"role": m.get("role"), "content": norm_content})
        else:
            msgs.append({"role": "user", "content": _normalize_multimodal_content(user_message)})

        # For stateless API calls, check if an existing artifact exists for this tenant & session_id
        if tenant_id and raw_session_id:
            from models import SessionArtifact
            artifacts = db.query(SessionArtifact).filter(
                SessionArtifact.tenant_id == tenant_id,
                SessionArtifact.session_id == raw_session_id
            ).all()
            if artifacts:
                artifact_context = "\n\n[ACTIVE CANVAS ARTIFACTS IN THIS CONVERSATION]\n"
                for art in artifacts:
                    outline_items = ", ".join([f"{b.block_key} ('{b.title}')" for b in art.blocks])
                    artifact_context += f"- Artifact ID: {art.id} | Title: '{art.title}' | File: '{art.filename}' | Version: {art.current_version}\n  Blocks: {outline_items}\n"
                artifact_context += (
                    "To modify existing documents or code, use `artifact_editor__edit_artifact_section` or `artifact_editor__patch_artifact` "
                    "with the exact `artifact_id` and `block_key`. Use `artifact_editor__artifact_search` or `artifact_editor__artifact_semantic_search` "
                    "if you need to find specific sections or concepts. Never regenerate the entire document if only a section needs editing."
                )
                msgs[0]["content"] += artifact_context

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
    arts_map = {}
    for fn_name, args, tc_id, skill_name, command, exec_res, tool_result in results:
        art_d = exec_res.get("artifact_data")
        if art_d and isinstance(art_d, dict):
            art_id = art_d.get("id") or art_d.get("artifact_id") or f"art_{len(arts_map)}"
            arts_map[art_id] = art_d

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
            "generated_files": exec_res.get("generated_files", []),
            "artifact_data": exec_res.get("artifact_data")
        })

        safe_tool_result = truncate_tool_output(tool_result)
        messages.append({"role": "tool", "tool_call_id": tc_id, "content": safe_tool_result})
        if persist and session_obj:
            save_message(db, session_obj, "tool", content=safe_tool_result, tool_call_id=tc_id)
    return list(arts_map.values())


def _prepare_completion_kwargs(
    model_name: str,
    messages: list,
    llm,
    is_stream: bool = False,
    available_tools: list = None,
    turn: int = 0,
    max_turns: int = 25,
    temperature: float = None,
    top_p: float = None,
    top_k: int = None,
    max_tokens: int = None,
    max_completion_tokens: int = None,
    presence_penalty: float = None,
    frequency_penalty: float = None,
    stop = None,
    seed: int = None,
    response_format: dict = None,
    tool_choice = None,
    user: str = None,
    reasoning_effort: str = None,
    thinking_budget: int = None,
    openrouter_provider: dict = None,
    openrouter_models: list = None,
    extra_body: dict = None,
    store: bool = None,
    metadata: dict = None,
    service_tier: str = None,
    safety_identifier: str = None,
    prompt_cache_key: str = None,
    prompt_cache_options: dict = None,
    verbosity: str = None,
) -> dict:
    """Build a validated, provider-aware arguments dictionary for chat.completions.create."""
    m_lower = model_name.lower()
    base_url_str = str(getattr(llm, "base_url", "")).lower()
    is_gemini = "gemini" in m_lower or "generativelanguage.googleapis.com" in base_url_str
    is_prochat = "prochat" in m_lower or "prochat.dev" in base_url_str or m_lower.startswith("genui")
    is_openrouter = "openrouter" in m_lower or "openrouter.ai" in base_url_str
    is_deepseek = "deepseek" in m_lower or "api.deepseek.com" in base_url_str
    is_grok = "grok" in m_lower or "api.x.ai" in base_url_str
    is_openai_reasoning = any(k in m_lower for k in ["o1", "o3", "o4"])

    kwargs = {"model": model_name, "messages": messages}
    if is_stream:
        kwargs["stream"] = True

    # 1. Tools & Tool Choice
    if available_tools and turn < max_turns - 1:
        kwargs["tools"] = available_tools
        if tool_choice:
            kwargs["tool_choice"] = tool_choice

    # 2. Temperature & Top P
    if temperature is not None:
        if not is_openai_reasoning:
            try:
                kwargs["temperature"] = float(temperature)
            except Exception:
                pass

    if top_p is not None:
        try:
            kwargs["top_p"] = float(top_p)
        except Exception:
            pass

    # 3. Max Tokens / Max Completion Tokens
    if is_openai_reasoning:
        tokens = max_completion_tokens if max_completion_tokens is not None else max_tokens
        if tokens is not None:
            try:
                kwargs["max_completion_tokens"] = int(tokens)
            except Exception:
                pass
    else:
        if max_completion_tokens is not None:
            try:
                kwargs["max_completion_tokens"] = int(max_completion_tokens)
            except Exception:
                pass
        if max_tokens is not None:
            try:
                kwargs["max_tokens"] = int(max_tokens)
            except Exception:
                pass

    # 4. Stop Sequences
    if stop:
        if isinstance(stop, str):
            if "," in stop:
                kwargs["stop"] = [s.strip() for s in stop.split(",") if s.strip()]
            else:
                kwargs["stop"] = [stop.strip()] if stop.strip() else None
        elif isinstance(stop, list):
            kwargs["stop"] = stop

    # 5. Seed (Gemini and ProChat reject seed with 'Unknown name "seed"')
    if seed is not None and not (is_gemini or is_prochat):
        try:
            kwargs["seed"] = int(seed)
        except Exception:
            pass

    # 6. Response Format
    if response_format and isinstance(response_format, dict):
        kwargs["response_format"] = response_format

    # 7. User
    if user:
        kwargs["user"] = str(user)

    # 8. Presence & Frequency Penalty
    # Gemini and ProChat reject presence_penalty and frequency_penalty with 400
    if not (is_gemini or is_prochat):
        if presence_penalty is not None:
            try:
                kwargs["presence_penalty"] = float(presence_penalty)
            except Exception:
                pass
        if frequency_penalty is not None:
            try:
                kwargs["frequency_penalty"] = float(frequency_penalty)
            except Exception:
                pass

    # 9. Stream Options (Gemini & ProChat reject stream_options with 400)
    if is_stream and not (is_gemini or is_prochat):
        kwargs["stream_options"] = {"include_usage": True}

    # 10. Modern OpenAI Parameters (gpt-4o, gpt-5, o1/o3/o4, Responses API compatibility)
    if not (is_gemini or is_prochat):
        if store is not None:
            kwargs["store"] = bool(store)
        if metadata and isinstance(metadata, dict):
            kwargs["metadata"] = metadata
        if service_tier:
            kwargs["service_tier"] = str(service_tier)
        if safety_identifier:
            kwargs["safety_identifier"] = str(safety_identifier)
        if prompt_cache_key:
            kwargs["prompt_cache_key"] = str(prompt_cache_key)
        if prompt_cache_options and isinstance(prompt_cache_options, dict):
            kwargs["prompt_cache_options"] = prompt_cache_options
        if verbosity:
            kwargs["verbosity"] = str(verbosity)

    # 11. Provider-specific Extra Body / Extensions
    merged_extra_body = dict(extra_body) if extra_body and isinstance(extra_body, dict) else {}

    # OpenRouter specifics
    if is_openrouter or openrouter_provider or openrouter_models or top_k is not None:
        if top_k is not None:
            try:
                kwargs["top_k"] = int(top_k)
            except Exception:
                pass
        if openrouter_provider and isinstance(openrouter_provider, dict):
            merged_extra_body["provider"] = openrouter_provider
        if openrouter_models and isinstance(openrouter_models, list):
            merged_extra_body["models"] = openrouter_models

    # Reasoning / Thinking configuration
    # According to official Google Gemini OpenAI compatibility docs:
    # 1. Top-level parameter: `reasoning_effort` ("minimal", "low", "medium", "high", "none")
    #    - "minimal" maps to minimal thinking_level (e.g. Gemini 3.1 Flash-Lite, 3 Flash)
    #    - "low", "medium", "high" map to thinking_level or budget (2.5)
    #    - "none" turns off thinking (supported on 2.5 Flash, 3.7 Flash; not supported on 2.5 Pro)
    # 2. Or custom Gemini extension via `extra_body: {"google": {"thinking_config": {"thinking_level": "...", "include_thoughts": True}}}`
    #    Note: In OpenAI Python client, passing `extra_body={'extra_body': {'google': ...}}` maps to JSON `{"extra_body": {"google": ...}}`.
    if is_gemini or is_prochat:
        if reasoning_effort:
            val = str(reasoning_effort).strip().lower()
            if val in ("minimal", "low", "medium", "high", "none"):
                kwargs["reasoning_effort"] = val

        # If user passes extra_body with google thinking_config, wrap appropriately for OpenAI Python SDK
        if "google" in merged_extra_body:
            g_val = merged_extra_body.pop("google")
            merged_extra_body["extra_body"] = {"google": g_val}
        elif "thinking_config" in merged_extra_body:
            tc_val = merged_extra_body.pop("thinking_config")
            merged_extra_body["extra_body"] = {"google": {"thinking_config": tc_val}}
    elif is_openrouter:
        if reasoning_effort or thinking_budget is not None:
            r_obj = {}
            # In OpenRouter, effort and max_tokens are mutually exclusive:
            # If max_tokens is set, it overrides or effort is omitted; otherwise effort is sent.
            if thinking_budget is not None:
                try:
                    r_obj["max_tokens"] = int(thinking_budget)
                except Exception:
                    pass
            elif reasoning_effort:
                r_obj["effort"] = str(reasoning_effort).strip().lower()

            if r_obj:
                merged_extra_body["reasoning"] = r_obj
            elif reasoning_effort:
                kwargs["reasoning_effort"] = str(reasoning_effort).strip().lower()
    elif is_deepseek:
        # DeepSeek Chat Completion API specification:
        # - reasoning_effort: "low", "high", "max" (defaults to "high"; "medium" and "xhigh" are automatically mapped to "high")
        # - thinking: {"type": "enabled" | "disabled"} in extra_body controls thinking mode switch
        if reasoning_effort:
            r_val = str(reasoning_effort).strip().lower()
            if r_val in ("low", "high", "max"):
                kwargs["reasoning_effort"] = r_val
            elif r_val in ("medium", "xhigh"):
                kwargs["reasoning_effort"] = "high"
            elif r_val == "none":
                merged_extra_body["thinking"] = {"type": "disabled"}

        if thinking_budget is not None or reasoning_effort in ("low", "medium", "high", "max"):
            if "thinking" not in merged_extra_body:
                merged_extra_body["thinking"] = {"type": "enabled"}
    elif is_grok:
        # xAI Grok Chat Completion API specification:
        # reasoning_effort: "none" (disables reasoning), "low", "medium", "high", "xhigh"
        if reasoning_effort:
            r_val = str(reasoning_effort).strip().lower()
            if r_val in ("none", "low", "medium", "high", "xhigh"):
                kwargs["reasoning_effort"] = r_val
            elif r_val == "max":
                kwargs["reasoning_effort"] = "xhigh"
    else:
        if reasoning_effort:
            kwargs["reasoning_effort"] = reasoning_effort
        elif is_openai_reasoning:
            kwargs["reasoning_effort"] = "medium"

        if thinking_budget is not None:
            merged_extra_body["thinking"] = {"type": "enabled", "budget_tokens": int(thinking_budget)}

    # DeepSeek R1 / Reasoner compatibility flag
    if any(k in m_lower for k in ["deepseek-r1", "deepseek-reasoner", "r1"]):
        merged_extra_body["include_reasoning"] = True

    if merged_extra_body:
        kwargs["extra_body"] = merged_extra_body

    return kwargs


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
        temperature: float = None,
        top_p: float = None,
        top_k: int = None,
        max_tokens: int = None,
        max_completion_tokens: int = None,
        presence_penalty: float = None,
        frequency_penalty: float = None,
        stop = None,
        seed: int = None,
        response_format: dict = None,
        tool_choice = None,
        user: str = None,
        reasoning_effort: str = None,
        thinking_budget: int = None,
        openrouter_provider: dict = None,
        openrouter_models: list = None,
        extra_body: dict = None,
        store: bool = None,
        metadata: dict = None,
        service_tier: str = None,
        safety_identifier: str = None,
        prompt_cache_key: str = None,
        prompt_cache_options: dict = None,
        verbosity: str = None,
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
            messages = _build_messages(db, persist, session_obj, user_message, allowed_skills, user_data, client_messages, tenant_id=tenant.id, raw_session_id=session_id)
            model_name = _resolve_model(db, tenant, model_name)
            chat_req.model_name = model_name
            db.commit()

            in_r, out_r, au_in_r, au_out_r = get_model_rates(db, tenant.id, model_name)
            llm = get_llm_client(db=db, tenant_id=tenant.id, model_name=model_name)
            available_tools = skill_registry.get_openai_tools(allowed_skills=allowed_skills, tenant_id=tenant.id)
            executed_logs = []

            # ── Pre-flight Quota & Limit Check ──────────────────────────────
            is_breached, quota_msg = check_tenant_quotas(db, tenant, session_id, messages, model_name, secondary_model=prochat_model)
            if is_breached:
                prochat_json, prochat_code = None, None
                if prochat_model:
                    prochat_json, prochat_code = generate_prochat_quota_ui(quota_msg)

                if persist and session_obj:
                    save_message(db, session_obj, "assistant", content=quota_msg)
                finalize_request(db, chat_req, quota_msg, executed_logs, start_time,
                                 usage_obj=None, in_rate=in_r, out_rate=out_r, au_in_rate=au_in_r, au_out_rate=au_out_r, model_name=model_name)
                return {
                    "response": quota_msg, "json": prochat_json, "code": prochat_code,
                    "session_id": session_id, "request_id": request_id,
                    "tenant": tenant.name, "executed_tools": [],
                    "artifacts": []
                }

            accumulated_artifacts = {}
            for turn in range(max_turns):
                if turn == max_turns - 1:
                    messages.append({"role": "user", "content": "[System Notice: Maximum tool execution turns reached. You can no longer call any tools. Please summarize the tool outputs and provide your final response to the user.]"})

                kwargs = _prepare_completion_kwargs(
                    model_name=model_name,
                    messages=messages,
                    llm=llm,
                    is_stream=False,
                    available_tools=available_tools,
                    turn=turn,
                    max_turns=max_turns,
                    temperature=temperature,
                    top_p=top_p,
                    top_k=top_k,
                    max_tokens=max_tokens,
                    max_completion_tokens=max_completion_tokens,
                    presence_penalty=presence_penalty,
                    frequency_penalty=frequency_penalty,
                    stop=stop,
                    seed=seed,
                    response_format=response_format,
                    tool_choice=tool_choice,
                    user=user,
                    reasoning_effort=reasoning_effort,
                    thinking_budget=thinking_budget,
                    openrouter_provider=openrouter_provider,
                    openrouter_models=openrouter_models,
                    extra_body=extra_body,
                    store=store,
                    metadata=metadata,
                    service_tier=service_tier,
                    safety_identifier=safety_identifier,
                    prompt_cache_key=prompt_cache_key,
                    prompt_cache_options=prompt_cache_options,
                    verbosity=verbosity,
                )

                try:
                    response = llm.chat.completions.create(**kwargs)
                except openai.BadRequestError as e:
                    err_str = str(e).lower()
                    if any(k in err_str for k in ["context_length", "maximum context", "token limit", "too large", "prompt is too long", "maximum allowed tokens"]):
                        quota_msg = (
                            "ContextLengthExceeded: Context memory limit reached for this model. "
                            "The conversation context and tool outputs exceed the model's active physical context window. "
                            "Please start a new conversation session to continue."
                        )
                        prochat_json, prochat_code = None, None
                        if prochat_model:
                            prochat_json, prochat_code = generate_prochat_quota_ui(quota_msg)

                        if persist and session_obj:
                            save_message(db, session_obj, "assistant", content=quota_msg)
                        finalize_request(db, chat_req, quota_msg, executed_logs, start_time,
                                         usage_obj=None, in_rate=in_r, out_rate=out_r, au_in_rate=au_in_r, au_out_rate=au_out_r, model_name=model_name)
                        return {
                            "response": quota_msg, "json": prochat_json, "code": prochat_code,
                            "session_id": session_id, "request_id": request_id,
                            "tenant": tenant.name, "executed_tools": executed_logs,
                            "artifacts": []
                        }
                    raise e

                response_msg = response.choices[0].message
                tool_calls = response_msg.tool_calls

                if tool_calls:
                    tool_calls_dict = [tc.model_dump() if hasattr(tc, 'model_dump') else tc.dict() for tc in tool_calls]
                    for tc in tool_calls_dict:
                        tc["type"] = "function"

                    if persist and session_obj:
                        save_message(db, session_obj, "assistant", content=response_msg.content, tool_calls=tool_calls_dict)
                    messages.append({"role": "assistant", "content": response_msg.content if response_msg.content else None, "tool_calls": tool_calls_dict})

                    mcp_servers = prefetch_mcp_servers(tool_calls_dict, db, tenant_id=tenant.id)

                    def run_one(tc):
                        fn = tc["function"]["name"]
                        try:
                            args = json.loads(tc["function"]["arguments"])
                        except Exception:
                            args = {}
                        skill_name, tool_def = skill_registry.find_tool(fn, tenant_id=tenant.id)
                        worker_db = SessionLocal()
                        try:
                            command, exec_res, tool_result = execute_tool(fn, args, tool_def, user_data, tenant, session_id, worker_db, mcp_servers)
                            worker_db.commit()
                        except Exception as e:
                            worker_db.rollback()
                            command = ""
                            exec_res = {"error": str(e), "exit_code": 1, "execution_time_ms": 0}
                            tool_result = f"Error executing tool {fn}: {e}"
                        finally:
                            worker_db.close()
                        return fn, args, tc["id"], skill_name, command, exec_res, tool_result

                    with ThreadPoolExecutor() as executor:
                        results = list(executor.map(run_one, tool_calls_dict))

                    turn_arts = _log_and_append_tool_results(db, tenant, session_id, model_name, request_source,
                                                            request_id, results, messages, executed_logs, persist, session_obj)
                    for a in turn_arts:
                        a_id = a.get("id") or a.get("artifact_id") or f"art_{len(accumulated_artifacts)}"
                        accumulated_artifacts[a_id] = a

                    # Post-tool-turn Quota / Context check before next turn
                    is_breached, quota_msg = check_tenant_quotas(db, tenant, session_id, messages, model_name)
                    if is_breached:
                        messages.append({"role": "user", "content": f"[System Notice: {quota_msg}. Please provide your final answer to the user now without invoking any further tools.]"})
                        available_tools = []

                else:
                    final_answer = response_msg.content or ""
                    extracted_json, extracted_code = None, None
                    if prochat_model:
                        res_tuple = get_prochat_ui(db, tenant, messages, final_answer, prochat_model)
                        if res_tuple:
                            extracted_json, extracted_code, prochat_usage, prochat_rates = res_tuple
                            if prochat_usage and prochat_rates:
                                pin_r, pout_r, pau_in_r, pau_out_r = prochat_rates
                                update_request_usage(chat_req, prochat_usage, pin_r, pout_r, pau_in_r, pau_out_r, is_secondary=True, model_name=prochat_model or "genui-mars-0.1")

                    arts_list = list(accumulated_artifacts.values())
                    if persist and session_obj:
                        save_message(db, session_obj, "assistant", content=final_answer, json_data=extracted_json, code=extracted_code, artifact_data=arts_list if arts_list else None)

                    finalize_request(db, chat_req, final_answer, executed_logs, start_time,
                                     getattr(response, "usage", None), in_r, out_r, au_in_r, au_out_r, model_name=model_name)
                    return {
                        "response": final_answer, "json": extracted_json, "code": extracted_code,
                        "session_id": session_id, "request_id": request_id,
                        "tenant": tenant.name, "executed_tools": executed_logs,
                        "artifacts": arts_list
                    }

            # Max turns reached
            final_res = messages[-1].get("content") or "Reached maximum tool execution turns."
            extracted_json, extracted_code = None, None
            if prochat_model:
                res_tuple = get_prochat_ui(db, tenant, messages, final_res, prochat_model)
                if res_tuple:
                    extracted_json, extracted_code, prochat_usage, prochat_rates = res_tuple
                    if prochat_usage and prochat_rates:
                        pin_r, pout_r, pau_in_r, pau_out_r = prochat_rates
                        update_request_usage(chat_req, prochat_usage, pin_r, pout_r, pau_in_r, pau_out_r, is_secondary=True, model_name=prochat_model or "genui-mars-0.1")
            arts_list = list(accumulated_artifacts.values())
            if persist and session_obj:
                save_message(db, session_obj, "assistant", content=final_res, json_data=extracted_json, code=extracted_code, artifact_data=arts_list if arts_list else None)
            finalize_request(db, chat_req, final_res, executed_logs, start_time,
                             getattr(response, "usage", None), in_r, out_r, au_in_r, au_out_r, model_name=model_name)
            return {
                "response": final_res, "json": extracted_json, "code": extracted_code,
                "session_id": session_id, "request_id": request_id,
                "tenant": tenant.name, "executed_tools": executed_logs,
                "artifacts": arts_list
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
        temperature: float = None,
        top_p: float = None,
        top_k: int = None,
        max_tokens: int = None,
        max_completion_tokens: int = None,
        presence_penalty: float = None,
        frequency_penalty: float = None,
        stop = None,
        seed: int = None,
        response_format: dict = None,
        tool_choice = None,
        user: str = None,
        reasoning_effort: str = None,
        thinking_budget: int = None,
        openrouter_provider: dict = None,
        openrouter_models: list = None,
        extra_body: dict = None,
        store: bool = None,
        metadata: dict = None,
        service_tier: str = None,
        safety_identifier: str = None,
        prompt_cache_key: str = None,
        prompt_cache_options: dict = None,
        verbosity: str = None,
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
            accumulated_usage = {"prompt_tokens": 0, "completion_tokens": 0}  # summed across all turns
            accumulated_artifacts = {}

            if persist:
                session_obj = get_or_create_session(db, tenant, session_id)
                save_message(db, session_obj, "user", content=user_message_db)

            allowed_skills = resolve_allowed_skills(db, tenant, app_id, skill_names)

            yield _chunk(session_id, model_name, reasoning="Analyzing query & active skills...")

            messages = _build_messages(db, persist, session_obj, user_message, allowed_skills, user_data, client_messages, tenant_id=tenant.id, raw_session_id=session_id)
            model_name = _resolve_model(db, tenant, model_name)
            chat_req.model_name = model_name
            db.commit()

            in_r, out_r, au_in_r, au_out_r = get_model_rates(db, tenant.id, model_name)
            llm = get_llm_client(db=db, tenant_id=tenant.id, model_name=model_name)
            available_tools = skill_registry.get_openai_tools(allowed_skills=allowed_skills, tenant_id=tenant.id)

            # ── Pre-flight Quota & Limit Check ──────────────────────────────
            is_breached, quota_msg = check_tenant_quotas(db, tenant, session_id, messages, model_name, secondary_model=prochat_model)
            if is_breached:
                prochat_json, prochat_code = None, None
                if prochat_model:
                    prochat_json, prochat_code = generate_prochat_quota_ui(quota_msg)

                if persist and session_obj:
                    save_message(db, session_obj, "assistant", content=quota_msg)
                finalize_request(db, chat_req, quota_msg, executed_logs, start_time,
                                 usage_obj=None, in_rate=in_r, out_rate=out_r, au_in_rate=au_in_r, au_out_rate=au_out_r, model_name=model_name)
                delta_payload = {"content": quota_msg}
                if prochat_model:
                    delta_payload["json"] = prochat_json
                    delta_payload["code"] = prochat_code

                yield f"data: {json.dumps({'id': f'chatcmpl-{session_id}', 'object': 'chat.completion.chunk', 'created': 1700000000, 'model': model_name, 'choices': [{'index': 0, 'delta': delta_payload, 'finish_reason': 'stop'}]})}\n\n"
                yield f"data: {json.dumps({'type': 'done', 'request_id': request_id, 'tools_called': 0, 'artifacts': []})}\n\n"
                yield "data: [DONE]\n\n"
                return

            for turn in range(max_turns):
                if turn == max_turns - 1:
                    messages.append({"role": "user", "content": "[System Notice: Maximum tool execution turns reached. You can no longer call any tools. Please summarize the tool outputs and provide your final response to the user.]"})

                if turn == 0:
                    turn_msg = "Analyzing conversation context & planning query execution..."
                else:
                    turn_msg = f"Processing tool outputs & synthesizing response (Turn {turn+1})..."
                yield _chunk(session_id, model_name, reasoning=turn_msg)

                kwargs = _prepare_completion_kwargs(
                    model_name=model_name,
                    messages=messages,
                    llm=llm,
                    is_stream=True,
                    available_tools=available_tools,
                    turn=turn,
                    max_turns=max_turns,
                    temperature=temperature,
                    top_p=top_p,
                    top_k=top_k,
                    max_tokens=max_tokens,
                    max_completion_tokens=max_completion_tokens,
                    presence_penalty=presence_penalty,
                    frequency_penalty=frequency_penalty,
                    stop=stop,
                    seed=seed,
                    response_format=response_format,
                    tool_choice=tool_choice,
                    user=user,
                    reasoning_effort=reasoning_effort,
                    thinking_budget=thinking_budget,
                    openrouter_provider=openrouter_provider,
                    openrouter_models=openrouter_models,
                    extra_body=extra_body,
                    store=store,
                    metadata=metadata,
                    service_tier=service_tier,
                    safety_identifier=safety_identifier,
                    prompt_cache_key=prompt_cache_key,
                    prompt_cache_options=prompt_cache_options,
                    verbosity=verbosity,
                )

                try:
                    response_stream = llm.chat.completions.create(**kwargs)
                except openai.BadRequestError as e:
                    err_str = str(e).lower()
                    if any(k in err_str for k in ["context_length", "maximum context", "token limit", "too large", "prompt is too long", "maximum allowed tokens"]):
                        quota_msg = (
                            "ContextLengthExceeded: Context memory limit reached for this model. "
                            "The conversation context and tool data exceed the model's active physical context window. "
                            "Please start a new conversation session to continue."
                        )
                        prochat_json, prochat_code = None, None
                        if prochat_model:
                            prochat_json, prochat_code = generate_prochat_quota_ui(quota_msg)

                        if persist and session_obj:
                            save_message(db, session_obj, "assistant", content=quota_msg)
                        finalize_request(db, chat_req, quota_msg, executed_logs, start_time,
                                         accumulated_usage if accumulated_usage["prompt_tokens"] else None,
                                         in_r, out_r, au_in_r, au_out_rate=au_out_r, model_name=model_name)
                        delta_payload = {"content": quota_msg}
                        if prochat_model:
                            delta_payload["json"] = prochat_json
                            delta_payload["code"] = prochat_code

                        yield f"data: {json.dumps({'id': f'chatcmpl-{session_id}', 'object': 'chat.completion.chunk', 'created': 1700000000, 'model': model_name, 'choices': [{'index': 0, 'delta': delta_payload, 'finish_reason': 'stop'}]})}\n\n"
                        yield f"data: {json.dumps({'type': 'done', 'request_id': request_id, 'tools_called': len(executed_logs), 'artifacts': list(accumulated_artifacts.values())})}\n\n"
                        yield "data: [DONE]\n\n"
                        return
                    raise e

                full_text = ""
                tool_calls_accumulator = {}
                id_to_index = {}
                last_idx = 0
                turn_usage = None
                in_think_tag = False

                for chunk in response_stream:
                    if getattr(chunk, "usage", None):
                        turn_usage = chunk.usage
                    if not chunk.choices:
                        continue
                    choice = chunk.choices[0]
                    delta = choice.delta

                    # 1. Extract dedicated reasoning / thought tokens (Gemini, DeepSeek, OpenRouter, Anthropic CoT)
                    raw_thought = (
                        getattr(delta, "reasoning_content", None) or
                        getattr(delta, "reasoning", None) or
                        getattr(delta, "thought", None) or
                        getattr(delta, "thoughts", None)
                    )
                    # Check extra_content for Google Gemini thought / reasoning
                    if not raw_thought:
                        extra_c = getattr(delta, "extra_content", None)
                        if isinstance(extra_c, dict):
                            g_data = extra_c.get("google") or {}
                            if isinstance(g_data, dict):
                                raw_thought = g_data.get("thought") or g_data.get("thought_signature")

                    thought_text = ""
                    if isinstance(raw_thought, str):
                        # If it is an opaque thought_signature hash, don't spam raw hash; indicate reasoning activity
                        if raw_thought.startswith("E") and len(raw_thought) > 100:
                            thought_text = "Thinking..."
                        else:
                            thought_text = raw_thought
                    elif isinstance(raw_thought, dict):
                        thought_text = raw_thought.get("text") or raw_thought.get("content") or json.dumps(raw_thought)

                    if thought_text:
                        yield _chunk(session_id, model_name, reasoning=thought_text)

                    # 2. Extract content & handle inline <think> tags (e.g., local Ollama / vLLM DeepSeek R1 models)
                    if delta.content:
                        content_piece = delta.content
                        if "<think>" in content_piece:
                            in_think_tag = True
                            parts = content_piece.split("<think>", 1)
                            if parts[0]:
                                full_text += parts[0]
                                yield f"data: {json.dumps({'id': f'chatcmpl-{session_id}', 'object': 'chat.completion.chunk', 'created': 1700000000, 'model': model_name, 'choices': [{'index': 0, 'delta': {'content': parts[0]}, 'finish_reason': choice.finish_reason}]})}\n\n"
                            content_piece = parts[1] if len(parts) > 1 else ""

                        if in_think_tag:
                            if "</think>" in content_piece:
                                think_part, rest = content_piece.split("</think>", 1)
                                if think_part:
                                    yield _chunk(session_id, model_name, reasoning=think_part)
                                in_think_tag = False
                                content_piece = rest
                            else:
                                if content_piece:
                                    yield _chunk(session_id, model_name, reasoning=content_piece)
                                content_piece = ""

                        if content_piece:
                            full_text += content_piece
                            final_answer = full_text
                            yield f"data: {json.dumps({'id': f'chatcmpl-{session_id}', 'object': 'chat.completion.chunk', 'created': 1700000000, 'model': model_name, 'choices': [{'index': 0, 'delta': {'content': content_piece}, 'finish_reason': choice.finish_reason}]})}\n\n"

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


                # Accumulate this turn's token usage into the running total.
                if turn_usage:
                    accumulated_usage["prompt_tokens"] += getattr(turn_usage, "prompt_tokens", 0) or 0
                    accumulated_usage["completion_tokens"] += getattr(turn_usage, "completion_tokens", 0) or 0
                else:
                    def _safe_content_str(m):
                        if not isinstance(m, dict):
                            return ""
                        c = m.get("content")
                        if c is None:
                            return ""
                        if isinstance(c, (list, dict)):
                            return str(c)
                        return str(c)
                    messages_text = " ".join(_safe_content_str(m) for m in messages)
                    answer_text = full_text or ""
                    accumulated_usage["prompt_tokens"] += max(1, len(messages_text) // 4)
                    accumulated_usage["completion_tokens"] += max(1, len(answer_text) // 4)

                if tool_calls_accumulator:
                    tool_calls_list = []
                    for _, tc_data in tool_calls_accumulator.items():
                        if not tc_data["function"]["arguments"].strip():
                            tc_data["function"]["arguments"] = "{}"
                        tool_calls_list.append(tc_data)

                    if persist and session_obj:
                        save_message(db, session_obj, "assistant", content=full_text or None, tool_calls=tool_calls_list)
                    messages.append({"role": "assistant", "content": full_text or None, "tool_calls": tool_calls_list})

                    mcp_servers = prefetch_mcp_servers(tool_calls_list, db, tenant_id=tenant.id)

                    # Emit tool-start events
                    for tc in tool_calls_list:
                        fn_name = tc["function"]["name"]
                        try:
                            args = json.loads(tc["function"]["arguments"])
                        except Exception:
                            args = {}
                        skill_name, _ = skill_registry.find_tool(fn_name, tenant_id=tenant.id)
                        
                        raw_name = fn_name.split("__")[-1]
                        clean_name = raw_name.replace("_", " ").title()
                        clean_skill = (skill_name or "System").replace("_", " ").title()
                        
                        yield _chunk(session_id, model_name,
                                     reasoning=f"Invoking {clean_name} (Skill: {clean_skill})...",
                                     tool_call={"name": clean_name, "arguments": args})

                    # Execute tools in parallel with thread-safe DB sessions
                    def run_one_stream(tc):
                        fn = tc["function"]["name"]
                        try:
                            args = json.loads(tc["function"]["arguments"])
                        except Exception:
                            args = {}
                        skill_name, tool_def = skill_registry.find_tool(fn, tenant_id=tenant.id)
                        worker_db = SessionLocal()
                        try:
                            command, exec_res, tool_result = execute_tool(fn, args, tool_def, user_data, tenant, session_id, worker_db, mcp_servers)
                            worker_db.commit()
                        except Exception as e:
                            worker_db.rollback()
                            command = ""
                            exec_res = {"error": str(e), "exit_code": 1, "execution_time_ms": 0}
                            tool_result = f"Error executing tool {fn}: {e}"
                        finally:
                            worker_db.close()
                        return tc, skill_name, fn, args, command, exec_res, tool_result

                    with ThreadPoolExecutor() as executor:
                        futures = [executor.submit(run_one_stream, tc) for tc in tool_calls_list]
                        for fut in as_completed(futures):
                            tc, skill_name, fn_name, args, command, exec_res, tool_result = fut.result()
                            art_d = exec_res.get("artifact_data")
                            if art_d and isinstance(art_d, dict):
                                a_id = art_d.get("id") or art_d.get("artifact_id") or f"art_{len(accumulated_artifacts)}"
                                accumulated_artifacts[a_id] = art_d

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
                                "generated_files": exec_res.get("generated_files", []),
                                "artifact_data": exec_res.get("artifact_data")
                            })

                            raw_name = fn_name.split("__")[-1]
                            clean_name = raw_name.replace("_", " ").title()
                            clean_skill = (skill_name or "System").replace("_", " ").title()

                            yield _chunk(session_id, model_name,
                                         reasoning=f"{clean_name} finished in {exec_res.get('execution_time_ms')}ms.",
                                         tool_result={
                                             "tool_name": clean_name, "skill_name": clean_skill,
                                             "stdout": exec_res.get("stdout"), "stderr": exec_res.get("stderr"),
                                             "sandbox_type": exec_res.get("sandbox_type"),
                                             "execution_time_ms": exec_res.get("execution_time_ms"),
                                             "exit_code": exec_res.get("exit_code"),
                                             "generated_files": exec_res.get("generated_files", []),
                                             "artifact_data": exec_res.get("artifact_data")
                                         })

                            safe_tool_result = truncate_tool_output(tool_result)
                            messages.append({"role": "tool", "tool_call_id": tc["id"], "content": safe_tool_result})
                            if persist and session_obj:
                                save_message(db, session_obj, "tool", content=safe_tool_result, tool_call_id=tc["id"])

                    # Post-tool-turn Quota / Context check before next turn
                    is_breached, quota_msg = check_tenant_quotas(db, tenant, session_id, messages, model_name)
                    if is_breached:
                        messages.append({"role": "user", "content": f"[System Notice: {quota_msg}. Please provide your final answer to the user now without invoking any further tools.]"})
                        available_tools = []

                else:
                    # Final text response — handle ProChat UI
                    last_extracted_json, last_extracted_code = None, None
                    if prochat_model:
                        gen = stream_prochat_ui(db, tenant, full_text, prochat_model, session_id, model_name)
                        try:
                            while True:
                                yield next(gen)
                        except StopIteration as si:
                            res_val = si.value
                            if res_val and len(res_val) >= 4:
                                last_extracted_json, last_extracted_code, prochat_usage, prochat_rates = res_val[:4]
                                if prochat_usage and prochat_rates:
                                    pin_r, pout_r, pau_in_r, pau_out_r = prochat_rates
                                    update_request_usage(chat_req, prochat_usage, pin_r, pout_r, pau_in_r, pau_out_r, is_secondary=True, model_name=prochat_model or "genui-mars-0.1")
                            elif res_val:
                                last_extracted_json, last_extracted_code = res_val[0], res_val[1]

                    arts_list = list(accumulated_artifacts.values())
                    if persist and session_obj:
                        save_message(db, session_obj, "assistant", content=full_text,
                                     json_data=last_extracted_json, code=last_extracted_code,
                                     artifact_data=arts_list if arts_list else None)

                    finalize_request(db, chat_req, full_text, executed_logs, start_time,
                                     accumulated_usage if accumulated_usage["prompt_tokens"] else None,
                                     in_r, out_r, au_in_r, au_out_r, model_name=model_name)

                    yield f"data: {json.dumps({'type': 'done', 'request_id': request_id, 'tools_called': len(executed_logs), 'artifacts': arts_list})}\n\n"
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
                    res_val = si.value
                    if res_val and len(res_val) >= 4:
                        last_extracted_json, last_extracted_code, prochat_usage, prochat_rates = res_val[:4]
                        if prochat_usage and prochat_rates:
                            pin_r, pout_r, pau_in_r, pau_out_r = prochat_rates
                            update_request_usage(chat_req, prochat_usage, pin_r, pout_r, pau_in_r, pau_out_r, is_secondary=True, model_name=prochat_model or "genui-mars-0.1")
                    elif res_val:
                        last_extracted_json, last_extracted_code = res_val[0], res_val[1]

            arts_list = list(accumulated_artifacts.values())
            if persist and session_obj:
                save_message(db, session_obj, "assistant", content=final_answer,
                             json_data=last_extracted_json, code=last_extracted_code,
                             artifact_data=last_artifact_data)

            finalize_request(db, chat_req, final_answer, executed_logs, start_time,
                             accumulated_usage if accumulated_usage["prompt_tokens"] else None,
                             in_r, out_r, au_in_r, au_out_r, model_name=model_name)
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
