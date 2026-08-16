from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Tenant
from auth import get_current_tenant
from skill_registry import skill_registry
from schemas import McpServerCreate
from utils import get_paginated_response

router = APIRouter()


@router.get("")
def list_mcp_servers(
    db: Session = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant),
    page: Optional[int] = None,
    page_size: int = 10,
    search: Optional[str] = None
):
    from models import McpServer
    from sqlalchemy.orm import joinedload
    query = db.query(McpServer).options(joinedload(McpServer.tenant)).filter(
        (McpServer.tenant_id == current_tenant.id) | (McpServer.tenant_id == None)
    )
    if search:
        query = query.filter(McpServer.name.ilike(f"%{search}%"))
    query = query.order_by(McpServer.created_at.desc())

    import json
    def serialize(s):
        tools = []
        if s.cached_tools:
            try:
                raw_tools = json.loads(s.cached_tools)
                tools = [{
                    "name": t.get("name"),
                    "description": t.get("description", ""),
                    "parameters": t.get("inputSchema", t.get("parameters", {"type": "object", "properties": {}})),
                    "type": "mcp_server",
                    "mcp_server_id": s.id,
                    "mcp_server_name": s.name
                } for t in raw_tools]
            except Exception:
                tools = []

        return {
            "id": s.id,
            "name": s.name,
            "transport": s.transport,
            "command": s.command,
            "url": s.url,
            "env": s.env,
            "is_active": s.is_active,
            "tenant_id": s.tenant_id,
            "tenant_name": s.tenant.name if s.tenant else "Global",
            "discovered_tools_count": len(tools),
            "tools": tools,
            "created_at": s.created_at.isoformat() if s.created_at else None
        }
    return get_paginated_response(query, page, page_size, serialize)


@router.post("")
def create_mcp_server(
    payload: McpServerCreate,
    db: Session = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant)
):
    from models import McpServer
    clean_name = payload.name.strip().lower().replace(" ", "_")
    target_tenant_id = current_tenant.id
    if payload.tenant_id:
        from models import Tenant as DBTenant
        tenant_check = db.query(DBTenant).filter(DBTenant.id == payload.tenant_id, DBTenant.user_id == current_tenant.user_id).first()
        if tenant_check:
            target_tenant_id = tenant_check.id

    srv = db.query(McpServer).filter(
        McpServer.name == clean_name,
        McpServer.tenant_id == target_tenant_id
    ).first()
    if srv:
        srv.transport = payload.transport
        srv.command = payload.command
        srv.url = payload.url
        srv.env = payload.env
        srv.is_active = True
    else:
        srv = McpServer(
            name=clean_name,
            tenant_id=target_tenant_id,
            transport=payload.transport,
            command=payload.command,
            url=payload.url,
            env=payload.env,
            is_active=True
        )
        db.add(srv)
    db.commit()
    db.refresh(srv)

    # Immediately discover and cache tools in database upon creation/update (non-blocking errors)
    from mcp_manager import mcp_manager
    import json
    discovered_tools = []
    try:
        discovered_tools = mcp_manager.list_tools(srv)
        if discovered_tools:
            srv.cached_tools = json.dumps(discovered_tools)
            db.commit()
    except Exception as e:
        print(f"Non-fatal warning during MCP tool discovery on creation: {e}")

    skill_registry.reload_skills(tenant_id=current_tenant.id, db=db)
    return {"status": "created", "server_id": srv.id, "name": srv.name, "discovered_tools_count": len(discovered_tools or [])}


@router.post("/{server_id}/sync")
def sync_mcp_server_tools(
    server_id: str,
    db: Session = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant)
):
    from models import McpServer
    from mcp_manager import mcp_manager
    import json

    srv = db.query(McpServer).filter(
        McpServer.id == server_id,
        (McpServer.tenant_id == current_tenant.id) | (McpServer.tenant_id == None)
    ).first()
    if not srv:
        raise HTTPException(status_code=404, detail="Server not found")

    discovered_tools = mcp_manager.list_tools(srv)
    srv.cached_tools = json.dumps(discovered_tools) if discovered_tools else None
    db.commit()
    skill_registry.reload_skills(tenant_id=current_tenant.id, db=db)
    return {"status": "synced", "server_id": srv.id, "discovered_tools_count": len(discovered_tools or [])}


@router.delete("/{server_id}")
def delete_mcp_server(
    server_id: str,
    db: Session = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant)
):
    from models import McpServer
    srv = db.query(McpServer).filter(
        McpServer.id == server_id,
        McpServer.tenant_id == current_tenant.id
    ).first()
    if not srv:
        raise HTTPException(status_code=404, detail="Server not found")

    db.delete(srv)
    db.commit()
    skill_registry.reload_skills(tenant_id=current_tenant.id, db=db)
    return {"status": "deleted", "server_id": server_id}
