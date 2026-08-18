from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db
from models import ExecutionLog, Tenant, User, ChatRequest
from auth import get_current_user
from utils import get_paginated_response

router = APIRouter()

@router.get("/filters")
def get_logs_filters(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    search_tenant: Optional[str] = None,
    search_model: Optional[str] = None
):
    t_query = db.query(Tenant.name).join(ExecutionLog).distinct()
    if search_tenant:
        t_query = t_query.filter(Tenant.name.ilike(f"%{search_tenant}%"))
    tenants = t_query.limit(10).all() if not search_tenant else t_query.all()
    
    m_query = db.query(ExecutionLog.model_name).distinct()
    if search_model:
        m_query = m_query.filter(ExecutionLog.model_name.ilike(f"%{search_model}%"))
    models = m_query.limit(10).all() if not search_model else m_query.all()
    
    return {
        "tenants": [t[0] for t in tenants if t[0]],
        "models": [m[0] for m in models if m[0]]
    }


@router.get("")
def get_logs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: Optional[int] = None,
    page_size: int = 20,
    request_source: Optional[str] = None,
    tenant_name: Optional[str] = None,
    model_name: Optional[str] = None,
    sandbox_type: Optional[str] = None
):
    query = db.query(ExecutionLog)
    if request_source:
        if request_source == 'dashboard':
            query = query.filter(ExecutionLog.request_source == 'dashboard')
        else:
            query = query.filter(ExecutionLog.request_source != 'dashboard')
    if tenant_name and tenant_name != 'ALL':
        query = query.join(Tenant).filter(Tenant.name == tenant_name)
    if model_name and model_name != 'ALL':
        query = query.filter(ExecutionLog.model_name == model_name)
    if sandbox_type and sandbox_type != 'ALL':
        query = query.filter(ExecutionLog.sandbox_type == sandbox_type.lower())
        
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
    current_user: User = Depends(get_current_user),
    page: Optional[int] = None,
    page_size: int = 20,
    request_source: Optional[str] = None,
    tenant_name: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None
):
    query = db.query(ChatRequest)
    if request_source and request_source != 'ALL':
        query = query.filter(ChatRequest.request_source == request_source)
    if status and status != 'ALL':
        query = query.filter(ChatRequest.status == status)
    if tenant_name and tenant_name != 'ALL':
        query = query.join(Tenant).filter(Tenant.name == tenant_name)
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
    current_user: User = Depends(get_current_user)
):
    r = db.query(ChatRequest).filter(ChatRequest.id == request_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Request not found")
    tenant_obj = db.query(Tenant).filter(Tenant.id == r.tenant_id).first() if r.tenant_id else None
    logs = db.query(ExecutionLog).filter(ExecutionLog.request_id == request_id).order_by(ExecutionLog.created_at.asc()).all()
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
    page: Optional[int] = None,
    page_size: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
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
    if request_source and request_source != "ALL":
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
            t = db.query(Tenant).filter(Tenant.id == tenant_id).first() if tenant_id else None
            tenant_cache[tenant_id] = t.name if t else "Default Workspace"

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
    if request_source and request_source != "ALL":
        totals_query = totals_query.filter(ChatRequest.request_source == request_source)

    totals_res = totals_query.first()
    sum_cost = round(totals_res.cost_usd or 0.0, 6) if totals_res else 0.0
    sum_req = totals_res.request_count if totals_res else 0
    sum_prompt = totals_res.prompt_tokens if totals_res else 0
    sum_completion = totals_res.completion_tokens if totals_res else 0

    paginated_res = get_paginated_response(summary, page, page_size, lambda x: x, is_query=False)
    paginated_res["totals"] = {
        "request_count": sum_req,
        "prompt_tokens": sum_prompt,
        "completion_tokens": sum_completion,
        "cost_usd": sum_cost
    }
    return paginated_res
