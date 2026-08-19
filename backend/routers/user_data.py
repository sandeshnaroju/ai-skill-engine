import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Tenant
from auth import get_current_tenant
from schemas import UserDataTemplateCreate
from utils import get_paginated_response

router = APIRouter()


@router.get("")
def list_user_data_templates(
    db: Session = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant),
    page: Optional[int] = None,
    page_size: int = 10,
    search: Optional[str] = None
):
    from models import UserDataTemplate
    from sqlalchemy.orm import joinedload
    query = db.query(UserDataTemplate).options(joinedload(UserDataTemplate.tenant)).filter(
        (UserDataTemplate.tenant_id == current_tenant.id) | (UserDataTemplate.tenant_id == None)
    )
    if search:
        query = query.filter(
            UserDataTemplate.name.ilike(f"%{search}%") | UserDataTemplate.description.ilike(f"%{search}%")
        )
    query = query.order_by(UserDataTemplate.created_at.desc())

    def serialize(t):
        try:
            parsed_data = json.loads(t.data)
        except Exception:
            parsed_data = {}
        return {
            "id": t.id,
            "name": t.name,
            "description": t.description,
            "data": parsed_data,
            "tenant_id": t.tenant_id,
            "tenant_name": t.tenant.name if t.tenant else "Global",
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "updated_at": t.updated_at.isoformat() if t.updated_at else None
        }
    return get_paginated_response(query, page, page_size, serialize)


@router.post("")
def create_or_update_user_data_template(
    payload: UserDataTemplateCreate,
    db: Session = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant)
):
    from models import UserDataTemplate
    clean_name = payload.name.strip()
    if not clean_name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")

    data_str = json.dumps(payload.data)

    target_tenant_id = current_tenant.id
    if payload.tenant_id:
        from models import Tenant as DBTenant
        tenant_check = db.query(DBTenant).filter(DBTenant.id == payload.tenant_id, DBTenant.user_id == current_tenant.user_id).first()
        if tenant_check:
            target_tenant_id = tenant_check.id

    existing = db.query(UserDataTemplate).filter(
        UserDataTemplate.name == clean_name,
        UserDataTemplate.tenant_id == target_tenant_id
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"A User Data context profile named '{clean_name}' already exists for this tenant workspace. Duplicate profile names are not allowed."
        )

    tpl = UserDataTemplate(
        name=clean_name,
        tenant_id=target_tenant_id,
        description=payload.description,
        data=data_str
    )
    db.add(tpl)
    db.commit()
    db.refresh(tpl)
    return {
        "status": "success",
        "template_id": tpl.id,
        "name": tpl.name,
        "data": payload.data
    }


@router.put("/{template_id}")
def update_user_data_template(
    template_id: str,
    payload: UserDataTemplateCreate,
    db: Session = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant)
):
    from models import UserDataTemplate, Tenant as DBTenant
    clean_name = payload.name.strip()
    data_str = json.dumps(payload.data)

    tpl = db.query(UserDataTemplate).filter(UserDataTemplate.id == template_id).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="User Data profile not found")

    if tpl.tenant_id and tpl.tenant_id != current_tenant.id:
        target_tenant = db.query(DBTenant).filter(DBTenant.id == tpl.tenant_id).first()
        if target_tenant and target_tenant.user_id != current_tenant.user_id:
            raise HTTPException(status_code=403, detail="Permission denied to update profile from this tenant workspace.")

    tpl.name = clean_name
    tpl.description = payload.description
    tpl.data = data_str
    db.commit()
    db.refresh(tpl)
    return {
        "status": "success",
        "template_id": tpl.id,
        "name": tpl.name,
        "data": payload.data
    }


@router.delete("/{template_id}")
def delete_user_data_template(
    template_id: str,
    db: Session = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant)
):
    from models import UserDataTemplate, Tenant as DBTenant
    tpl = db.query(UserDataTemplate).filter(UserDataTemplate.id == template_id).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
        
    if tpl.tenant_id and tpl.tenant_id != current_tenant.id:
        target_tenant = db.query(DBTenant).filter(DBTenant.id == tpl.tenant_id).first()
        if target_tenant and target_tenant.user_id != current_tenant.user_id:
            raise HTTPException(status_code=403, detail="Permission denied to delete profile from this tenant workspace.")

    db.delete(tpl)
    db.commit()
    return {"status": "deleted", "template_id": template_id}
