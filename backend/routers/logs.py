import json
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db
from models import ExecutionLog, Tenant, User, ChatRequest
from auth import get_current_user, resolve_auth_context
from utils import get_paginated_response

router = APIRouter()

@router.get("/filters")
def get_logs_filters(
    db: Session = Depends(get_db),
    auth: dict = Depends(resolve_auth_context),
    search_tenant: Optional[str] = None,
    search_model: Optional[str] = None,
    request_source: Optional[str] = None
):
    if auth.get("tenant"):
        user = auth.get("user")
        if user:
            user_tenant_ids = db.query(Tenant.id).filter(Tenant.user_id == user.id)
        else:
            user_tenant_ids = [auth["tenant"].id]
    elif auth.get("user"):
        user_tenant_ids = db.query(Tenant.id).filter(Tenant.user_id == auth["user"].id)
    else:
        raise HTTPException(status_code=401, detail="Authentication required")

    t_query = db.query(Tenant.name).filter(Tenant.id.in_(user_tenant_ids)).distinct()
    if search_tenant:
        t_query = t_query.filter(Tenant.name.ilike(f"%{search_tenant}%"))
    tenants = [t[0] for t in t_query.order_by(Tenant.name).all() if t[0]]

    # Source filter helper
    source_filter = None
    if request_source:
        if request_source == 'dashboard':
            source_filter = (ExecutionLog.request_source == 'dashboard')
        else:
            source_filter = ((ExecutionLog.request_source != 'dashboard') | (ExecutionLog.request_source.is_(None)))

    m_query = db.query(ExecutionLog.model_name).filter(
        ExecutionLog.tenant_id.in_(user_tenant_ids),
        ExecutionLog.model_name.isnot(None)
    ).distinct()
    if source_filter is not None:
        m_query = m_query.filter(source_filter)
    if search_model:
        m_query = m_query.filter(ExecutionLog.model_name.ilike(f"%{search_model}%"))
    models = [m[0] for m in m_query.order_by(ExecutionLog.model_name).all() if m[0]]

    s_query = db.query(ExecutionLog.sandbox_type).filter(
        ExecutionLog.tenant_id.in_(user_tenant_ids),
        ExecutionLog.sandbox_type.isnot(None)
    ).distinct()
    if source_filter is not None:
        s_query = s_query.filter(source_filter)
    sandboxes = [s[0] for s in s_query.order_by(ExecutionLog.sandbox_type).all() if s[0]]

    return {
        "tenants": tenants,
        "models": models,
        "sandboxes": sandboxes
    }


@router.get("")
def get_logs(
    db: Session = Depends(get_db),
    auth: dict = Depends(resolve_auth_context),
    page: Optional[int] = None,
    page_size: int = 20,
    session_id: Optional[str] = None,
    request_source: Optional[str] = None,
    tenant_name: Optional[str] = None,
    model_name: Optional[str] = None,
    sandbox_type: Optional[str] = None
):
    if auth.get("tenant"):
        query = db.query(ExecutionLog).filter(ExecutionLog.tenant_id == auth["tenant"].id)
    elif auth.get("user"):
        user_tenant_ids = db.query(Tenant.id).filter(Tenant.user_id == auth["user"].id)
        query = db.query(ExecutionLog).filter(ExecutionLog.tenant_id.in_(user_tenant_ids))
    else:
        raise HTTPException(status_code=401, detail="Authentication required")

    if tenant_name and tenant_name.upper() != 'ALL':
        if tenant_name.lower() in ('system/global', 'system', 'global'):
            query = query.filter(ExecutionLog.tenant_id.is_(None))
        else:
            query = query.join(Tenant, ExecutionLog.tenant_id == Tenant.id).filter(
                (func.lower(Tenant.name) == tenant_name.lower()) | (Tenant.id == tenant_name)
            )

    if session_id:
        query = query.filter(ExecutionLog.session_id == session_id)
    if request_source:
        if request_source == 'dashboard':
            query = query.filter(ExecutionLog.request_source == 'dashboard')
        else:
            query = query.filter((ExecutionLog.request_source != 'dashboard') | (ExecutionLog.request_source.is_(None)))
    if model_name and model_name.upper() != 'ALL':
        query = query.filter(func.lower(ExecutionLog.model_name) == model_name.lower())
    if sandbox_type and sandbox_type.upper() != 'ALL':
        query = query.filter(func.lower(ExecutionLog.sandbox_type) == sandbox_type.lower())
        
    query = query.order_by(ExecutionLog.created_at.desc())

    def serialize(log):
        return {
            "id": log.id,
            "tenant_id": log.tenant_id,
            "tenant_name": log.tenant.name if log.tenant else "System/Global",
            "session_id": log.session_id,
            "skill_name": log.skill_name,
            "tool_name": log.tool_name,
            "command": log.command,
            "sandbox_type": log.sandbox_type,
            "stdout": log.stdout,
            "stderr": log.stderr,
            "exit_code": log.exit_code,
            "execution_time_ms": log.execution_time_ms,
            "model_name": log.model_name or "default",
            "request_source": log.request_source or "api",
            "created_at": log.created_at.isoformat() if log.created_at else None
        }
    return get_paginated_response(query, page, page_size, serialize)


@router.get("/requests")
def get_chat_requests(
    db: Session = Depends(get_db),
    auth: dict = Depends(resolve_auth_context),
    page: Optional[int] = None,
    page_size: int = 20,
    session_id: Optional[str] = None,
    request_source: Optional[str] = None,
    tenant_name: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None
):
    if auth.get("tenant"):
        query = db.query(ChatRequest).filter(ChatRequest.tenant_id == auth["tenant"].id)
    elif auth.get("user"):
        user_tenant_ids = db.query(Tenant.id).filter(Tenant.user_id == auth["user"].id)
        query = db.query(ChatRequest).filter(ChatRequest.tenant_id.in_(user_tenant_ids))
        if tenant_name and tenant_name.upper() != 'ALL':
            query = query.join(Tenant, ChatRequest.tenant_id == Tenant.id).filter(
                (func.lower(Tenant.name) == tenant_name.lower()) | (Tenant.id == tenant_name)
            )
    else:
        raise HTTPException(status_code=401, detail="Authentication required")

    if session_id:
        query = query.filter(ChatRequest.session_id == session_id)
    if request_source and request_source != 'ALL':
        query = query.filter(ChatRequest.request_source == request_source)
    if status and status != 'ALL':
        query = query.filter(ChatRequest.status == status)
    if search:
        query = query.filter(ChatRequest.user_message.ilike(f"%{search}%"))
    query = query.order_by(ChatRequest.created_at.desc())

    def serialize(r):
        tenant_obj = db.query(Tenant).filter(Tenant.id == r.tenant_id).first() if r.tenant_id else None
        return {
            "id": r.id,
            "tenant_name": tenant_obj.name if tenant_obj else "Default Workspace",
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
            "primary_model_name": r.primary_model_name or r.model_name,
            "primary_prompt_tokens": r.primary_prompt_tokens or 0,
            "primary_completion_tokens": r.primary_completion_tokens or 0,
            "primary_cost_usd": getattr(r, "primary_cost_usd", 0.0) or 0.0,
            "secondary_model_name": r.secondary_model_name,
            "secondary_prompt_tokens": r.secondary_prompt_tokens or 0,
            "secondary_completion_tokens": r.secondary_completion_tokens or 0,
            "secondary_cost_usd": getattr(r, "secondary_cost_usd", 0.0) or 0.0,
            "status": r.status,
            "error_detail": r.error_detail,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "completed_at": r.completed_at.isoformat() if r.completed_at else None
        }
    return get_paginated_response(query, page, page_size, serialize)


@router.get("/requests/{request_id}")
def get_chat_request_detail(
    request_id: str,
    db: Session = Depends(get_db),
    auth: dict = Depends(resolve_auth_context)
):
    if auth.get("tenant"):
        r = db.query(ChatRequest).filter(
            ChatRequest.id == request_id,
            ChatRequest.tenant_id == auth["tenant"].id
        ).first()
    elif auth.get("user"):
        user_tenant_ids = db.query(Tenant.id).filter(Tenant.user_id == auth["user"].id)
        r = db.query(ChatRequest).filter(
            ChatRequest.id == request_id,
            ChatRequest.tenant_id.in_(user_tenant_ids)
        ).first()
    else:
        raise HTTPException(status_code=401, detail="Authentication required")

    if not r:
        raise HTTPException(status_code=404, detail="Request not found")
    tenant_obj = db.query(Tenant).filter(Tenant.id == r.tenant_id).first() if r.tenant_id else None
    logs = db.query(ExecutionLog).filter(
        ExecutionLog.request_id == request_id,
        ExecutionLog.tenant_id == r.tenant_id
    ).order_by(ExecutionLog.created_at.asc()).all()
    return {
        "id": r.id,
        "tenant_name": tenant_obj.name if tenant_obj else "Default Workspace",
        "session_id": r.session_id,
        "app_id": r.app_id,
        "model_name": r.model_name,
        "request_source": r.request_source,
        "user_message": r.user_message,
        "user_data": json.loads(r.user_data) if getattr(r, "user_data", None) and isinstance(r.user_data, str) else getattr(r, "user_data", None),
        "assistant_response": r.assistant_response,
        "tools_called": r.tools_called or 0,
        "total_duration_ms": r.total_duration_ms,
        "prompt_tokens": r.prompt_tokens or 0,
        "completion_tokens": r.completion_tokens or 0,
        "cost_usd": getattr(r, "cost_usd", 0.0) or 0.0,
        "primary_model_name": r.primary_model_name or r.model_name,
        "primary_prompt_tokens": r.primary_prompt_tokens or 0,
        "primary_completion_tokens": r.primary_completion_tokens or 0,
        "primary_cost_usd": getattr(r, "primary_cost_usd", 0.0) or 0.0,
        "secondary_model_name": r.secondary_model_name,
        "secondary_prompt_tokens": r.secondary_prompt_tokens or 0,
        "secondary_completion_tokens": r.secondary_completion_tokens or 0,
        "secondary_cost_usd": getattr(r, "secondary_cost_usd", 0.0) or 0.0,
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


@router.get("/usage")
@router.get("/usage/summary")
def get_usage_summary(
    tenant_name: Optional[str] = None,
    model_name: Optional[str] = None,
    request_source: Optional[str] = None,
    page: Optional[int] = 1,
    page_size: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    target_page = page or 1
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

    # Sub-agent and media model executions aggregation from ExecutionLog
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

    paginated_res = get_paginated_response(summary, target_page, page_size, lambda x: x, is_query=False)
    paginated_res["totals"] = {
        "request_count": total_req_calc,
        "prompt_tokens": total_prompt_calc,
        "completion_tokens": total_completion_calc,
        "cost_usd": round(total_cost_calc, 6)
    }
    return paginated_res
