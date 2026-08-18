from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from sqlalchemy.orm import Session
from database import get_db
from schemas import AppCreate, AppDuplicateRequest
from models import Tenant
from auth import get_current_tenant
from utils import get_paginated_response
from skill_registry import skill_registry

router = APIRouter()

@router.get("")
def list_apps(
    db: Session = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant),
    tenant_id: Optional[str] = None,
    page: Optional[int] = None,
    page_size: int = 10,
    search: Optional[str] = None
):
    from models import AppModel
    from sqlalchemy.orm import joinedload
    target_tenant_id = tenant_id if tenant_id is not None else current_tenant.id
    query = db.query(AppModel).options(joinedload(AppModel.tenant))
    if target_tenant_id:
        query = query.filter((AppModel.tenant_id == target_tenant_id) | (AppModel.tenant_id == None))
    if search:
        query = query.filter(AppModel.name.ilike(f"%{search}%") | AppModel.description.ilike(f"%{search}%"))
    query = query.order_by(AppModel.created_at.desc())
    
    def serialize(a):
        skill_list = [s.skill_name for s in a.skills]
        total_tools = 0
        for sk_name in skill_list:
            sk_data = skill_registry.get_skills_dict(tenant_id=target_tenant_id or current_tenant.id).get(sk_name)
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
    else:
        existing = db.query(AppModel).filter(
            AppModel.name == clean_name,
            (AppModel.tenant_id == target_tenant_id) | (AppModel.tenant_id == None)
        ).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"An App container named '{clean_name}' already exists for this tenant workspace. Duplicate app names are not allowed."
            )

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
    from models import AppModel, AppSkillMapping, Tenant as DBTenant
    app_obj = db.query(AppModel).filter(AppModel.id == app_id).first()
    if not app_obj:
        raise HTTPException(status_code=404, detail="App container not found")
        
    if app_obj.tenant_id and app_obj.tenant_id != current_tenant.id:
        target_tenant = db.query(DBTenant).filter(DBTenant.id == app_obj.tenant_id).first()
        if target_tenant and target_tenant.user_id != current_tenant.user_id:
            raise HTTPException(status_code=403, detail="Permission denied to delete app from this tenant workspace.")

    db.query(AppSkillMapping).filter(AppSkillMapping.app_id == app_obj.id).delete()
    db.delete(app_obj)
    db.commit()
    return {"status": "deleted", "app_id": app_id}


@router.post("/{app_id}/duplicate")
def duplicate_app(
    app_id: str,
    payload: AppDuplicateRequest,
    db: Session = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant)
):
    from models import AppModel, AppSkillMapping, CustomSkill, Tenant as DBTenant
    source_app = db.query(AppModel).filter(AppModel.id == app_id).first()
    if not source_app:
        raise HTTPException(status_code=404, detail="App container not found.")

    target_name = (payload.new_app_name or source_app.name).strip()
    if not target_name:
        raise HTTPException(status_code=400, detail="App name cannot be empty.")

    if not payload.target_tenant_ids:
        raise HTTPException(status_code=400, detail="At least one target tenant workspace must be selected.")

    source_skill_names = [s.skill_name for s in source_app.skills]

    created_tenants = []
    errors = []

    for tid in payload.target_tenant_ids:
        t_check = db.query(DBTenant).filter(DBTenant.id == tid).first()
        if not t_check:
            continue
            
        existing = db.query(AppModel).filter(
            AppModel.name == target_name,
            AppModel.tenant_id == tid
        ).first()
        if existing:
            errors.append(f"App container '{target_name}' already exists in workspace '{t_check.name}'")
            continue

        new_app = AppModel(
            name=target_name,
            tenant_id=tid,
            description=source_app.description,
            icon=source_app.icon or "box"
        )
        db.add(new_app)
        db.commit()
        db.refresh(new_app)

        for s_name in source_skill_names:
            # 1. If it's a custom DB skill, ensure target tenant has a copy of it
            custom_source_skill = db.query(CustomSkill).filter(
                CustomSkill.name == s_name,
                (CustomSkill.tenant_id == source_app.tenant_id) | (CustomSkill.tenant_id == None)
            ).first()
            if custom_source_skill:
                existing_target_skill = db.query(CustomSkill).filter(
                    CustomSkill.name == s_name,
                    CustomSkill.tenant_id == tid
                ).first()
                if not existing_target_skill:
                    new_custom_skill = CustomSkill(
                        name=custom_source_skill.name,
                        description=custom_source_skill.description,
                        content=custom_source_skill.content,
                        tenant_id=tid,
                        is_active=True
                    )
                    db.add(new_custom_skill)
                    db.commit()

            # 2. Add AppSkillMapping for the target app container
            mapping = AppSkillMapping(app_id=new_app.id, skill_name=s_name)
            db.add(mapping)
        db.commit()

        # Reload skill registry for target tenant so newly copied custom skills are immediately active
        skill_registry.reload_skills(tenant_id=tid, db=db)

        created_tenants.append(t_check.name)

    if not created_tenants and errors:
        raise HTTPException(status_code=400, detail="; ".join(errors))

    return {
        "status": "duplicated",
        "app_name": target_name,
        "copied_to_tenants": created_tenants,
        "warnings": errors
    }


