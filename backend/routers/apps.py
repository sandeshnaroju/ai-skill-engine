from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from sqlalchemy.orm import Session
from database import get_db
from schemas import AppCreate
from models import Tenant
from auth import get_current_tenant
from utils import get_paginated_response
from skill_registry import skill_registry

router = APIRouter()

@router.get("")
def list_apps(
    db: Session = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant),
    page: Optional[int] = None,
    page_size: int = 10,
    search: Optional[str] = None
):
    from models import AppModel
    from sqlalchemy.orm import joinedload
    query = db.query(AppModel).options(joinedload(AppModel.tenant)).filter(
        (AppModel.tenant_id == current_tenant.id) | (AppModel.tenant_id == None)
    )
    if search:
        query = query.filter(AppModel.name.ilike(f"%{search}%") | AppModel.description.ilike(f"%{search}%"))
    query = query.order_by(AppModel.created_at.desc())
    
    def serialize(a):
        skill_list = [s.skill_name for s in a.skills]
        total_tools = 0
        for sk_name in skill_list:
            sk_data = skill_registry.get_skills_dict(tenant_id=current_tenant.id).get(sk_name)
            if sk_data:
                total_tools += len(sk_data.get("tools", []))
        return {
            "id": a.id,
            "name": a.name,
            "description": a.description,
            "icon": a.icon,
            "tenant_id": a.tenant_id,
            "tenant_name": a.tenant.name if a.tenant else "Global",
            "skill_names": skill_list,
            "skills_count": len(skill_list),
            "tools_count": total_tools,
            "created_at": a.created_at.isoformat() if a.created_at else None
        }
    return get_paginated_response(query, page, page_size, serialize)


@router.post("")
def create_app(
    payload: AppCreate,
    db: Session = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant)
):
    from models import AppModel, AppSkillMapping
    clean_name = payload.name.strip()
    target_tenant_id = current_tenant.id
    if payload.tenant_id:
        from models import Tenant as DBTenant
        tenant_check = db.query(DBTenant).filter(DBTenant.id == payload.tenant_id, DBTenant.user_id == current_tenant.user_id).first()
        if tenant_check:
            target_tenant_id = tenant_check.id

    app_obj = None
    if payload.id:
        app_obj = db.query(AppModel).filter(AppModel.id == payload.id).first()
    if not app_obj:
        app_obj = db.query(AppModel).filter(AppModel.name == clean_name).first()

    if not app_obj:
        app_obj = AppModel(
            name=clean_name,
            tenant_id=target_tenant_id,
            description=payload.description,
            icon=payload.icon or "box"
        )
        db.add(app_obj)
        db.commit()
        db.refresh(app_obj)
    else:
        app_obj.name = clean_name
        app_obj.description = payload.description
        app_obj.icon = payload.icon or "box"
        if payload.tenant_id:
            app_obj.tenant_id = target_tenant_id
        db.query(AppSkillMapping).filter(AppSkillMapping.app_id == app_obj.id).delete()
        db.commit()

    for s_name in payload.skill_names:
        db.add(AppSkillMapping(app_id=app_obj.id, skill_name=s_name))
    db.commit()

    return {"status": "created", "app_id": app_obj.id, "name": app_obj.name}


@router.delete("/{app_id}")
def delete_app(
    app_id: str,
    db: Session = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant)
):
    from models import AppModel
    app_obj = db.query(AppModel).filter(
        AppModel.id == app_id,
        AppModel.tenant_id == current_tenant.id
    ).first()
    if not app_obj:
        raise HTTPException(status_code=404, detail="App not found")
    db.delete(app_obj)
    db.commit()
    return {"status": "deleted", "app_id": app_id}


