from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Header
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from models import Tenant, User, ChatRequest, ExecutionLog
from auth import get_current_tenant, get_current_user
from utils import get_paginated_response
from skill_engine import skill_engine
from schemas import PlaygroundChatRequest, OpenAIChatRequest

router = APIRouter()


@router.get("/health")
def health_check():
    return {"status": "ok", "service": "skill_manager"}


@router.post("/interact")
def interact(
    req: PlaygroundChatRequest,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db)
):
    result = skill_engine.process_chat(
        db=db,
        tenant=tenant,
        session_id=req.session_id,
        user_message=req.message,
        model_name=req.model,
        request_source="dashboard",
        prochat_model=req.prochat_model,
        image_model=req.image_model,
        image_gen_model=req.image_gen_model,
        audio_model=req.audio_model,
        video_model=req.video_model,
        video_gen_model=req.video_gen_model,
        user_data=req.user_data,
        skill_names=req.skill_names
    )
    return result


@router.post("/chat/stream")
def stream_interact(
    req: PlaygroundChatRequest,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db)
):
    return StreamingResponse(
        skill_engine.stream_openai_chat(
            db=db,
            tenant=tenant,
            session_id=req.session_id,
            user_message=req.message,
            model_name=req.model or "gemini-2.5-flash",
            request_source="dashboard",
            prochat_model=req.prochat_model,
            image_model=req.image_model,
            image_gen_model=req.image_gen_model,
            audio_model=req.audio_model,
            video_model=req.video_model,
            video_gen_model=req.video_gen_model,
            user_data=req.user_data,
            skill_names=req.skill_names,
            temperature=req.temperature,
            top_p=req.top_p,
            top_k=req.top_k,
            max_tokens=req.max_tokens,
            max_completion_tokens=req.max_completion_tokens,
            presence_penalty=req.presence_penalty,
            frequency_penalty=req.frequency_penalty,
            stop=req.stop,
            seed=req.seed,
            response_format=req.response_format,
            tool_choice=req.tool_choice,
            user=req.user,
            reasoning_effort=req.reasoning_effort,
            thinking_budget=req.thinking_budget,
            openrouter_provider=req.openrouter_provider,
            openrouter_models=req.openrouter_models,
            extra_body=req.extra_body,
            store=req.store,
            metadata=req.metadata,
            service_tier=req.service_tier,
            safety_identifier=req.safety_identifier,
            prompt_cache_key=req.prompt_cache_key,
            prompt_cache_options=req.prompt_cache_options,
            verbosity=req.verbosity,
        ),
        media_type="text/event-stream"
    )


@router.post("/chat/completions")
def openai_chat_completions(
    req: OpenAIChatRequest,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
    x_request_source: Optional[str] = Header(default="api", alias="X-Request-Source")
):
    last_user_msg = next((m.content for m in reversed(req.messages) if m.role == "user"), "")
    if not last_user_msg:
        raise HTTPException(status_code=400, detail="No user message found in payload")

    if req.app_id:
        from models import AppModel
        app_obj = db.query(AppModel).filter(AppModel.id == req.app_id).first()
        if not app_obj:
            raise HTTPException(status_code=404, detail=f"App '{req.app_id}' not found. Provide a valid app_id or omit it to use all available skills.")

    client_messages = [{"role": m.role, "content": m.content} for m in req.messages]

    try:
        if req.stream:
            return StreamingResponse(
                skill_engine.stream_openai_chat(
                    db=db,
                    tenant=tenant,
                    session_id=req.session_id,
                    user_message=last_user_msg,
                    app_id=req.app_id,
                    model_name=req.model or "gemini-2.5-flash",
                    request_source=x_request_source,
                    prochat_model=req.prochat_model,
                    image_model=req.image_model,
                    image_gen_model=req.image_gen_model,
                    audio_model=req.audio_model,
                    video_model=req.video_model,
                    video_gen_model=req.video_gen_model,
                    user_data=req.user_data,
                    skill_names=req.skill_names,
                    client_messages=client_messages,
                    temperature=req.temperature,
                    top_p=req.top_p,
                    top_k=req.top_k,
                    max_tokens=req.max_tokens,
                    max_completion_tokens=req.max_completion_tokens,
                    presence_penalty=req.presence_penalty,
                    frequency_penalty=req.frequency_penalty,
                    stop=req.stop,
                    seed=req.seed,
                    response_format=req.response_format,
                    tool_choice=req.tool_choice,
                    user=req.user,
                    reasoning_effort=req.reasoning_effort,
                    thinking_budget=req.thinking_budget,
                    openrouter_provider=req.openrouter_provider,
                    openrouter_models=req.openrouter_models,
                    extra_body=req.extra_body,
                    store=req.store,
                    metadata=req.metadata,
                    service_tier=req.service_tier,
                    safety_identifier=req.safety_identifier,
                    prompt_cache_key=req.prompt_cache_key,
                    prompt_cache_options=req.prompt_cache_options,
                    verbosity=req.verbosity,
                ),
                media_type="text/event-stream"
            )

        result = skill_engine.process_chat(
            db=db,
            tenant=tenant,
            session_id=req.session_id,
            user_message=last_user_msg,
            app_id=req.app_id,
            model_name=req.model,
            request_source=x_request_source,
            prochat_model=req.prochat_model,
            image_model=req.image_model,
            image_gen_model=req.image_gen_model,
            audio_model=req.audio_model,
            video_model=req.video_model,
            video_gen_model=req.video_gen_model,
            user_data=req.user_data,
            skill_names=req.skill_names,
            client_messages=client_messages,
            temperature=req.temperature,
            top_p=req.top_p,
            top_k=req.top_k,
            max_tokens=req.max_tokens,
            max_completion_tokens=req.max_completion_tokens,
            presence_penalty=req.presence_penalty,
            frequency_penalty=req.frequency_penalty,
            stop=req.stop,
            seed=req.seed,
            response_format=req.response_format,
            tool_choice=req.tool_choice,
            user=req.user,
            reasoning_effort=req.reasoning_effort,
            thinking_budget=req.thinking_budget,
            openrouter_provider=req.openrouter_provider,
            openrouter_models=req.openrouter_models,
            extra_body=req.extra_body,
            store=req.store,
            metadata=req.metadata,
            service_tier=req.service_tier,
            safety_identifier=req.safety_identifier,
            prompt_cache_key=req.prompt_cache_key,
            prompt_cache_options=req.prompt_cache_options,
            verbosity=req.verbosity,
        )

        return {
            "id": f"chatcmpl-{result['session_id']}",
            "request_id": result.get("request_id"),
            "object": "chat.completion",
            "created": 1700000000,
            "model": req.model,
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": result["response"],
                        "json": result.get("json"),
                        "code": result.get("code"),
                        "artifacts": result.get("artifacts", [])
                    },
                    "finish_reason": "stop"
                }
            ],
            "executed_tools": result.get("executed_tools", []),
            "artifacts": result.get("artifacts", [])
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/requests")
def list_chat_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: Optional[int] = None,
    page_size: int = 20,
    request_source: Optional[str] = None,
    tenant_name: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None
):
    from models import Tenant
    user_tenant_ids = db.query(Tenant.id).filter(Tenant.user_id == current_user.id)
    query = db.query(ChatRequest).filter(ChatRequest.tenant_id.in_(user_tenant_ids))
    if request_source:
        query = query.filter(ChatRequest.request_source == request_source)
    if status:
        query = query.filter(ChatRequest.status == status)
    if tenant_name and tenant_name != "ALL":
        query = query.join(Tenant).filter(Tenant.name == tenant_name)
    if search:
        query = query.filter(ChatRequest.user_message.ilike(f"%{search}%"))
    query = query.order_by(ChatRequest.created_at.desc())

    def serialize(r):
        tenant_obj = db.query(Tenant).filter(Tenant.id == r.tenant_id).first() if r.tenant_id else None
        return {
            "id": r.id,
            "tenant_name": tenant_obj.name if tenant_obj else "Unknown",
            "session_id": r.session_id,
            "app_id": r.app_id,
            "model_name": r.model_name,
            "request_source": r.request_source,
            "user_message": r.user_message,
            "assistant_response": r.assistant_response,
            "tools_called": r.tools_called or 0,
            "total_duration_ms": r.total_duration_ms,
            "prompt_tokens": r.prompt_tokens or 0,
            "completion_tokens": r.completion_tokens or 0,
            "cost_usd": getattr(r, "cost_usd", 0.0) or 0.0,
            "status": r.status,
            "error_detail": r.error_detail,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "completed_at": r.completed_at.isoformat() if r.completed_at else None
        }
    return get_paginated_response(query, page, page_size, serialize)


@router.get("/requests/{request_id}")
def get_chat_request(
    request_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from models import Tenant
    user_tenant_ids = db.query(Tenant.id).filter(Tenant.user_id == current_user.id)
    r = db.query(ChatRequest).filter(
        ChatRequest.id == request_id,
        ChatRequest.tenant_id.in_(user_tenant_ids)
    ).first()
    if not r:
        raise HTTPException(status_code=404, detail="Request not found")
    tenant_obj = db.query(Tenant).filter(Tenant.id == r.tenant_id).first() if r.tenant_id else None
    logs = db.query(ExecutionLog).filter(ExecutionLog.request_id == request_id).order_by(ExecutionLog.created_at.asc()).all()
    return {
        "id": r.id,
        "tenant_name": tenant_obj.name if tenant_obj else "Unknown",
        "session_id": r.session_id,
        "app_id": r.app_id,
        "model_name": r.model_name,
        "request_source": r.request_source,
        "user_message": r.user_message,
        "assistant_response": r.assistant_response,
        "tools_called": r.tools_called or 0,
        "total_duration_ms": r.total_duration_ms,
        "prompt_tokens": r.prompt_tokens or 0,
        "completion_tokens": r.completion_tokens or 0,
        "cost_usd": getattr(r, "cost_usd", 0.0) or 0.0,
        "status": r.status,
        "error_detail": r.error_detail,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        "execution_logs": [
            {
                "id": log.id,
                "skill_name": log.skill_name,
                "tool_name": log.tool_name,
                "command": log.command,
                "sandbox_type": log.sandbox_type,
                "stdout": log.stdout,
                "stderr": log.stderr,
                "exit_code": log.exit_code,
                "execution_time_ms": log.execution_time_ms,
                "created_at": log.created_at.isoformat() if log.created_at else None
            }
            for log in logs
        ]
    }


@router.get("/usage/summary")
def get_usage_summary(
    tenant_name: Optional[str] = None,
    model_name: Optional[str] = None,
    request_source: Optional[str] = None,
    page: Optional[int] = None,
    page_size: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from models import Tenant, ExecutionLog
    from sqlalchemy import func

    user_tenant_ids = db.query(Tenant.id).filter(Tenant.user_id == current_user.id)

    # Primary models aggregation
    primary_query = db.query(
        ChatRequest.tenant_id,
        func.coalesce(ChatRequest.primary_model_name, ChatRequest.model_name).label("model_name"),
        ChatRequest.request_source,
        func.count(ChatRequest.id).label("request_count"),
        func.sum(ChatRequest.primary_prompt_tokens).label("total_prompt_tokens"),
        func.sum(ChatRequest.primary_completion_tokens).label("total_completion_tokens"),
        func.sum(ChatRequest.primary_cost_usd).label("total_cost_usd")
    ).filter(ChatRequest.status == "completed", ChatRequest.tenant_id.in_(user_tenant_ids))

    if model_name:
        primary_query = primary_query.filter(func.coalesce(ChatRequest.primary_model_name, ChatRequest.model_name).ilike(f"%{model_name}%"))
    if tenant_name and tenant_name != "ALL":
        primary_query = primary_query.join(Tenant).filter(Tenant.name == tenant_name)
    if request_source and request_source != "ALL":
        primary_query = primary_query.filter(ChatRequest.request_source == request_source)

    primary_results = primary_query.group_by(
        ChatRequest.tenant_id,
        func.coalesce(ChatRequest.primary_model_name, ChatRequest.model_name),
        ChatRequest.request_source
    ).all()

    # Secondary models aggregation
    secondary_query = db.query(
        ChatRequest.tenant_id,
        ChatRequest.secondary_model_name.label("model_name"),
        ChatRequest.request_source,
        func.count(ChatRequest.id).label("request_count"),
        func.sum(ChatRequest.secondary_prompt_tokens).label("total_prompt_tokens"),
        func.sum(ChatRequest.secondary_completion_tokens).label("total_completion_tokens"),
        func.sum(ChatRequest.secondary_cost_usd).label("total_cost_usd")
    ).filter(
        ChatRequest.status == "completed",
        ChatRequest.secondary_model_name != None,
        ChatRequest.tenant_id.in_(user_tenant_ids)
    )

    if model_name:
        secondary_query = secondary_query.filter(ChatRequest.secondary_model_name.ilike(f"%{model_name}%"))
    if tenant_name and tenant_name != "ALL":
        secondary_query = secondary_query.join(Tenant).filter(Tenant.name == tenant_name)
    if request_source and request_source != "ALL":
        secondary_query = secondary_query.filter(ChatRequest.request_source == request_source)

    secondary_results = secondary_query.group_by(
        ChatRequest.tenant_id,
        ChatRequest.secondary_model_name,
        ChatRequest.request_source
    ).all()

    # Subagent models aggregation from ExecutionLog
    subagent_query = db.query(
        ExecutionLog.tenant_id,
        ExecutionLog.model_name.label("model_name"),
        ExecutionLog.request_source,
        func.count(ExecutionLog.id).label("request_count"),
        func.sum(ExecutionLog.prompt_tokens).label("total_prompt_tokens"),
        func.sum(ExecutionLog.completion_tokens).label("total_completion_tokens"),
        func.sum(ExecutionLog.cost_usd).label("total_cost_usd")
    ).filter(
        ExecutionLog.tenant_id.in_(user_tenant_ids),
        ExecutionLog.model_name != None,
        (ExecutionLog.sandbox_type == "subagent") | (ExecutionLog.cost_usd > 0.0) | (ExecutionLog.prompt_tokens > 0) | (ExecutionLog.completion_tokens > 0)
    )

    if model_name:
        subagent_query = subagent_query.filter(ExecutionLog.model_name.ilike(f"%{model_name}%"))
    if tenant_name and tenant_name != "ALL":
        subagent_query = subagent_query.join(Tenant).filter(Tenant.name == tenant_name)
    if request_source and request_source != "ALL":
        subagent_query = subagent_query.filter(ExecutionLog.request_source == request_source)

    subagent_results = subagent_query.group_by(
        ExecutionLog.tenant_id,
        ExecutionLog.model_name,
        ExecutionLog.request_source
    ).all()

    tenant_cache = {}
    grouped_map = {}

    for r in list(primary_results) + list(secondary_results) + list(subagent_results):
        if not r.model_name:
            continue
        tenant_id = r.tenant_id
        if tenant_id not in tenant_cache:
            t = db.query(Tenant).filter(Tenant.id == tenant_id).first() if tenant_id else None
            tenant_cache[tenant_id] = t.name if t else "Default Workspace"

        source_key = r.request_source or "api"
        key = (tenant_id, r.model_name, source_key)
        if key not in grouped_map:
            grouped_map[key] = {
                "tenant_name": tenant_cache[tenant_id],
                "model_name": r.model_name,
                "request_source": source_key,
                "request_count": 0,
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "cost_usd": 0.0
            }

        grouped_map[key]["request_count"] += (r.request_count or 0)
        grouped_map[key]["prompt_tokens"] += (r.total_prompt_tokens or 0)
        grouped_map[key]["completion_tokens"] += (r.total_completion_tokens or 0)
        grouped_map[key]["cost_usd"] += (r.total_cost_usd or 0.0)

    summary = []
    total_cost_calc = 0.0
    total_req_calc = 0
    total_prompt_calc = 0
    total_completion_calc = 0

    for item in grouped_map.values():
        item["cost_usd"] = round(item["cost_usd"], 6)
        total_cost_calc += item["cost_usd"]
        total_req_calc += item["request_count"]
        total_prompt_calc += item["prompt_tokens"]
        total_completion_calc += item["completion_tokens"]
        summary.append(item)

    # Sort summary by cost_usd descending, then request_count descending
    summary.sort(key=lambda x: (x["cost_usd"], x["request_count"]), reverse=True)

    target_page = page or 1
    paginated_res = get_paginated_response(summary, target_page, page_size, lambda x: x, is_query=False)

    return {
        "items": paginated_res["items"] if isinstance(paginated_res, dict) else paginated_res,
        "total": paginated_res["total"] if isinstance(paginated_res, dict) else len(summary),
        "page": paginated_res["page"] if isinstance(paginated_res, dict) else target_page,
        "pages": paginated_res["pages"] if isinstance(paginated_res, dict) else 1,
        "totals": {
            "request_count": total_req_calc,
            "prompt_tokens": total_prompt_calc,
            "completion_tokens": total_completion_calc,
            "cost_usd": round(total_cost_calc, 6)
        }
    }


@router.get("/sessions")
def list_conversation_sessions(
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
    page: Optional[int] = None,
    page_size: int = 10
):
    from models import ConversationSession, ChatMessage
    query = db.query(ConversationSession).filter(
        ConversationSession.tenant_id == tenant.id
    ).order_by(ConversationSession.created_at.desc())

    def serialize(s):
        first_msg = db.query(ChatMessage).filter(
            ChatMessage.session_id == s.id,
            ChatMessage.role == "user"
        ).order_by(ChatMessage.created_at.asc()).first()
        effective_session_id = (s.session_id or "").strip() or s.id
        title = (first_msg.content[:40] + "...") if first_msg and first_msg.content else f"Session {effective_session_id[:12]}"
        return {
            "id": effective_session_id,
            "db_id": s.id,
            "title": title,
            "created_at": s.created_at.isoformat() if s.created_at else None
        }
    return get_paginated_response(query, page, page_size, serialize)


@router.get("/sessions/{session_id}/messages")
def get_session_messages(
    session_id: str,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
    page: Optional[int] = None,
    page_size: int = 50
):
    import math
    import json
    import re
    from models import ConversationSession, ChatMessage, SessionArtifact
    from artifacts.manager import mint_embed_token
    clean_session_id = (session_id or "").strip()
    if not clean_session_id:
        return [] if page is None else {
            "items": [],
            "total": 0,
            "page": page,
            "page_size": page_size,
            "pages": 0
        }

    s = db.query(ConversationSession).filter(
        ConversationSession.tenant_id == tenant.id,
        (ConversationSession.session_id == clean_session_id) | (ConversationSession.id == clean_session_id)
    ).first()

    if not s:
        return [] if page is None else {
            "items": [],
            "total": 0,
            "page": page,
            "page_size": page_size,
            "pages": 0
        }

    # Fetch artifacts belonging to this session
    session_artifacts = db.query(SessionArtifact).filter(
        SessionArtifact.session_id.in_([s.id, s.session_id])
    ).order_by(SessionArtifact.updated_at.asc()).all()

    art_map = {a.id: a for a in session_artifacts}
    latest_art = session_artifacts[-1] if session_artifacts else None

    def serialize_msg(m, preceding_tool_art=None):
        art_info = None
        artifacts_list = []
        # 1. Direct artifact_data column on message
        if getattr(m, 'artifact_data', None):
            try:
                raw_art = json.loads(m.artifact_data) if isinstance(m.artifact_data, str) else m.artifact_data
                raw_items = raw_art if isinstance(raw_art, list) else [raw_art] if isinstance(raw_art, dict) else []
                for item in raw_items:
                    if not isinstance(item, dict):
                        continue
                    art_id = item.get("artifact_id") or item.get("id")
                    target_art = art_map.get(art_id)
                    fresh_token = mint_embed_token(art_id, tenant.id, expires_in_minutes=60) if art_id else item.get("token")
                    parsed_art = {
                        "id": art_id,
                        "title": target_art.title if target_art else item.get("title", "Document"),
                        "filename": target_art.filename if target_art else item.get("filename", "document.md"),
                        "artifact_type": target_art.artifact_type if target_art else item.get("artifact_type", "document"),
                        "current_version": target_art.current_version if target_art else item.get("current_version", 1),
                        "token": fresh_token,
                        "embed_url": f"/embed/canvas?token={fresh_token}" if fresh_token else ""
                    }
                    artifacts_list.append(parsed_art)
                if artifacts_list:
                    art_info = artifacts_list[0]
            except Exception:
                pass

        # 2. Inherited from preceding tool execution in this turn
        if not art_info and preceding_tool_art and m.role == "assistant":
            art_info = preceding_tool_art
            artifacts_list.append(preceding_tool_art)

        # 3. Fallback: Parse embed URL from message content
        if not art_info and m.content and "/embed/canvas?token=" in m.content:
            match = re.search(r"/embed/canvas\?token=([^\s)\"']+)", m.content)
            if match:
                tok = match.group(1)
                eff_id = None
                if "." in tok:
                    try:
                        import base64
                        raw = tok.split(".")[0].replace("-", "+").replace("_", "/")
                        padded = raw + "=" * ((4 - len(raw) % 4) % 4)
                        payload = json.loads(base64.b64decode(padded).decode("utf-8"))
                        eff_id = payload.get("art")
                    except Exception:
                        pass
                matched_art = art_map.get(eff_id) if eff_id else latest_art
                fresh_tok = mint_embed_token(matched_art.id, tenant.id, expires_in_minutes=60) if matched_art else tok
                art_info = {
                    "id": matched_art.id if matched_art else eff_id,
                    "title": matched_art.title if matched_art else "Interactive Document",
                    "filename": matched_art.filename if matched_art else "document.md",
                    "artifact_type": matched_art.artifact_type if matched_art else "document",
                    "current_version": matched_art.current_version if matched_art else 1,
                    "token": fresh_tok,
                    "embed_url": f"/embed/canvas?token={fresh_tok}"
                }
                artifacts_list.append(art_info)

        # 4. Fallback for past assistant messages in a session with artifacts
        if not art_info and m.role == "assistant" and latest_art:
            content_lower = (m.content or "").lower()
            if any(k in content_lower for k in ["canvas", "artifact", "document", "spreadsheet", "presentation", latest_art.title.lower()]):
                fresh_tok = mint_embed_token(latest_art.id, tenant.id, expires_in_minutes=60)
                art_info = {
                    "id": latest_art.id,
                    "title": latest_art.title,
                    "filename": latest_art.filename,
                    "artifact_type": latest_art.artifact_type,
                    "current_version": latest_art.current_version,
                    "token": fresh_tok,
                    "embed_url": f"/embed/canvas?token={fresh_tok}"
                }
                artifacts_list.append(art_info)

        return {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "tool_calls": m.tool_calls,
            "json": m.json,
            "code": m.code,
            "artifacts": artifacts_list,
            "timestamp": m.created_at.strftime("%H:%M:%S") if m.created_at else ""
        }

    def serialize_msg_list(raw_msgs):
        out = []
        pending_tool_art = None
        for m in raw_msgs:
            if m.role == "tool" and m.content and "/embed/canvas?token=" in m.content:
                match = re.search(r"/embed/canvas\?token=([^\s)\"']+)", m.content)
                if match:
                    tok = match.group(1)
                    eff_id = None
                    if "." in tok:
                        try:
                            import base64
                            raw = tok.split(".")[0].replace("-", "+").replace("_", "/")
                            padded = raw + "=" * ((4 - len(raw) % 4) % 4)
                            payload = json.loads(base64.b64decode(padded).decode("utf-8"))
                            eff_id = payload.get("art")
                        except Exception:
                            pass
                    matched_art = art_map.get(eff_id) if eff_id else latest_art
                    fresh_tok = mint_embed_token(matched_art.id, tenant.id, expires_in_minutes=60) if matched_art else tok
                    pending_tool_art = {
                        "id": matched_art.id if matched_art else eff_id,
                        "title": matched_art.title if matched_art else "Interactive Document",
                        "filename": matched_art.filename if matched_art else "document.md",
                        "artifact_type": matched_art.artifact_type if matched_art else "document",
                        "current_version": matched_art.current_version if matched_art else 1,
                        "token": fresh_tok,
                        "embed_url": f"/embed/canvas?token={fresh_tok}"
                    }
            serialized = serialize_msg(m, preceding_tool_art=pending_tool_art)
            if m.role == "assistant":
                pending_tool_art = None
            out.append(serialized)
        return out

    if page is None:
        msgs = db.query(ChatMessage).filter(
            ChatMessage.session_id == s.id
        ).order_by(ChatMessage.created_at.asc()).all()
        return serialize_msg_list(msgs)

    query = db.query(ChatMessage).filter(
        ChatMessage.session_id == s.id
    ).order_by(ChatMessage.created_at.desc())

    total = query.count()
    offset = (page - 1) * page_size
    items = query.offset(offset).limit(page_size).all()
    items_asc = list(reversed(items))
    pages = math.ceil(total / page_size) if page_size > 0 else 1

    return {
        "items": serialize_msg_list(items_asc),
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": pages
    }


@router.delete("/sessions/{session_id}")
def delete_session(
    session_id: str,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db)
):
    """
    Completely purges all external API session resources associated with a session ID for the authenticated tenant:
    - Purges all cloud storage files (Azure Blob, AWS S3, or Local Disk) and sandbox caches
    - Deletes all session artifacts, blocks, and commit history, broadcasting deletion SSE events
    Dedicated endpoint for external API users to perform complete session teardown.
    """
    clean_session_id = (session_id or "").strip()
    if not clean_session_id:
        raise HTTPException(status_code=400, detail="Invalid session ID")

    from models import SessionArtifact
    from artifacts import broadcaster
    from routers.files import purge_session_files_internal

    # 1. Find and delete all session artifacts belonging to this external session
    artifacts = db.query(SessionArtifact).filter(
        SessionArtifact.tenant_id == tenant.id,
        SessionArtifact.session_id == clean_session_id
    ).all()

    deleted_artifact_ids = []
    for art in artifacts:
        try:
            broadcaster.broadcast(art.id, "artifact_deleted", {"artifact_id": art.id})
        except Exception:
            pass
        deleted_artifact_ids.append(art.id)
        db.delete(art)

    # 2. Purge all cloud storage files (Azure Blob / S3 / Local) and sandbox caches for this session
    deleted_files_count = 0
    deleted_files_list = []
    try:
        purge_res = purge_session_files_internal(db, tenant.id, tenant.name, clean_session_id)
        deleted_files_count = purge_res.get("deleted_count", 0)
        deleted_files_list = purge_res.get("deleted_files", [])
    except Exception as purge_err:
        print(f"Notice: Failed to purge storage files on session delete: {purge_err}")

    db.commit()

    return {
        "status": "success",
        "session_id": clean_session_id,
        "deleted_artifacts_count": len(deleted_artifact_ids),
        "deleted_artifacts": deleted_artifact_ids,
        "deleted_files_count": deleted_files_count,
        "deleted_files": deleted_files_list,
        "message": f"Session {clean_session_id} cleaned up successfully"
    }

