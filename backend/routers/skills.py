import os
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from sqlalchemy.orm import Session
from database import get_db
from schemas import *
from models import User
from auth import get_current_user
from utils import get_paginated_response
from skill_registry import skill_registry

router = APIRouter()

@router.get("")
def list_skills(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: Optional[int] = None,
    page_size: int = 15,
    search: Optional[str] = None
):
    skill_registry.reload_skills(db=db)
    all_skills = skill_registry.list_skills()
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
            "tools_schema": skill_registry.get_openai_tools()
        }
    else:
        res["tools_schema"] = skill_registry.get_openai_tools()
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
    current_user: User = Depends(get_current_user)
):
    clean_name = payload.skill_name.strip().lower().replace(" ", "_")
    import re as _re
    if not _re.match(r'^[a-z0-9_]+$', clean_name):
        raise HTTPException(status_code=400, detail="Skill name can only contain lowercase letters (a-z), numbers (0-9), and underscores (_). No spaces or special characters allowed.")
    from models import CustomSkill
    
    validate_skill_content(payload.content)

    existing = db.query(CustomSkill).filter(CustomSkill.name == clean_name).first()
    if existing:
        existing.content = payload.content
        existing.is_active = True
    else:
        new_skill = CustomSkill(
            name=clean_name,
            description=payload.skill_name,
            content=payload.content,
            is_active=True
        )
        db.add(new_skill)
    db.commit()
    skill_registry.reload_skills(db=db)
    return {"status": "created", "skill_name": clean_name, "source": "database"}


@router.get("/{skill_name}")
def get_skill_content(
    skill_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    skill_registry.reload_skills(db=db)
    skill_data = skill_registry.skills.get(skill_name)
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
    current_user: User = Depends(get_current_user)
):
    from models import CustomSkill
    clean_name = skill_name.strip().lower().replace(" ", "_")
    
    validate_skill_content(payload.content)
    
    existing = db.query(CustomSkill).filter(CustomSkill.name == clean_name).first()
    if existing:
        existing.content = payload.content
        db.commit()
    else:
        # If user edits a default file skill from UI, save the edited copy into DB
        new_skill = CustomSkill(
            name=clean_name,
            description=clean_name,
            content=payload.content,
            is_active=True
        )
        db.add(new_skill)
        db.commit()

    skill_registry.reload_skills(db=db)
    return {"status": "updated", "skill_name": clean_name, "source": "database"}


@router.delete("/{skill_name}")
def delete_skill(
    skill_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from models import CustomSkill
    clean_name = skill_name.strip().lower().replace(" ", "_")
    
    existing = db.query(CustomSkill).filter(CustomSkill.name == clean_name).first()
    if existing:
        db.delete(existing)
        db.commit()
        skill_registry.reload_skills(db=db)
        return {"status": "deleted", "skill_name": clean_name}
    else:
        raise HTTPException(status_code=400, detail="Cannot delete built-in default file skills. Only DB dynamic skills can be deleted.")


