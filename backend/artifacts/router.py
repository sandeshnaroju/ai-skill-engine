"""
backend/artifacts/router.py
REST & SSE API for Universal Canvas Artifacts:
- Ephemeral token minting & silent refresh
- Real-time Server-Sent Events (SSE) streaming
- Block outline, content retrieval, and surgical updates
- Forward-only diff commits & block rollbacks
- Multi-format binary file compilation and instant download
"""
import io
import json
import asyncio
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, Header, Cookie, Body
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.orm import Session

from database import get_db
from models import SessionArtifact, ArtifactBlock, ArtifactCommit, Tenant
from auth import get_current_tenant
from .manager import (
    broadcaster,
    mint_embed_token,
    verify_embed_token,
    create_artifact,
    edit_block,
    rollback_block_to_version,
    serialize_artifact_summary,
    assemble_full_content,
)
from .compiler import export_artifact

router = APIRouter()


def authenticate_canvas_access(
    artifact_id: str,
    token: Optional[str] = Query(None),
    x_embed_token: Optional[str] = Header(None),
    authorization: Optional[str] = Header(None),
    x_api_key: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None),
    db: Session = Depends(get_db)
) -> dict:
    cand_token = token or x_embed_token

    # 1. Embed Token Authentication (Strict validation for embed clients & ApiTester)
    if cand_token:
        try:
            payload = verify_embed_token(cand_token)
            if payload.get("art") != artifact_id:
                raise HTTPException(status_code=403, detail="Embed token not authorized for this artifact")
            return {"type": "embed_token", "tenant_id": payload.get("ten"), "artifact_id": artifact_id}
        except ValueError as e:
            raise HTTPException(status_code=401, detail=f"Invalid or expired embed token: {str(e)}")

    # 2. Master Tenant Authentication (Used only when no embed token is supplied)
    try:
        tenant = get_current_tenant(
            authorization=authorization,
            x_api_key=x_api_key,
            session_token=session_token,
            db=db
        )
        if tenant:
            art = db.query(SessionArtifact).filter(SessionArtifact.id == artifact_id).first()
            if not art:
                raise HTTPException(status_code=404, detail="Artifact not found")
            if art.tenant_id and art.tenant_id != tenant.id:
                raise HTTPException(status_code=403, detail="Forbidden: artifact belongs to another tenant")
            return {"type": "tenant", "tenant_id": tenant.id, "artifact_id": artifact_id}
    except HTTPException as he:
        raise he
    except Exception:
        pass

    raise HTTPException(status_code=401, detail="Authentication required: Provide a valid embed token or API key.")


@router.post("/{artifact_id}/embed-token")
def generate_embed_token_endpoint(
    artifact_id: str,
    expires_in_minutes: int = Query(30, ge=5, le=1440),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db)
):
    artifact = db.query(SessionArtifact).filter(
        SessionArtifact.id == artifact_id,
        SessionArtifact.tenant_id == current_tenant.id
    ).first()

    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")

    token = mint_embed_token(artifact.id, current_tenant.id, expires_in_minutes=expires_in_minutes)
    return {
        "token": token,
        "expires_in_seconds": expires_in_minutes * 60,
        "artifact_id": artifact.id,
        "embed_url": f"/embed/canvas?token={token}"
    }


@router.post("/{artifact_id}/refresh-token")
def refresh_embed_token_endpoint(
    artifact_id: str,
    token: Optional[str] = Query(None),
    x_embed_token: Optional[str] = Header(None),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    cand_token = token or x_embed_token
    if not cand_token and authorization and authorization.startswith("Bearer "):
        cand_token = authorization.split(" ")[1].strip()

    if not cand_token:
        raise HTTPException(status_code=400, detail="Token required for refresh")

    try:
        payload = verify_embed_token(cand_token)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=f"Token invalid or unrefreshable: {str(e)}")

    if payload.get("art") != artifact_id:
        raise HTTPException(status_code=403, detail="Token mismatch for artifact")

    tenant_id = payload.get("ten", "default")
    new_token = mint_embed_token(artifact_id, tenant_id, expires_in_minutes=30)
    return {
        "token": new_token,
        "expires_in_seconds": 1800,
        "artifact_id": artifact_id
    }


@router.get("/{artifact_id}/stream")
async def stream_artifact_updates(
    artifact_id: str,
    token: Optional[str] = Query(None),
    x_embed_token: Optional[str] = Header(None),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    cand_token = token or x_embed_token
    if not cand_token and authorization and authorization.startswith("Bearer "):
        cand_token = authorization.split(" ")[1].strip()

    if cand_token:
        try:
            payload = verify_embed_token(cand_token)
            if payload.get("art") != artifact_id:
                raise HTTPException(status_code=403, detail="Token mismatch")
        except ValueError:
            raise HTTPException(status_code=401, detail="Invalid token for live stream")

    queue = broadcaster.subscribe(artifact_id)

    async def event_generator():
        try:
            init_msg = json.dumps({"type": "canvas_connected", "artifact_id": artifact_id})
            yield f"data: {init_msg}\n\n"

            while True:
                try:
                    msg = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield msg
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            broadcaster.unsubscribe(artifact_id, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.get("/tenant/{tenant_id}")
def list_tenant_artifacts(
    tenant_id: str,
    search: Optional[str] = Query(None),
    artifact_type: Optional[str] = Query(None),
    session_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db)
):
    """List all artifacts for a specific tenant with search, type filter, and pagination."""
    # Allow master tenant or the specific tenant themselves
    if current_tenant.id != tenant_id and not getattr(current_tenant, "is_master", False):
        raise HTTPException(status_code=403, detail="Not authorized to view artifacts for this tenant")

    query = db.query(SessionArtifact).filter(SessionArtifact.tenant_id == tenant_id)

    if artifact_type and artifact_type != "all":
        query = query.filter(SessionArtifact.artifact_type == artifact_type)

    if session_id:
        query = query.filter(SessionArtifact.session_id == session_id)

    if search:
        s = f"%{search.strip()}%"
        query = query.filter((SessionArtifact.title.ilike(s)) | (SessionArtifact.filename.ilike(s)))

    total = query.count()
    artifacts = query.order_by(SessionArtifact.updated_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    items = []
    for art in artifacts:
        summary = serialize_artifact_summary(art)
        # Add quick block count
        summary["blocks_count"] = len(art.blocks) if art.blocks else 0
        items.append(summary)

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size)
    }


@router.get("/session/{session_id}")
def list_session_artifacts(
    session_id: str,
    current_tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db)
):
    artifacts = db.query(SessionArtifact).filter(
        SessionArtifact.session_id == session_id,
        SessionArtifact.tenant_id == current_tenant.id
    ).order_by(SessionArtifact.created_at.desc()).all()

    return [serialize_artifact_summary(a) for a in artifacts]


@router.delete("/{artifact_id}")
def delete_artifact(
    artifact_id: str,
    current_tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db)
):
    """Delete an artifact and its associated blocks, commits, and broadcaster subscribers."""
    artifact = db.query(SessionArtifact).filter(SessionArtifact.id == artifact_id).first()
    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")

    if artifact.tenant_id != current_tenant.id and not getattr(current_tenant, "is_master", False):
        raise HTTPException(status_code=403, detail="Not authorized to delete this artifact")

    # Broadcast deletion event before deleting
    broadcaster.broadcast(artifact_id, "artifact_deleted", {"artifact_id": artifact_id})

    db.delete(artifact)
    db.commit()

    return {"success": True, "deleted_id": artifact_id, "message": "Artifact deleted successfully"}


@router.get("/{artifact_id}")
def get_artifact_details(
    artifact_id: str,
    auth: dict = Depends(authenticate_canvas_access),
    db: Session = Depends(get_db)
):
    artifact = db.query(SessionArtifact).filter(SessionArtifact.id == artifact_id).first()
    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")

    summary = serialize_artifact_summary(artifact)
    full_content = assemble_full_content(artifact)
    summary["full_content"] = full_content
    return summary


@router.get("/{artifact_id}/blocks/{block_key}")
def get_artifact_block(
    artifact_id: str,
    block_key: str,
    auth: dict = Depends(authenticate_canvas_access),
    db: Session = Depends(get_db)
):
    block = db.query(ArtifactBlock).filter(
        ArtifactBlock.artifact_id == artifact_id,
        ArtifactBlock.block_key == block_key
    ).first()

    if not block:
        raise HTTPException(status_code=404, detail=f"Block {block_key} not found")

    return {
        "id": block.id,
        "artifact_id": block.artifact_id,
        "block_key": block.block_key,
        "order_index": block.order_index,
        "title": block.title,
        "content": block.content,
        "version": block.version,
        "updated_at": block.updated_at.isoformat() if block.updated_at else None
    }


@router.put("/{artifact_id}/blocks/{block_key}")
def update_artifact_block(
    artifact_id: str,
    block_key: str,
    payload: dict = Body(...),
    auth: dict = Depends(authenticate_canvas_access),
    db: Session = Depends(get_db)
):
    new_content = payload.get("content", "")
    summary = payload.get("summary") or "Manual edit from Canvas"

    try:
        block, commit = edit_block(
            db=db,
            artifact_id=artifact_id,
            block_key=block_key,
            new_content=new_content,
            summary=summary,
            author="user"
        )
        return {
            "success": True,
            "block_key": block.block_key,
            "version": block.version,
            "title": block.title,
            "summary": summary
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{artifact_id}/commits")
def list_artifact_commits(
    artifact_id: str,
    block_key: Optional[str] = Query(None),
    auth: dict = Depends(authenticate_canvas_access),
    db: Session = Depends(get_db)
):
    query = db.query(ArtifactCommit).filter(ArtifactCommit.artifact_id == artifact_id)
    if block_key:
        query = query.filter((ArtifactCommit.block_key == block_key) | (ArtifactCommit.block_key == "all"))

    commits = query.order_by(ArtifactCommit.version.desc()).all()
    return [
        {
            "id": c.id,
            "version": c.version,
            "author": c.author,
            "block_key": c.block_key,
            "summary": c.summary,
            "patch": c.patch,
            "created_at": c.created_at.isoformat() if c.created_at else None
        }
        for c in commits
    ]


@router.post("/{artifact_id}/blocks/{block_key}/rollback")
def rollback_artifact_block_endpoint(
    artifact_id: str,
    block_key: str,
    payload: dict = Body(...),
    auth: dict = Depends(authenticate_canvas_access),
    db: Session = Depends(get_db)
):
    target_version = payload.get("target_version")
    if target_version is None:
        raise HTTPException(status_code=400, detail="target_version is required")

    try:
        updated_block = rollback_block_to_version(
            db=db,
            artifact_id=artifact_id,
            block_key=block_key,
            target_version=int(target_version),
            author="user"
        )
        return {
            "success": True,
            "block_key": block_key,
            "new_version": updated_block.version,
            "content": updated_block.content
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{artifact_id}/export")
def export_artifact_file(
    artifact_id: str,
    auth: dict = Depends(authenticate_canvas_access),
    db: Session = Depends(get_db)
):
    artifact = db.query(SessionArtifact).filter(SessionArtifact.id == artifact_id).first()
    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")

    data_bytes, mime_type, filename = export_artifact(artifact)

    return Response(
        content=data_bytes,
        media_type=mime_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-cache",
            "Content-Length": str(len(data_bytes))
        }
    )
