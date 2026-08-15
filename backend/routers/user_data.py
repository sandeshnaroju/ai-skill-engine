import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import User
from auth import get_current_user
from schemas import UserDataTemplateCreate
from utils import get_paginated_response

router = APIRouter()


@router.get("")
def list_user_data_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: Optional[int] = None,
    page_size: int = 10,
    search: Optional[str] = None
):
    from models import UserDataTemplate
    query = db.query(UserDataTemplate)
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
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "updated_at": t.updated_at.isoformat() if t.updated_at else None
        }
    return get_paginated_response(query, page, page_size, serialize)


@router.post("")
def create_or_update_user_data_template(
    payload: UserDataTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from models import UserDataTemplate
    clean_name = payload.name.strip()
    if not clean_name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")

    data_str = json.dumps(payload.data)

    existing = db.query(UserDataTemplate).filter(UserDataTemplate.name == clean_name).first()
    if existing:
        existing.description = payload.description
        existing.data = data_str
        tpl = existing
    else:
        tpl = UserDataTemplate(
            name=clean_name,
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


@router.delete("/{template_id}")
def delete_user_data_template(
    template_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from models import UserDataTemplate
    tpl = db.query(UserDataTemplate).filter(UserDataTemplate.id == template_id).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(tpl)
    db.commit()
    return {"status": "deleted", "template_id": template_id}
