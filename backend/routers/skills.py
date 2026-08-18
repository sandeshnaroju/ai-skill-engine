import os
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from sqlalchemy.orm import Session
from database import get_db
from schemas import SkillSaveRequest, SkillDuplicateRequest
from models import Tenant
from auth import get_current_tenant
from utils import get_paginated_response
from skill_registry import skill_registry

router = APIRouter()

@router.get("")
def list_skills(
    db: Session = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant),
    page: Optional[int] = None,
    page_size: int = 15,
    search: Optional[str] = None
):
    skill_registry.reload_skills(tenant_id=current_tenant.id, db=db)
    all_skills = skill_registry.list_skills(tenant_id=current_tenant.id)
    # Sort by latest first
    all_skills = sorted(all_skills, key=lambda s: s.get("created_at") or 0.0, reverse=True)
    if search:
        search_lower = search.lower()
        all_skills = [s for s in all_skills if search_lower in s.get("name", "").lower() or search_lower in s.get("description", "").lower()]
    def serialize(s):
        return s
    res = get_paginated_response(all_skills, page, page_size, serialize, is_query=False)
    if isinstance(res, list):
        return {
            "skills": res,
            "tools_schema": skill_registry.get_openai_tools(tenant_id=current_tenant.id)
        }
    else:
        res["tools_schema"] = skill_registry.get_openai_tools(tenant_id=current_tenant.id)
        return res


def validate_skill_content(content: str):
    import yaml
    parts = content.split("---", 2)
    if len(parts) >= 3:
        frontmatter_raw = parts[1]
        try:
            yaml.safe_load(frontmatter_raw)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid YAML in skill frontmatter: {str(e)}")


@router.post("")
def create_skill(
    payload: SkillSaveRequest,
    db: Session = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant)
):
    clean_name = payload.skill_name.strip().lower().replace(" ", "_")
    import re as _re
    if not _re.match(r'^[a-z0-9_]+$', clean_name):
        raise HTTPException(status_code=400, detail="Skill name can only contain lowercase letters (a-z), numbers (0-9), and underscores (_). No spaces or special characters allowed.")
    from models import CustomSkill
    
    validate_skill_content(payload.content)

    target_tenant_id = current_tenant.id
    if payload.tenant_id:
        from models import Tenant as DBTenant
        tenant_check = db.query(DBTenant).filter(DBTenant.id == payload.tenant_id, DBTenant.user_id == current_tenant.user_id).first()
        if tenant_check:
            target_tenant_id = tenant_check.id

    existing = db.query(CustomSkill).filter(
        CustomSkill.name == clean_name,
        CustomSkill.tenant_id == target_tenant_id
    ).first()

    file_skills = skill_registry.get_skills_dict(tenant_id=target_tenant_id)
    if clean_name in file_skills or existing:
        raise HTTPException(
            status_code=400,
            detail=f"A skill with the name '{clean_name}' already exists for this tenant workspace. Duplicate skill names are not allowed."
        )

    new_skill = CustomSkill(
        name=clean_name,
        description=payload.skill_name,
        content=payload.content,
        tenant_id=target_tenant_id,
        is_active=True
    )
    db.add(new_skill)
    db.commit()
    skill_registry.reload_skills(tenant_id=current_tenant.id, db=db)
    return {"status": "created", "skill_name": clean_name, "source": "database"}


@router.get("/{skill_name}")
def get_skill_content(
    skill_name: str,
    tenant_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant)
):
    target_tenant_id = tenant_id or current_tenant.id
    skill_registry.reload_skills(tenant_id=target_tenant_id, db=db)
    skill_data = skill_registry.get_skills_dict(tenant_id=target_tenant_id).get(skill_name)
    if not skill_data:
        raise HTTPException(status_code=404, detail="Skill not found")
    
    if skill_data.get("source") == "database":
        return {"skill_name": skill_name, "content": skill_data.get("content", ""), "source": "database"}
    elif skill_data.get("filepath") and os.path.exists(skill_data["filepath"]):
        with open(skill_data["filepath"], "r", encoding="utf-8") as f:
            content = f.read()
        return {"skill_name": skill_name, "content": content, "source": "file"}
    
    raise HTTPException(status_code=404, detail="Skill file content not available")


@router.put("/{skill_name}")
def update_skill(
    skill_name: str,
    payload: SkillSaveRequest,
    db: Session = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant)
):
    from models import CustomSkill
    clean_name = skill_name.strip().lower().replace(" ", "_")
    
    validate_skill_content(payload.content)
    target_tenant_id = payload.tenant_id or current_tenant.id
    
    existing = db.query(CustomSkill).filter(
        CustomSkill.name == clean_name,
        CustomSkill.tenant_id == target_tenant_id
    ).first()
    if existing:
        existing.content = payload.content
        db.commit()
    else:
        # If user edits a default file skill from UI, save the edited copy into DB
        new_skill = CustomSkill(
            name=clean_name,
            description=clean_name,
            content=payload.content,
            tenant_id=target_tenant_id,
            is_active=True
        )
        db.add(new_skill)
        db.commit()

    skill_registry.reload_skills(tenant_id=target_tenant_id, db=db)
    return {"status": "updated", "skill_name": clean_name, "source": "database"}


@router.delete("/{skill_name}")
def delete_skill(
    skill_name: str,
    tenant_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant)
):
    from models import CustomSkill
    clean_name = skill_name.strip().lower().replace(" ", "_")
    target_tenant_id = tenant_id or current_tenant.id
    
    existing = db.query(CustomSkill).filter(
        CustomSkill.name == clean_name,
        (CustomSkill.tenant_id == target_tenant_id) | (CustomSkill.tenant_id == None)
    ).first()
    if existing:
        db.delete(existing)
        db.commit()
        skill_registry.reload_skills(tenant_id=target_tenant_id, db=db)
        return {"status": "deleted", "skill_name": clean_name}
    else:
        raise HTTPException(status_code=400, detail="Cannot delete built-in default file skills. Only DB dynamic skills can be deleted.")


@router.post("/{skill_name}/duplicate")
def duplicate_skill(
    skill_name: str,
    payload: SkillDuplicateRequest,
    db: Session = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant)
):
    from models import CustomSkill, Tenant as DBTenant
    source_clean_name = skill_name.strip().lower().replace(" ", "_")
    
    content = None
    source_db_skill = db.query(CustomSkill).filter(
        CustomSkill.name == source_clean_name,
        CustomSkill.tenant_id == current_tenant.id
    ).first()
    if source_db_skill:
        content = source_db_skill.content
    else:
        file_skills = skill_registry.get_skills_dict(tenant_id=current_tenant.id)
        if source_clean_name in file_skills:
            content = file_skills[source_clean_name].get("content")
            
    if not content:
        all_skills = skill_registry.get_skills_dict()
        if source_clean_name in all_skills:
            content = all_skills[source_clean_name].get("content")

    if not content:
        raise HTTPException(status_code=404, detail=f"Skill '{skill_name}' not found.")

    target_name = (payload.new_skill_name or source_clean_name).strip().lower().replace(" ", "_")
    import re as _re
    if not _re.match(r'^[a-z0-9_]+$', target_name):
        raise HTTPException(status_code=400, detail="Skill name can only contain lowercase letters (a-z), numbers (0-9), and underscores (_). No spaces or special characters allowed.")

    if not payload.target_tenant_ids:
        raise HTTPException(status_code=400, detail="At least one target tenant workspace must be selected.")

    created_tenants = []
    errors = []

    for tid in payload.target_tenant_ids:
        t_check = db.query(DBTenant).filter(DBTenant.id == tid).first()
        if not t_check:
            continue
            
        existing = db.query(CustomSkill).filter(
            CustomSkill.name == target_name,
            CustomSkill.tenant_id == tid
        ).first()
        file_skills = skill_registry.get_skills_dict(tenant_id=tid)
        if target_name in file_skills or existing:
            errors.append(f"Skill '{target_name}' already exists in workspace '{t_check.name}'")
            continue

        new_skill = CustomSkill(
            name=target_name,
            description=target_name,
            content=content,
            tenant_id=tid,
            is_active=True
        )
        db.add(new_skill)
        created_tenants.append(t_check.name)

    if not created_tenants and errors:
        raise HTTPException(status_code=400, detail="; ".join(errors))

    db.commit()
    for tid in payload.target_tenant_ids:
        skill_registry.reload_skills(tenant_id=tid, db=db)

    return {
        "status": "duplicated",
        "skill_name": target_name,
        "copied_to_tenants": created_tenants,
        "warnings": errors
    }


