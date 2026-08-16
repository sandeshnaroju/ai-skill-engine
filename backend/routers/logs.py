from fastapi import APIRouter, Depends
from typing import Optional
from sqlalchemy.orm import Session
from database import get_db
from models import ExecutionLog, Tenant, User
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
