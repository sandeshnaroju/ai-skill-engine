from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from sqlalchemy.orm import Session
from database import get_db
from schemas import *
from models import Tenant, User
from auth import get_current_user, get_current_tenant, generate_api_key
from utils import get_paginated_response

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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(Tenant).filter(Tenant.id == tenant_id)
    if current_user.id != "system":
        query = query.filter(Tenant.user_id == current_user.id)
    tenant = query.first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
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
    
    encrypted_key = encrypt_key(payload.api_key)
    
    if existing:
        existing.provider = payload.provider
        existing.api_key_encrypted = encrypted_key
        existing.base_url = payload.base_url
        existing.input_rate = payload.input_rate
        existing.output_rate = payload.output_rate
        existing.audio_input_rate = payload.audio_input_rate
        existing.audio_output_rate = payload.audio_output_rate
        existing.is_active = True
        db.commit()
        db.refresh(existing)
        return {"status": "updated", "id": existing.id}
    else:
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


