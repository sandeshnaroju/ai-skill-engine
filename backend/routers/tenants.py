from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from sqlalchemy.orm import Session
from database import get_db
from schemas import TenantCreate, TenantLlmCreate, TenantLimitsUpdate
from models import Tenant, User
from auth import get_current_user, get_current_tenant, generate_api_key
from utils import get_paginated_response
from engine.limits import get_tenant_aggregated_usage

router = APIRouter()

@router.get("s")
def get_tenants(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    page: Optional[int] = None,
    page_size: int = 10,
    search: Optional[str] = None
):
    query = db.query(Tenant)
    if current_user.id != "system":
        query = query.filter(Tenant.user_id == current_user.id)
    if search:
        query = query.filter(Tenant.name.ilike(f"%{search}%"))
    query = query.order_by(Tenant.created_at.desc())
    def serialize(t):
        return {
            "id": t.id,
            "name": t.name,
            "api_key": t.api_key,
            "is_active": t.is_active,
            "models_count": len(t.llms) if t.llms else 0,
            "max_context_tokens": t.max_context_tokens or 1_000_000,
            "daily_token_limit": t.daily_token_limit,
            "daily_cost_limit": t.daily_cost_limit,
            "monthly_token_limit": t.monthly_token_limit,
            "monthly_cost_limit": t.monthly_cost_limit,
            "created_at": t.created_at.isoformat() if t.created_at else None
        }
    return get_paginated_response(query, page, page_size, serialize)


@router.post("s")
def create_tenant(
    payload: TenantCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    import re
    name_val = payload.name.strip()
    if not name_val:
        raise HTTPException(status_code=400, detail="Tenant name cannot be empty.")
    if " " in name_val:
        raise HTTPException(status_code=400, detail="Tenant name must not contain spaces.")
    if not re.match(r"^[a-zA-Z0-9_-]+$", name_val):
        raise HTTPException(status_code=400, detail="Tenant name can only contain alphanumeric characters, underscores, and hyphens.")
    
    existing = db.query(Tenant).filter(Tenant.name.ilike(name_val)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Tenant name already exists.")

    tenant = Tenant(
        name=name_val,
        api_key=generate_api_key(),
        is_active=True,
        user_id=current_user.id if current_user.id != "system" else None
    )
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    return {
        "id": tenant.id,
        "name": tenant.name,
        "api_key": tenant.api_key,
        "created_at": tenant.created_at.isoformat()
    }


@router.delete("s/{tenant_id}")
def delete_tenant(
    tenant_id: str,
    confirm_name: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(Tenant).filter(Tenant.id == tenant_id)
    if current_user.id != "system":
        query = query.filter(Tenant.user_id == current_user.id)
    tenant = query.first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    # Prevent deleting user's primary/default workspace
    user_tenants = db.query(Tenant).filter(Tenant.user_id == tenant.user_id).order_by(Tenant.created_at.asc()).all()
    if user_tenants and user_tenants[0].id == tenant.id:
        raise HTTPException(status_code=400, detail="Cannot delete your primary default workspace.")

    if confirm_name.strip() != tenant.name.strip():
        raise HTTPException(status_code=400, detail=f"Confirmation name '{confirm_name}' does not match tenant name '{tenant.name}'.")

    db.delete(tenant)
    db.commit()
    return {"status": "deleted", "tenant_id": tenant_id}


@router.get("/llms")
def list_tenant_llms(
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: Optional[int] = None,
    page_size: int = 10,
    search: Optional[str] = None
):
    from models import TenantLLM
    query = db.query(TenantLLM).filter(TenantLLM.tenant_id == tenant.id)
    if search:
        query = query.filter(TenantLLM.model_name.ilike(f"%{search}%") | TenantLLM.provider.ilike(f"%{search}%"))
    query = query.order_by(TenantLLM.created_at.desc())
    def serialize(l):
        return {
            "id": l.id,
            "provider": l.provider,
            "model_name": l.model_name,
            "base_url": l.base_url,
            "input_rate": l.input_rate,
            "output_rate": l.output_rate,
            "audio_input_rate": l.audio_input_rate,
            "audio_output_rate": l.audio_output_rate,
            "is_active": l.is_active,
            "created_at": l.created_at.isoformat() if l.created_at else None
        }
    return get_paginated_response(query, page, page_size, serialize)


@router.post("/llms")
def create_tenant_llm(
    payload: TenantLlmCreate,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from models import TenantLLM
    from encryption_utils import encrypt_key
    
    existing = db.query(TenantLLM).filter(
        TenantLLM.tenant_id == tenant.id,
        TenantLLM.model_name == payload.model_name
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"An LLM model with the name '{payload.model_name}' is already configured for this tenant workspace. Duplicate model names are not allowed."
        )

    encrypted_key = encrypt_key(payload.api_key)
    
    new_llm = TenantLLM(
        tenant_id=tenant.id,
        provider=payload.provider,
        model_name=payload.model_name,
        api_key_encrypted=encrypted_key,
        base_url=payload.base_url,
        input_rate=payload.input_rate,
        output_rate=payload.output_rate,
        audio_input_rate=payload.audio_input_rate,
        audio_output_rate=payload.audio_output_rate,
        is_active=True
    )
    db.add(new_llm)
    db.commit()
    db.refresh(new_llm)
    return {"status": "created", "id": new_llm.id}


@router.put("/llms/{llm_id}")
def update_tenant_llm(
    llm_id: str,
    payload: TenantLlmCreate,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from models import TenantLLM
    from encryption_utils import encrypt_key
    
    existing = db.query(TenantLLM).filter(
        TenantLLM.id == llm_id,
        TenantLLM.tenant_id == tenant.id
    ).first()
    
    if not existing:
        raise HTTPException(status_code=404, detail="LLM configuration not found")
        
    encrypted_key = encrypt_key(payload.api_key) if payload.api_key else existing.api_key_encrypted
    
    existing.provider = payload.provider
    existing.model_name = payload.model_name
    existing.api_key_encrypted = encrypted_key
    existing.base_url = payload.base_url
    existing.input_rate = payload.input_rate
    existing.output_rate = payload.output_rate
    existing.audio_input_rate = payload.audio_input_rate
    existing.audio_output_rate = payload.audio_output_rate
    
    db.commit()
    db.refresh(existing)
    return {"status": "updated", "id": existing.id}


@router.delete("/llms/{llm_id}")
def delete_tenant_llm(
    llm_id: str,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from models import TenantLLM
    llm = db.query(TenantLLM).filter(
        TenantLLM.id == llm_id,
        TenantLLM.tenant_id == tenant.id
    ).first()
    
    if not llm:
        raise HTTPException(status_code=404, detail="LLM configuration not found")
        
    db.delete(llm)
    db.commit()
    return {"status": "deleted", "id": llm_id}


@router.get("s/{tenant_id}/limits")
def get_tenant_limits(
    tenant_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    if current_user.id != "system" and tenant.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this tenant's limits")

    usage = get_tenant_aggregated_usage(db, tenant.id, tenant=tenant)
    return {
        "tenant_id": tenant.id,
        "tenant_name": tenant.name,
        "limits": {
            "max_context_tokens": tenant.max_context_tokens or 1_000_000,
            "session_token_limit": tenant.session_token_limit,
            "session_cost_limit": tenant.session_cost_limit,
            "daily_token_limit": tenant.daily_token_limit,
            "daily_cost_limit": tenant.daily_cost_limit,
            "monthly_token_limit": tenant.monthly_token_limit,
            "monthly_cost_limit": tenant.monthly_cost_limit,
            "yearly_token_limit": tenant.yearly_token_limit,
            "yearly_cost_limit": tenant.yearly_cost_limit,
            "timezone": tenant.timezone or "UTC",
            "daily_reset_time": tenant.daily_reset_time or "00:00",
            "monthly_reset_day": tenant.monthly_reset_day or 1,
            "yearly_reset_month": tenant.yearly_reset_month or 1,
            "yearly_reset_day": tenant.yearly_reset_day or 1,
        },
        "usage": usage
    }


@router.put("s/{tenant_id}/limits")
def update_tenant_limits(
    tenant_id: str,
    payload: TenantLimitsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    if current_user.id != "system" and tenant.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this tenant's limits")

    tenant.max_context_tokens = payload.max_context_tokens if payload.max_context_tokens and payload.max_context_tokens > 0 else 1_000_000
    tenant.session_token_limit = payload.session_token_limit if payload.session_token_limit and payload.session_token_limit > 0 else None
    tenant.session_cost_limit = payload.session_cost_limit if payload.session_cost_limit and payload.session_cost_limit > 0 else None
    tenant.daily_token_limit = payload.daily_token_limit if payload.daily_token_limit and payload.daily_token_limit > 0 else None
    tenant.daily_cost_limit = payload.daily_cost_limit if payload.daily_cost_limit and payload.daily_cost_limit > 0 else None
    tenant.monthly_token_limit = payload.monthly_token_limit if payload.monthly_token_limit and payload.monthly_token_limit > 0 else None
    tenant.monthly_cost_limit = payload.monthly_cost_limit if payload.monthly_cost_limit and payload.monthly_cost_limit > 0 else None
    tenant.yearly_token_limit = payload.yearly_token_limit if payload.yearly_token_limit and payload.yearly_token_limit > 0 else None
    tenant.yearly_cost_limit = payload.yearly_cost_limit if payload.yearly_cost_limit and payload.yearly_cost_limit > 0 else None

    if payload.timezone:
        tenant.timezone = payload.timezone.strip()
    if payload.daily_reset_time:
        tenant.daily_reset_time = payload.daily_reset_time.strip()
    if payload.monthly_reset_day:
        tenant.monthly_reset_day = max(1, min(28, payload.monthly_reset_day))
    if payload.yearly_reset_month:
        tenant.yearly_reset_month = max(1, min(12, payload.yearly_reset_month))
    if payload.yearly_reset_day:
        tenant.yearly_reset_day = max(1, min(28, payload.yearly_reset_day))

    db.commit()
    db.refresh(tenant)

    usage = get_tenant_aggregated_usage(db, tenant.id, tenant=tenant)
    return {
        "status": "success",
        "message": f"Quotas & Limits for '{tenant.name}' updated successfully",
        "limits": {
            "max_context_tokens": tenant.max_context_tokens,
            "session_token_limit": tenant.session_token_limit,
            "session_cost_limit": tenant.session_cost_limit,
            "daily_token_limit": tenant.daily_token_limit,
            "daily_cost_limit": tenant.daily_cost_limit,
            "monthly_token_limit": tenant.monthly_token_limit,
            "monthly_cost_limit": tenant.monthly_cost_limit,
            "yearly_token_limit": tenant.yearly_token_limit,
            "yearly_cost_limit": tenant.yearly_cost_limit,
            "timezone": tenant.timezone,
            "daily_reset_time": tenant.daily_reset_time,
            "monthly_reset_day": tenant.monthly_reset_day,
            "yearly_reset_month": tenant.yearly_reset_month,
            "yearly_reset_day": tenant.yearly_reset_day,
        },
        "usage": usage
    }
