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
        request_source="dashboard",
        prochat_model=req.prochat_model,
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
            request_source="dashboard",
            prochat_model=req.prochat_model,
            user_data=req.user_data,
            skill_names=req.skill_names
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
                    user_data=req.user_data,
                    skill_names=req.skill_names,
                    client_messages=client_messages
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
            user_data=req.user_data,
            skill_names=req.skill_names,
            client_messages=client_messages
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
                        "code": result.get("code")
                    },
                    "finish_reason": "stop"
                }
            ],
            "executed_tools": result.get("executed_tools", [])
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
    query = db.query(ChatRequest)
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
    r = db.query(ChatRequest).filter(ChatRequest.id == request_id).first()
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
    from models import Tenant
    from sqlalchemy import func

    query = db.query(
        ChatRequest.tenant_id,
        ChatRequest.model_name,
        ChatRequest.request_source,
        func.count(ChatRequest.id).label("request_count"),
        func.sum(ChatRequest.prompt_tokens).label("total_prompt_tokens"),
        func.sum(ChatRequest.completion_tokens).label("total_completion_tokens"),
        func.sum(ChatRequest.cost_usd).label("total_cost_usd")
    ).filter(ChatRequest.status == "completed")

    if model_name:
        query = query.filter(ChatRequest.model_name == model_name)
    if tenant_name and tenant_name != "ALL":
        query = query.join(Tenant).filter(Tenant.name == tenant_name)
    if request_source:
        query = query.filter(ChatRequest.request_source == request_source)

    results = query.group_by(
        ChatRequest.tenant_id,
        ChatRequest.model_name,
        ChatRequest.request_source
    ).all()

    tenant_cache = {}
    summary = []

    for r in results:
        tenant_id = r.tenant_id
        if tenant_id not in tenant_cache:
            t = db.query(Tenant).filter(Tenant.id == tenant_id).first()
            tenant_cache[tenant_id] = t.name if t else "Unknown"

        summary.append({
            "tenant_name": tenant_cache[tenant_id],
            "model_name": r.model_name or "Unknown",
            "request_source": r.request_source or "api",
            "request_count": r.request_count,
            "prompt_tokens": r.total_prompt_tokens or 0,
            "completion_tokens": r.total_completion_tokens or 0,
            "cost_usd": round(r.total_cost_usd or 0.0, 6)
        })

    totals_query = db.query(
        func.sum(ChatRequest.cost_usd).label("cost_usd"),
        func.count(ChatRequest.id).label("request_count"),
        func.sum(ChatRequest.prompt_tokens).label("prompt_tokens"),
        func.sum(ChatRequest.completion_tokens).label("completion_tokens")
    ).filter(ChatRequest.status == "completed")

    if model_name:
        totals_query = totals_query.filter(ChatRequest.model_name == model_name)
    if tenant_name and tenant_name != "ALL":
        totals_query = totals_query.join(Tenant).filter(Tenant.name == tenant_name)
    if request_source:
        totals_query = totals_query.filter(ChatRequest.request_source == request_source)

    totals_res = totals_query.first()
    paginated_res = get_paginated_response(summary, page, page_size, lambda x: x, is_query=False)

    return {
        "items": paginated_res["items"] if isinstance(paginated_res, dict) else paginated_res,
        "total": paginated_res["total"] if isinstance(paginated_res, dict) else len(summary),
        "page": paginated_res["page"] if isinstance(paginated_res, dict) else 1,
        "pages": paginated_res["pages"] if isinstance(paginated_res, dict) else 1,
        "totals": {
            "request_count": (totals_res.request_count if totals_res else 0) or 0,
            "prompt_tokens": (totals_res.prompt_tokens if totals_res else 0) or 0,
            "completion_tokens": (totals_res.completion_tokens if totals_res else 0) or 0,
            "cost_usd": round((totals_res.cost_usd if totals_res else 0.0) or 0.0, 6)
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
        title = (first_msg.content[:40] + "...") if first_msg and first_msg.content else f"Session {s.session_id}"
        return {
            "id": s.session_id,
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
    from models import ConversationSession, ChatMessage
    s = db.query(ConversationSession).filter(
        ConversationSession.tenant_id == tenant.id,
        ConversationSession.session_id == session_id
    ).first()

    if not s:
        return [] if page is None else {
            "items": [],
            "total": 0,
            "page": page,
            "page_size": page_size,
            "pages": 0
        }

    if page is None:
        msgs = db.query(ChatMessage).filter(
            ChatMessage.session_id == s.id
        ).order_by(ChatMessage.created_at.asc()).all()
        return [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "tool_calls": m.tool_calls,
                "json": m.json,
                "code": m.code,
                "timestamp": m.created_at.strftime("%H:%M:%S") if m.created_at else ""
            }
            for m in msgs
        ]

    query = db.query(ChatMessage).filter(
        ChatMessage.session_id == s.id
    ).order_by(ChatMessage.created_at.desc())

    total = query.count()
    offset = (page - 1) * page_size
    items = query.offset(offset).limit(page_size).all()
    items_asc = list(reversed(items))
    pages = math.ceil(total / page_size) if page_size > 0 else 1

    return {
        "items": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "tool_calls": m.tool_calls,
                "json": m.json,
                "code": m.code,
                "timestamp": m.created_at.strftime("%H:%M:%S") if m.created_at else ""
            }
            for m in items_asc
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": pages
    }
