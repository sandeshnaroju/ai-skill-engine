import os
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
import secrets
import uuid as _uuid

from database import get_db
from models import Tenant
from auth import get_current_tenant

router = APIRouter()

UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "sandbox", "uploads"))
OUTPUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "sandbox", "outputs"))


@router.post("/upload")
def upload_file(
    file: UploadFile = File(...),
    session_id: Optional[str] = Form(None),
    origin: Optional[str] = Form("external_api"),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db)
):
    from storage import get_storage_backend
    from models import SessionFile

    tenant_name = current_tenant.name if current_tenant else "default"

    # Sanitize filename
    safe_filename = "".join(c for c in file.filename if c.isalnum() or c in (".", "_", "-")).strip()
    if not safe_filename:
        safe_filename = f"upload_{secrets.token_hex(8)}"
    unique_filename = f"{_uuid.uuid4().hex}_{safe_filename}"

    data = file.file.read()

    try:
        backend = get_storage_backend(db, tenant_id=current_tenant.id)
        # Only write local cache file if using LocalStorage
        if backend.__class__.__name__ == "LocalStorage":
            tenant_upload_dir = os.path.join(UPLOAD_DIR, tenant_name)
            os.makedirs(tenant_upload_dir, exist_ok=True)
            local_path = os.path.join(tenant_upload_dir, unique_filename)
            with open(local_path, "wb") as f:
                f.write(data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to cache file locally: {str(e)}")

    try:
        file_url = backend.upload(unique_filename, data, file.content_type or "application/octet-stream", tenant_name=tenant_name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Storage upload failed: {str(e)}")

    # Record in SessionFile table
    provider_name = getattr(backend, "__class__", type(backend)).__name__.lower().replace("storage", "")
    if provider_name not in ("azure", "s3", "local"):
        provider_name = "azure" if "azure" in provider_name else ("s3" if "s3" in provider_name else "local")

    session_file_record = SessionFile(
        tenant_id=current_tenant.id,
        session_id=(session_id.strip() if session_id and session_id.strip() else None),
        filename=unique_filename,
        original_name=file.filename or unique_filename,
        storage_provider=provider_name,
        storage_url=file_url,
        file_size=len(data),
        file_type=file.content_type or "application/octet-stream",
        source="upload",
        origin=origin or "external_api"
    )
    db.add(session_file_record)
    db.commit()
    db.refresh(session_file_record)

    sandbox_path = f"sandbox/uploads/{tenant_name}/{unique_filename}"
    return {
        "id": session_file_record.id,
        "filename": unique_filename,
        "original_name": file.filename,
        "content_type": file.content_type,
        "size": len(data),
        "url": file_url,
        "sandbox_path": sandbox_path,
        "session_id": session_file_record.session_id,
        "origin": session_file_record.origin,
        "source": session_file_record.source,
        "storage_provider": session_file_record.storage_provider
    }


@router.get("/tenant")
def list_tenant_files(
    provider: Optional[str] = Query(None),
    session_id: Optional[str] = Query(None),
    origin: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db)
):
    """List paginated tracked files for a tenant with filtering and search across all providers."""
    import math
    from models import SessionFile

    query = db.query(SessionFile).filter(SessionFile.tenant_id == current_tenant.id)

    if provider and provider != "all":
        query = query.filter(SessionFile.storage_provider == provider)
    if session_id:
        query = query.filter(SessionFile.session_id == session_id.strip())
    if origin and origin != "all":
        query = query.filter(SessionFile.origin == origin)
    if source and source != "all":
        query = query.filter(SessionFile.source == source)
    if search and search.strip():
        s_term = f"%{search.strip().lower()}%"
        query = query.filter(
            (SessionFile.filename.ilike(s_term)) |
            (SessionFile.original_name.ilike(s_term)) |
            (SessionFile.session_id.ilike(s_term))
        )

    total = query.count()
    offset = (page - 1) * page_size
    items = query.order_by(SessionFile.created_at.desc()).offset(offset).limit(page_size).all()
    pages = math.ceil(total / page_size) if page_size > 0 else 1

    return {
        "items": [
            {
                "id": f.id,
                "filename": f.filename,
                "original_name": f.original_name,
                "storage_provider": f.storage_provider,
                "url": f.storage_url,
                "file_size": f.file_size,
                "file_type": f.file_type,
                "source": f.source,
                "origin": f.origin,
                "session_id": f.session_id,
                "created_at": f.created_at.isoformat() if f.created_at else None
            }
            for f in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": pages
    }


@router.get("/session/{session_id}")
def list_session_files(
    session_id: str,
    source: Optional[str] = None,
    origin: Optional[str] = None,
    current_tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db)
):
    """List all tracked storage files for a specific chat/API session."""
    from models import SessionFile
    clean_session_id = (session_id or "").strip()
    if not clean_session_id:
        raise HTTPException(status_code=400, detail="session_id is required")

    query = db.query(SessionFile).filter(
        SessionFile.tenant_id == current_tenant.id,
        SessionFile.session_id == clean_session_id
    )
    if source:
        query = query.filter(SessionFile.source == source)
    if origin:
        query = query.filter(SessionFile.origin == origin)

    files = query.order_by(SessionFile.created_at.desc()).all()
    return {
        "session_id": clean_session_id,
        "total": len(files),
        "files": [
            {
                "id": f.id,
                "filename": f.filename,
                "original_name": f.original_name,
                "storage_provider": f.storage_provider,
                "url": f.storage_url,
                "file_size": f.file_size,
                "file_type": f.file_type,
                "source": f.source,
                "origin": f.origin,
                "created_at": f.created_at.isoformat() if f.created_at else None
            }
            for f in files
        ]
    }


def purge_session_files_internal(db: Session, tenant_id: str, tenant_name: str, session_id: str, origin: Optional[str] = None) -> dict:
    """Internal helper to purge files across storage, host disk, and DB."""
    from models import SessionFile
    from storage import get_storage_backend

    query = db.query(SessionFile).filter(
        SessionFile.tenant_id == tenant_id,
        SessionFile.session_id == session_id
    )
    if origin:
        query = query.filter(SessionFile.origin == origin)

    session_files = query.all()
    if not session_files:
        return {
            "status": "success",
            "session_id": session_id,
            "deleted_count": 0,
            "deleted_files": []
        }

    backend = get_storage_backend(db, tenant_id=tenant_id)
    deleted_names = []

    for sf in session_files:
        # 1. Delete from active storage backend (Azure / S3 / Local)
        try:
            backend.delete(sf.filename, tenant_name=tenant_name)
        except Exception as e:
            print(f"Warning: Failed to delete '{sf.filename}' from cloud storage: {e}")

        # 2. Delete local sandbox caches if present
        for d in (UPLOAD_DIR, OUTPUT_DIR):
            for folder in (tenant_name, "default", ""):
                local_f = os.path.join(d, folder, sf.filename) if folder else os.path.join(d, sf.filename)
                if os.path.exists(local_f):
                    try:
                        os.remove(local_f)
                    except Exception:
                        pass

        deleted_names.append(sf.filename)
        db.delete(sf)

    db.commit()

    return {
        "status": "success",
        "session_id": session_id,
        "storage_provider": getattr(backend, "__class__", type(backend)).__name__.lower().replace("storage", ""),
        "deleted_count": len(deleted_names),
        "deleted_files": deleted_names
    }


@router.delete("/session/{session_id}")
def purge_session_files(
    session_id: str,
    origin: Optional[str] = None,
    current_tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db)
):
    """
    Purges all storage files (Azure Blob Storage, S3, or Local) and sandbox caches
    associated with a specific session thread. Ideal for business applications cleaning
    up files when a user or thread is deleted.
    """
    clean_session_id = (session_id or "").strip()
    if not clean_session_id:
        raise HTTPException(status_code=400, detail="session_id is required")

    tenant_name = current_tenant.name if current_tenant else "default"
    res = purge_session_files_internal(db, current_tenant.id, tenant_name, clean_session_id, origin=origin)
    return res


@router.delete("/{file_id}")
def delete_single_file(
    file_id: str,
    current_tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db)
):
    """Delete a single tracked file by ID across cloud storage and DB."""
    from models import SessionFile
    from storage import get_storage_backend

    sf = db.query(SessionFile).filter(
        SessionFile.id == file_id,
        SessionFile.tenant_id == current_tenant.id
    ).first()

    if not sf:
        raise HTTPException(status_code=404, detail="File not found or not owned by tenant")

    tenant_name = current_tenant.name if current_tenant else "default"
    backend = get_storage_backend(db, tenant_id=current_tenant.id)
    try:
        backend.delete(sf.filename, tenant_name=tenant_name)
    except Exception as e:
        print(f"Warning: Failed to delete '{sf.filename}' from storage: {e}")

    # Remove local caches if present
    for d in (UPLOAD_DIR, OUTPUT_DIR):
        for folder in (tenant_name, "default", ""):
            local_f = os.path.join(d, folder, sf.filename) if folder else os.path.join(d, sf.filename)
            if os.path.exists(local_f):
                try:
                    os.remove(local_f)
                except Exception:
                    pass

    db.delete(sf)
    db.commit()

    return {
        "status": "success",
        "deleted_file": sf.filename,
        "id": file_id
    }


def _clean_display_name(filename: str) -> str:
    if "_" in filename:
        parts = filename.split("_", 1)
        if len(parts[0]) >= 32:
            return parts[1]
    return filename


@router.get("/download/{tenant_name}/{filename}")
def download_file(tenant_name: str, filename: str):
    display_name = _clean_display_name(filename)
    # Security check: prevent directory traversal by normalizing path
    file_path = os.path.abspath(os.path.join(UPLOAD_DIR, tenant_name, filename))
    if file_path.startswith(UPLOAD_DIR) and os.path.exists(file_path):
        return FileResponse(file_path, filename=display_name, content_disposition_type="inline")

    output_file_path = os.path.abspath(os.path.join(OUTPUT_DIR, tenant_name, filename))
    if output_file_path.startswith(OUTPUT_DIR) and os.path.exists(output_file_path):
        return FileResponse(output_file_path, filename=display_name, content_disposition_type="inline")

    raise HTTPException(status_code=404, detail="File not found")


@router.get("/download/{filename}")
def download_file_fallback(filename: str):
    display_name = _clean_display_name(filename)
    # 1. Check default folder
    for directory in (UPLOAD_DIR, OUTPUT_DIR):
        file_path = os.path.abspath(os.path.join(directory, "default", filename))
        if file_path.startswith(directory) and os.path.exists(file_path):
            return FileResponse(file_path, filename=display_name, content_disposition_type="inline")

    # 2. Check if it matches any nested tenant folder
    for directory in (UPLOAD_DIR, OUTPUT_DIR):
        if os.path.exists(directory):
            for t_dir in os.listdir(directory):
                file_path = os.path.abspath(os.path.join(directory, t_dir, filename))
                if file_path.startswith(directory) and os.path.exists(file_path):
                    return FileResponse(file_path, filename=display_name, content_disposition_type="inline")

    # 3. Check directly in the root directory (for older uploads)
    for directory in (UPLOAD_DIR, OUTPUT_DIR):
        file_path = os.path.abspath(os.path.join(directory, filename))
        if file_path.startswith(directory) and os.path.exists(file_path):
            return FileResponse(file_path, filename=display_name, content_disposition_type="inline")

    raise HTTPException(status_code=404, detail="File not found")
