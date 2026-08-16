from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import User
from auth import get_current_user
from skill_registry import skill_registry
from schemas import McpServerCreate
from utils import get_paginated_response

router = APIRouter()


@router.get("")
def list_mcp_servers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: Optional[int] = None,
    page_size: int = 10,
    search: Optional[str] = None
):
    from models import McpServer
    query = db.query(McpServer)
    if search:
        query = query.filter(McpServer.name.ilike(f"%{search}%"))
    query = query.order_by(McpServer.created_at.desc())

    def serialize(s):
        skill_data = skill_registry.skills.get(f"mcp_{s.name}", {})
        tools = skill_data.get("tools", [])
        return {
            "id": s.id,
            "name": s.name,
            "transport": s.transport,
            "command": s.command,
            "url": s.url,
            "env": s.env,
            "is_active": s.is_active,
            "discovered_tools_count": len(tools),
            "tools": tools,
            "created_at": s.created_at.isoformat() if s.created_at else None
        }
    return get_paginated_response(query, page, page_size, serialize)


@router.post("")
def create_mcp_server(
    payload: McpServerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from models import McpServer
    clean_name = payload.name.strip().lower().replace(" ", "_")
    srv = db.query(McpServer).filter(McpServer.name == clean_name).first()
    if srv:
        srv.transport = payload.transport
        srv.command = payload.command
        srv.url = payload.url
        srv.env = payload.env
        srv.is_active = True
    else:
        srv = McpServer(
            name=clean_name,
            transport=payload.transport,
            command=payload.command,
            url=payload.url,
            env=payload.env,
            is_active=True
        )
        db.add(srv)
    db.commit()
    db.refresh(srv)
    skill_registry.reload_skills(db=db)
    return {"status": "created", "server_id": srv.id, "name": srv.name}


@router.delete("/{server_id}")
def delete_mcp_server(
    server_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from models import McpServer
    srv = db.query(McpServer).filter(McpServer.id == server_id).first()
    if not srv:
        raise HTTPException(status_code=404, detail="Server not found")

    db.delete(srv)
    db.commit()
    skill_registry.reload_skills(db=db)
    return {"status": "deleted", "server_id": server_id}
