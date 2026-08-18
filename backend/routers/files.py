import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
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
    current_tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db)
):
    from storage import get_storage_backend

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

    sandbox_path = f"sandbox/uploads/{tenant_name}/{unique_filename}"
    return {
        "filename": unique_filename,
        "original_name": file.filename,
        "content_type": file.content_type,
        "size": len(data),
        "url": file_url,
        "sandbox_path": sandbox_path
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
