import os
import smtplib
import secrets
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional, List, Any, Union
from fastapi import FastAPI, Depends, HTTPException, Header, Response, Cookie, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
import datetime as dt

from database import init_db, get_db
from models import Tenant, ExecutionLog, ChatRequest, User
from auth import get_current_tenant, generate_api_key, hash_password, verify_password, get_current_user
from skill_registry import skill_registry
from skill_engine import skill_engine

# SMTP Configuration
SMTP_HOST = os.environ.get("SMTP_HOST")
SMTP_PORT_STR = os.environ.get("SMTP_PORT", "587")
SMTP_PORT = int(SMTP_PORT_STR) if SMTP_PORT_STR.isdigit() else 587
SMTP_USERNAME = os.environ.get("SMTP_USERNAME")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD")
SMTP_SENDER = os.environ.get("SMTP_SENDER", SMTP_USERNAME)

def is_smtp_configured() -> bool:
    return bool(SMTP_HOST and SMTP_USERNAME and SMTP_PASSWORD)

def send_otp_email(to_email: str, otp: str):
    if not is_smtp_configured():
        return
    
    msg = MIMEMultipart()
    msg['From'] = SMTP_SENDER
    msg['To'] = to_email
    msg['Subject'] = "Verify Your Account - OTP Verification"
    
    body = f"""
    <div style="font-family: 'Inter', system-ui, sans-serif; background-color: #0a0f1d; color: #f8fafc; padding: 40px; border-radius: 16px; max-width: 500px; margin: auto; border: 1px solid rgba(255,255,255,0.08);">
        <div style="text-align: center; margin-bottom: 24px;">
            <h2 style="font-size: 24px; font-weight: 800; margin: 0 0 6px 0; color: #ffffff;">Welcome to AI Skill Engine</h2>
            <p style="font-size: 14px; color: #94a3b8; margin: 0;">Please use the verification code below to verify your account.</p>
        </div>
        <div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 24px; text-align: center; border: 1px solid rgba(255,255,255,0.05); margin-bottom: 24px;">
            <span style="font-size: 36px; font-weight: 800; letter-spacing: 6px; color: #8b5cf6;">{otp}</span>
        </div>
        <p style="font-size: 12px; color: #64748b; text-align: center; margin: 0;">This code is valid for 15 minutes. If you did not register for an account, you can safely ignore this email.</p>
    </div>
    """
    
    msg.attach(MIMEText(body, 'html'))
    
    try:
        server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10)
        server.starttls()
        server.login(SMTP_USERNAME, SMTP_PASSWORD)
        server.sendmail(SMTP_SENDER, to_email, msg.as_string())
        server.quit()
        print(f"DEBUG: Verification OTP email sent to {to_email}")
    except Exception as e:
        print(f"ERROR: Failed to send verification email to {to_email}: {e}")
        raise HTTPException(status_code=500, detail="Failed to send verification email. Please contact support or check server settings.")

# Initialize/Verify database tables on startup
init_db()

app = FastAPI(
    title="Skill Manager Enterprise Server",
    description="Enterprise server for running custom skills and tools for chatbots without OpenAI Agents SDK",
    version="1.0.0"
)

@app.get("/api/v1/system/db-status")
def get_db_status():
    from database import db_creation_status
    return db_creation_status

# Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_paginated_response(query_or_list, page: Optional[int], page_size: int, serializer_func, is_query=True):
    if page is None:
        items = query_or_list.all() if is_query else query_or_list
        return [serializer_func(x) for x in items]
    
    import math
    if is_query:
        total = query_or_list.count()
        offset = (page - 1) * page_size
        items = query_or_list.offset(offset).limit(page_size).all()
    else:
        total = len(query_or_list)
        offset = (page - 1) * page_size
        items = query_or_list[offset:offset + page_size]
        
    pages = math.ceil(total / page_size) if page_size > 0 else 1
    return {
        "items": [serializer_func(x) for x in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": pages
    }

# --- Request / Response Schemas ---

class PlaygroundChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = "default_session"
    prochat_model: Optional[str] = None
    user_data: Optional[dict] = None
    skill_names: Optional[List[str]] = None

class OpenAIStyleMessage(BaseModel):
    role: str
    content: Union[str, List[Any]]

class OpenAIChatRequest(BaseModel):
    messages: List[OpenAIStyleMessage]
    model: Optional[str] = "gemini-2.5-flash"
    session_id: Optional[str] = "default_session"
    app_id: Optional[str] = None
    stream: Optional[bool] = False
    prochat_model: Optional[str] = None
    user_data: Optional[dict] = None
    skill_names: Optional[List[str]] = None

class TenantCreate(BaseModel):
    name: str

class SkillSaveRequest(BaseModel):
    skill_name: str
    content: str

class ApiCallDetail(BaseModel):
    method: str
    url: str
    headers: List[dict] = []
    query_params: List[dict] = []
    body: Optional[str] = ""

class SkillGenerateRequest(BaseModel):
    tenant_id: str
    model_name: str
    skill_name: str
    description: str
    api_calls: List[ApiCallDetail] = []
    inputs_secrets: Optional[str] = ""
    behavior: Optional[str] = ""

class AppCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    icon: Optional[str] = "box"
    skill_names: List[str] = []

class TenantLlmCreate(BaseModel):
    provider: str
    model_name: str
    api_key: str
    base_url: Optional[str] = None

class UserRegister(BaseModel):
    email: str
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class VerifyOtpRequest(BaseModel):
    email: str
    otp: str

class ResendOtpRequest(BaseModel):
    email: str

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

# --- Endpoints ---

@app.post("/api/v1/auth/register")
def register_user(payload: UserRegister, db: Session = Depends(get_db)):
    email_clean = payload.email.strip().lower()
    if not email_clean or "@" not in email_clean:
        raise HTTPException(status_code=400, detail="Invalid email address")
    if len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    existing = db.query(User).filter(User.email == email_clean).first()
    if existing:
        if existing.is_verified:
            raise HTTPException(status_code=400, detail="Email already registered")
        
        hashed = hash_password(payload.password)
        existing.hashed_password = hashed
        
        smtp_enabled = is_smtp_configured()
        if smtp_enabled:
            otp = "".join(secrets.choice("0123456789") for _ in range(6))
            existing.verification_otp = otp
            existing.verification_otp_expires = dt.datetime.utcnow() + dt.timedelta(minutes=15)
            db.commit()
            send_otp_email(existing.email, otp)
            return {"message": "User registered successfully. Please verify your email with the OTP sent.", "verification_required": True}
        else:
            existing.is_verified = True
            existing.verification_otp = None
            existing.verification_otp_expires = None
            db.commit()
            return {"message": "User registered successfully", "verification_required": False}
        
    hashed = hash_password(payload.password)
    user = User(email=email_clean, hashed_password=hashed)
    
    smtp_enabled = is_smtp_configured()
    if smtp_enabled:
        otp = "".join(secrets.choice("0123456789") for _ in range(6))
        user.is_verified = False
        user.verification_otp = otp
        user.verification_otp_expires = dt.datetime.utcnow() + dt.timedelta(minutes=15)
    else:
        user.is_verified = True
        user.verification_otp = None
        user.verification_otp_expires = None

    db.add(user)
    db.commit()
    db.refresh(user)
    
    # Auto-create default tenant for the new user
    tenant = Tenant(
        name=f"Default Workspace",
        api_key=generate_api_key("sk_usr_"),
        is_active=True,
        user_id=user.id
    )
    db.add(tenant)
    db.commit()
    
    if smtp_enabled:
        send_otp_email(user.email, otp)
        return {"message": "User registered successfully. Please verify your email with the OTP sent.", "verification_required": True}
    
    return {"message": "User registered successfully", "verification_required": False}

@app.post("/api/v1/auth/login")
def login_user(payload: UserLogin, response: Response, db: Session = Depends(get_db)):
    email_clean = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email_clean).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
        
    if not user.is_verified:
        raise HTTPException(status_code=401, detail="Please verify your email address before logging in.")

    session_token = generate_api_key("session_")
    user.session_token = session_token
    db.commit()
    
    # Set secure HTTP-only cookie
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        max_age=86400 * 30, # 30 days
        samesite="lax",
        secure=False # Set to True in production with HTTPS
    )
    return {"message": "Logged in successfully", "email": user.email}

@app.post("/api/v1/auth/verify-otp")
def verify_otp(payload: VerifyOtpRequest, db: Session = Depends(get_db)):
    email_clean = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email_clean).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.is_verified:
        return {"message": "User is already verified"}
    
    if not user.verification_otp or user.verification_otp != payload.otp:
        raise HTTPException(status_code=400, detail="Invalid OTP code")
    
    if user.verification_otp_expires and user.verification_otp_expires < dt.datetime.utcnow():
        raise HTTPException(status_code=400, detail="OTP code has expired. Please request a new one.")
    
    user.is_verified = True
    user.verification_otp = None
    user.verification_otp_expires = None
    db.commit()
    return {"message": "Email verified successfully"}

@app.post("/api/v1/auth/resend-otp")
def resend_otp(payload: ResendOtpRequest, db: Session = Depends(get_db)):
    email_clean = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email_clean).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if user.is_verified:
        return {"message": "User is already verified"}
        
    if not is_smtp_configured():
        raise HTTPException(status_code=400, detail="SMTP is not configured on this server")
        
    otp = "".join(secrets.choice("0123456789") for _ in range(6))
    user.verification_otp = otp
    user.verification_otp_expires = dt.datetime.utcnow() + dt.timedelta(minutes=15)
    db.commit()
    
    send_otp_email(user.email, otp)
    return {"message": "A new verification code has been sent to your email."}

@app.post("/api/v1/auth/logout")
def logout_user(response: Response, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    current_user.session_token = None
    db.commit()
    response.delete_cookie(key="session_token")
    return {"message": "Logged out successfully"}

@app.get("/api/v1/auth/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "created_at": current_user.created_at.isoformat() if current_user.created_at else None
    }

@app.post("/api/v1/auth/forgot-password")
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    email_clean = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email_clean).first()
    if not user:
        # Avoid user enumeration by returning generic success message
        return {"message": "If the email exists, a reset link has been generated."}
        
    reset_token = generate_api_key("reset_")
    user.reset_token = reset_token
    user.reset_token_expires = dt.datetime.utcnow() + dt.timedelta(hours=1)
    db.commit()
    
    # In local development mode, output the password reset link to terminal console
    reset_link = f"http://localhost:8000/reset-password?token={reset_token}"
    print("\n" + "="*80)
    print(f" PASSWORD RESET REQUEST FOR: {user.email}")
    print(f" RESET LINK: {reset_link}")
    print("="*80 + "\n")
    
    return {
        "message": "If the email exists, a reset link has been generated.",
        "debug_reset_link": reset_link # Exposed in development mode response for easier UI testing!
    }

@app.post("/api/v1/auth/reset-password")
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    if len(payload.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
        
    user = db.query(User).filter(
        User.reset_token == payload.token,
        User.reset_token_expires > dt.datetime.utcnow()
    ).first()
    
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
        
    user.hashed_password = hash_password(payload.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    user.session_token = None # Invalidate current sessions on password change
    db.commit()
    
    return {"message": "Password reset successfully"}

@app.post("/api/v1/auth/change-password")
def change_password(payload: ChangePasswordRequest, response: Response, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(payload.old_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Invalid current password")
        
    if len(payload.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
        
    current_user.hashed_password = hash_password(payload.new_password)
    current_user.session_token = None # Log out current session
    db.commit()
    response.delete_cookie(key="session_token")
    return {"message": "Password changed successfully"}

UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "sandbox", "uploads"))
OUTPUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "sandbox", "outputs"))

@app.post("/api/v1/files/upload")
def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    import secrets, uuid as _uuid
    from storage import get_storage_backend
    from models import Tenant

    # Resolve active tenant slug
    tenant = db.query(Tenant).filter(Tenant.user_id == current_user.id, Tenant.is_active == True).first()
    tenant_name = tenant.name if tenant else "default"

    # Sanitize filename
    safe_filename = "".join(c for c in file.filename if c.isalnum() or c in (".", "_", "-")).strip()
    if not safe_filename:
        safe_filename = f"upload_{secrets.token_hex(8)}"
    unique_filename = f"{_uuid.uuid4().hex}_{safe_filename}"

    data = file.file.read()

    try:
        backend = get_storage_backend(db)
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

@app.get("/api/v1/files/download/{tenant_name}/{filename}")
def download_file(tenant_name: str, filename: str):
    # Security check: prevent directory traversal by normalizing path
    file_path = os.path.abspath(os.path.join(UPLOAD_DIR, tenant_name, filename))
    if file_path.startswith(UPLOAD_DIR) and os.path.exists(file_path):
        return FileResponse(file_path)

    output_file_path = os.path.abspath(os.path.join(OUTPUT_DIR, tenant_name, filename))
    if output_file_path.startswith(OUTPUT_DIR) and os.path.exists(output_file_path):
        return FileResponse(output_file_path)

    raise HTTPException(status_code=404, detail="File not found")

@app.get("/api/v1/files/download/{filename}")
def download_file_fallback(filename: str):
    # Fallback search across uploads and outputs
    # 1. Check default folder
    for directory in (UPLOAD_DIR, OUTPUT_DIR):
        file_path = os.path.abspath(os.path.join(directory, "default", filename))
        if file_path.startswith(directory) and os.path.exists(file_path):
            return FileResponse(file_path)
            
    # 2. Check if it matches any nested tenant folder
    for directory in (UPLOAD_DIR, OUTPUT_DIR):
        if os.path.exists(directory):
            for t_dir in os.listdir(directory):
                file_path = os.path.abspath(os.path.join(directory, t_dir, filename))
                if file_path.startswith(directory) and os.path.exists(file_path):
                    return FileResponse(file_path)
                    
    # 3. Check directly in the root directory (for older uploads)
    for directory in (UPLOAD_DIR, OUTPUT_DIR):
        file_path = os.path.abspath(os.path.join(directory, filename))
        if file_path.startswith(directory) and os.path.exists(file_path):
            return FileResponse(file_path)

    raise HTTPException(status_code=404, detail="File not found")

# ─────────────────────────────────────────────────────────────────────────────
# Storage Configuration API
# ─────────────────────────────────────────────────────────────────────────────

class StorageConfigPayload(BaseModel):
    provider: str  # local | s3 | azure
    bucket_name: Optional[str] = None
    region: Optional[str] = None
    access_key: Optional[str] = None      # plain-text; will be encrypted before save
    secret_key: Optional[str] = None      # plain-text; will be encrypted before save
    endpoint_url: Optional[str] = None
    container_name: Optional[str] = None
    account_name: Optional[str] = None    # plain-text; will be encrypted before save
    account_key: Optional[str] = None     # plain-text; will be encrypted before save
    use_presigned_urls: Optional[bool] = True
    presigned_url_expires_seconds: Optional[int] = 3600

@app.get("/api/v1/storage/config")
def get_storage_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Return current storage config with credentials masked."""
    from models import StorageConfig
    config = db.query(StorageConfig).filter(StorageConfig.is_active == True).first()
    if not config:
        return {"provider": "local"}
    return {
        "provider": config.provider,
        "bucket_name": config.bucket_name,
        "region": config.region,
        "access_key": "••••••••" if config.access_key_encrypted else None,
        "secret_key": "••••••••" if config.secret_key_encrypted else None,
        "endpoint_url": config.endpoint_url,
        "container_name": config.container_name,
        "account_name": "••••••••" if config.account_name_encrypted else None,
        "account_key": "••••••••" if config.account_key_encrypted else None,
        "use_presigned_urls": config.use_presigned_urls,
        "presigned_url_expires_seconds": config.presigned_url_expires_seconds,
    }

@app.put("/api/v1/storage/config")
def update_storage_config(
    payload: StorageConfigPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Save or update the global storage configuration."""
    from models import StorageConfig
    from encryption_utils import encrypt_key

    config = db.query(StorageConfig).filter(StorageConfig.is_active == True).first()
    if not config:
        config = StorageConfig(is_active=True)
        db.add(config)

    config.provider = payload.provider
    config.bucket_name = payload.bucket_name
    config.region = payload.region
    config.endpoint_url = payload.endpoint_url
    config.container_name = payload.container_name
    config.use_presigned_urls = payload.use_presigned_urls if payload.use_presigned_urls is not None else True
    config.presigned_url_expires_seconds = payload.presigned_url_expires_seconds or 3600

    # Only overwrite encrypted fields if new plain-text value provided (non-empty, non-placeholder)
    MASK = "••••••••"
    if payload.access_key and payload.access_key != MASK:
        config.access_key_encrypted = encrypt_key(payload.access_key)
    if payload.secret_key and payload.secret_key != MASK:
        config.secret_key_encrypted = encrypt_key(payload.secret_key)
    if payload.account_name and payload.account_name != MASK:
        config.account_name_encrypted = encrypt_key(payload.account_name)
    if payload.account_key and payload.account_key != MASK:
        config.account_key_encrypted = encrypt_key(payload.account_key)

    db.commit()
    
    msg = "Storage configuration saved successfully."
    if payload.provider in ("azure", "s3"):
        msg += f" Make sure to add the 'cloud_storage' skill to your app so the LLM can use your {payload.provider.upper()} storage!"
        
    return {"message": msg}

@app.post("/api/v1/storage/test")
def test_storage_config(
    payload: Optional[StorageConfigPayload] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Test connectivity for the currently saved storage config, or a transient config payload."""
    from storage import S3Storage, AzureStorage, get_storage_backend
    from models import StorageConfig
    from encryption_utils import decrypt_key as decrypt_value

    if payload is not None:
        if payload.provider == "local":
            return {"success": True, "message": "Local storage is always available — no connection required."}

        # Load existing config for credential fallback decryption
        config = db.query(StorageConfig).filter(StorageConfig.is_active == True).first()
        MASK = "••••••••"

        if payload.provider == "s3":
            access_key = ""
            if payload.access_key and payload.access_key != MASK:
                access_key = payload.access_key
            elif config and config.access_key_encrypted:
                access_key = decrypt_value(config.access_key_encrypted)

            secret_key = ""
            if payload.secret_key and payload.secret_key != MASK:
                secret_key = payload.secret_key
            elif config and config.secret_key_encrypted:
                secret_key = decrypt_value(config.secret_key_encrypted)

            try:
                storage_client = S3Storage(
                    bucket_name=payload.bucket_name or "",
                    region=payload.region or "us-east-1",
                    access_key=access_key,
                    secret_key=secret_key,
                    endpoint_url=payload.endpoint_url or None,
                    use_presigned=payload.use_presigned_urls if payload.use_presigned_urls is not None else True,
                    presigned_expires=payload.presigned_url_expires_seconds or 3600,
                )
                return storage_client.test_connection()
            except Exception as e:
                return {"success": False, "message": str(e)}

        if payload.provider == "azure":
            account_name = ""
            if payload.account_name and payload.account_name != MASK:
                account_name = payload.account_name
            elif config and config.account_name_encrypted:
                account_name = decrypt_value(config.account_name_encrypted)

            account_key = ""
            if payload.account_key and payload.account_key != MASK:
                account_key = payload.account_key
            elif config and config.account_key_encrypted:
                account_key = decrypt_value(config.account_key_encrypted)

            try:
                storage_client = AzureStorage(
                    account_name=account_name,
                    account_key=account_key,
                    container_name=payload.container_name or "",
                    use_presigned=payload.use_presigned_urls if payload.use_presigned_urls is not None else True,
                    presigned_expires=payload.presigned_url_expires_seconds or 3600,
                )
                return storage_client.test_connection()
            except Exception as e:
                return {"success": False, "message": str(e)}

    # Fallback to saved config
    try:
        backend = get_storage_backend(db)
        if isinstance(backend, (S3Storage, AzureStorage)):
            return backend.test_connection()
    except Exception as e:
        return {"success": False, "message": str(e)}

    return {"success": True, "message": "Local storage is always available — no connection required."}


# ─────────────────────────────────────────────────────────────────────────────
# Sandbox Configuration API
# ─────────────────────────────────────────────────────────────────────────────

class SandboxConfigPayload(BaseModel):
    provider: str  # none | azure | fly | e2b | lambda
    e2b_api_key: Optional[str] = None
    azure_client_id: Optional[str] = None
    azure_client_secret: Optional[str] = None
    azure_tenant_id: Optional[str] = None
    azure_session_pool_endpoint: Optional[str] = None
    fly_api_token: Optional[str] = None
    fly_app_name: Optional[str] = None
    aws_access_key: Optional[str] = None
    aws_secret_key: Optional[str] = None
    aws_region: Optional[str] = None
    aws_function_name: Optional[str] = None


@app.get("/api/v1/sandbox/config")
def get_sandbox_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Return the global sandbox config with masked secrets."""
    from models import SandboxConfig
    config = db.query(SandboxConfig).filter(SandboxConfig.is_active == True).first()
    if not config:
        return {"provider": "none"}
    return {
        "provider": config.provider,
        "e2b_api_key": "••••••••" if config.e2b_api_key_encrypted else None,
        "azure_client_id": "••••••••" if config.azure_client_id_encrypted else None,
        "azure_client_secret": "••••••••" if config.azure_client_secret_encrypted else None,
        "azure_tenant_id": "••••••••" if config.azure_tenant_id_encrypted else None,
        "azure_session_pool_endpoint": config.azure_session_pool_endpoint,
        "fly_api_token": "••••••••" if config.fly_api_token_encrypted else None,
        "fly_app_name": config.fly_app_name,
        "aws_access_key": "••••••••" if config.aws_access_key_encrypted else None,
        "aws_secret_key": "••••••••" if config.aws_secret_key_encrypted else None,
        "aws_region": config.aws_region,
        "aws_function_name": config.aws_function_name,
    }


@app.put("/api/v1/sandbox/config")
def update_sandbox_config(
    payload: SandboxConfigPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Save or update the global sandbox configuration."""
    from models import SandboxConfig
    from encryption_utils import encrypt_key

    config = db.query(SandboxConfig).filter(SandboxConfig.is_active == True).first()
    if not config:
        config = SandboxConfig(is_active=True)
        db.add(config)

    config.provider = payload.provider
    config.azure_session_pool_endpoint = payload.azure_session_pool_endpoint
    config.fly_app_name = payload.fly_app_name
    config.aws_region = payload.aws_region
    config.aws_function_name = payload.aws_function_name

    MASK = "••••••••"
    if payload.e2b_api_key and payload.e2b_api_key != MASK:
        config.e2b_api_key_encrypted = encrypt_key(payload.e2b_api_key)
    if payload.azure_client_id and payload.azure_client_id != MASK:
        config.azure_client_id_encrypted = encrypt_key(payload.azure_client_id)
    if payload.azure_client_secret and payload.azure_client_secret != MASK:
        config.azure_client_secret_encrypted = encrypt_key(payload.azure_client_secret)
    if payload.azure_tenant_id and payload.azure_tenant_id != MASK:
        config.azure_tenant_id_encrypted = encrypt_key(payload.azure_tenant_id)
    if payload.fly_api_token and payload.fly_api_token != MASK:
        config.fly_api_token_encrypted = encrypt_key(payload.fly_api_token)
    if payload.aws_access_key and payload.aws_access_key != MASK:
        config.aws_access_key_encrypted = encrypt_key(payload.aws_access_key)
    if payload.aws_secret_key and payload.aws_secret_key != MASK:
        config.aws_secret_key_encrypted = encrypt_key(payload.aws_secret_key)

    db.commit()
    return {"message": "Sandbox configuration saved successfully."}


@app.get("/api/v1/apps")
def list_apps(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: Optional[int] = None,
    page_size: int = 10,
    search: Optional[str] = None
):
    from models import AppModel
    query = db.query(AppModel)
    if search:
        query = query.filter(AppModel.name.ilike(f"%{search}%") | AppModel.description.ilike(f"%{search}%"))
    query = query.order_by(AppModel.created_at.desc())
    
    def serialize(a):
        skill_list = [s.skill_name for s in a.skills]
        total_tools = 0
        for sk_name in skill_list:
            sk_data = skill_registry.skills.get(sk_name)
            if sk_data:
                total_tools += len(sk_data.get("tools", []))
        return {
            "id": a.id,
            "name": a.name,
            "description": a.description,
            "icon": a.icon,
            "skill_names": skill_list,
            "skills_count": len(skill_list),
            "tools_count": total_tools,
            "created_at": a.created_at.isoformat() if a.created_at else None
        }
    return get_paginated_response(query, page, page_size, serialize)

@app.post("/api/v1/apps")
def create_app(
    payload: AppCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from models import AppModel, AppSkillMapping
    clean_name = payload.name.strip()
    app_obj = db.query(AppModel).filter(AppModel.name == clean_name).first()
    if not app_obj:
        app_obj = AppModel(
            name=clean_name,
            description=payload.description,
            icon=payload.icon or "box"
        )
        db.add(app_obj)
        db.commit()
        db.refresh(app_obj)
    else:
        app_obj.description = payload.description
        app_obj.icon = payload.icon or "box"
        db.query(AppSkillMapping).filter(AppSkillMapping.app_id == app_obj.id).delete()
        db.commit()

    for s_name in payload.skill_names:
        db.add(AppSkillMapping(app_id=app_obj.id, skill_name=s_name))
    db.commit()

    return {"status": "created", "app_id": app_obj.id, "name": app_obj.name}

@app.delete("/api/v1/apps/{app_id}")
def delete_app(
    app_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from models import AppModel
    app_obj = db.query(AppModel).filter(AppModel.id == app_id).first()
    if not app_obj:
        raise HTTPException(status_code=404, detail="App not found")
    db.delete(app_obj)
    db.commit()
    return {"status": "deleted", "app_id": app_id}

@app.get("/api/v1/health")
def health_check():
    return {"status": "ok", "service": "skill_manager"}

@app.get("/api/v1/skills")
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

@app.post("/api/v1/skills")
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

@app.get("/api/v1/skills/{skill_name}")
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

@app.put("/api/v1/skills/{skill_name}")
def update_skill(
    skill_name: str,
    payload: SkillSaveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from models import CustomSkill
    clean_name = skill_name.strip().lower().replace(" ", "_")
    
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

@app.delete("/api/v1/skills/{skill_name}")
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

@app.post("/api/v1/interact")
def interact(
    req: PlaygroundChatRequest,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db)
):
    result = skill_engine.process_chat(
        db=db,
        tenant=tenant,
        session_id=req.session_id,
        user_message=req.message,
        prochat_model=req.prochat_model,
        user_data=req.user_data,
        skill_names=req.skill_names
    )
    return result

@app.post("/api/v1/chat/stream")
def stream_interact(
    req: PlaygroundChatRequest,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db)
):
    from fastapi.responses import StreamingResponse
    return StreamingResponse(
        skill_engine.stream_openai_chat(
            db=db,
            tenant=tenant,
            session_id=req.session_id,
            user_message=req.message,
            prochat_model=req.prochat_model,
            user_data=req.user_data,
            skill_names=req.skill_names
        ),
        media_type="text/event-stream"
    )

@app.post("/api/v1/chat/completions")
def openai_chat_completions(
    req: OpenAIChatRequest,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
    x_request_source: Optional[str] = Header(default="api", alias="X-Request-Source")
):
    last_user_msg = next((m.content for m in reversed(req.messages) if m.role == "user"), "")
    if not last_user_msg:
        raise HTTPException(status_code=400, detail="No user message found in payload")

    # Validate app_id if provided — reject unknown IDs immediately
    if req.app_id:
        from models import AppModel
        app_obj = db.query(AppModel).filter(AppModel.id == req.app_id).first()
        if not app_obj:
            raise HTTPException(status_code=404, detail=f"App '{req.app_id}' not found. Provide a valid app_id or omit it to use all available skills.")

    try:
        if req.stream:
            from fastapi.responses import StreamingResponse
            return StreamingResponse(
                skill_engine.stream_openai_chat(
                    db=db,
                    tenant=tenant,
                    session_id=req.session_id,
                    user_message=last_user_msg,
                    app_id=req.app_id,
                    model_name=req.model or "gemini-2.5-flash",
                    request_source=x_request_source,
                    prochat_model=req.prochat_model,
                    user_data=req.user_data,
                    skill_names=req.skill_names
                ),
                media_type="text/event-stream"
            )

        result = skill_engine.process_chat(
            db=db,
            tenant=tenant,
            session_id=req.session_id,
            user_message=last_user_msg,
            app_id=req.app_id,
            model_name=req.model,
            request_source=x_request_source,
            prochat_model=req.prochat_model,
            user_data=req.user_data,
            skill_names=req.skill_names
        )

        return {
            "id": f"chatcmpl-{result['session_id']}",
            "request_id": result.get("request_id"),
            "object": "chat.completion",
            "created": 1700000000,
            "model": req.model,
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": result["response"],
                        "json": result.get("json"),
                        "code": result.get("code")
                    },
                    "finish_reason": "stop"
                }
            ],
            "executed_tools": result.get("executed_tools", [])
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

# --- Chat Request Log Endpoints ---

@app.get("/api/v1/requests")
def list_chat_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: Optional[int] = None,
    page_size: int = 20,
    request_source: Optional[str] = None,
    tenant_name: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None
):
    query = db.query(ChatRequest)
    if request_source:
        query = query.filter(ChatRequest.request_source == request_source)
    if status:
        query = query.filter(ChatRequest.status == status)
    if tenant_name and tenant_name != "ALL":
        query = query.join(Tenant).filter(Tenant.name == tenant_name)
    if search:
        query = query.filter(ChatRequest.user_message.ilike(f"%{search}%"))
    query = query.order_by(ChatRequest.created_at.desc())

    def serialize(r):
        tenant_obj = db.query(Tenant).filter(Tenant.id == r.tenant_id).first() if r.tenant_id else None
        return {
            "id": r.id,
            "tenant_name": tenant_obj.name if tenant_obj else "Unknown",
            "session_id": r.session_id,
            "app_id": r.app_id,
            "model_name": r.model_name,
            "request_source": r.request_source,
            "user_message": r.user_message,
            "assistant_response": r.assistant_response,
            "tools_called": r.tools_called or 0,
            "total_duration_ms": r.total_duration_ms,
            "prompt_tokens": r.prompt_tokens or 0,
            "completion_tokens": r.completion_tokens or 0,
            "cost_usd": getattr(r, "cost_usd", 0.0) or 0.0,
            "status": r.status,
            "error_detail": r.error_detail,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "completed_at": r.completed_at.isoformat() if r.completed_at else None
        }
    return get_paginated_response(query, page, page_size, serialize)

@app.get("/api/v1/requests/{request_id}")
def get_chat_request(
    request_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    r = db.query(ChatRequest).filter(ChatRequest.id == request_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Request not found")
    tenant_obj = db.query(Tenant).filter(Tenant.id == r.tenant_id).first() if r.tenant_id else None
    logs = db.query(ExecutionLog).filter(ExecutionLog.request_id == request_id).order_by(ExecutionLog.created_at.asc()).all()
    return {
        "id": r.id,
        "tenant_name": tenant_obj.name if tenant_obj else "Unknown",
        "session_id": r.session_id,
        "app_id": r.app_id,
        "model_name": r.model_name,
        "request_source": r.request_source,
        "user_message": r.user_message,
        "assistant_response": r.assistant_response,
        "tools_called": r.tools_called or 0,
        "total_duration_ms": r.total_duration_ms,
        "prompt_tokens": r.prompt_tokens or 0,
        "completion_tokens": r.completion_tokens or 0,
        "cost_usd": getattr(r, "cost_usd", 0.0) or 0.0,
        "status": r.status,
        "error_detail": r.error_detail,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        "execution_logs": [
            {
                "id": log.id,
                "skill_name": log.skill_name,
                "tool_name": log.tool_name,
                "command": log.command,
                "sandbox_type": log.sandbox_type,
                "stdout": log.stdout,
                "stderr": log.stderr,
                "exit_code": log.exit_code,
                "execution_time_ms": log.execution_time_ms,
                "created_at": log.created_at.isoformat() if log.created_at else None
            }
            for log in logs
        ]
    }

@app.get("/api/v1/usage/summary")
def get_usage_summary(
    tenant_name: Optional[str] = None,
    model_name: Optional[str] = None,
    request_source: Optional[str] = None,
    page: Optional[int] = None,
    page_size: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from models import Tenant
    from sqlalchemy import func
    
    query = db.query(
        ChatRequest.tenant_id,
        ChatRequest.model_name,
        ChatRequest.request_source,
        func.count(ChatRequest.id).label("request_count"),
        func.sum(ChatRequest.prompt_tokens).label("total_prompt_tokens"),
        func.sum(ChatRequest.completion_tokens).label("total_completion_tokens"),
        func.sum(ChatRequest.cost_usd).label("total_cost_usd")
    ).filter(ChatRequest.status == "completed")
    
    if model_name:
        query = query.filter(ChatRequest.model_name == model_name)
    if tenant_name and tenant_name != "ALL":
        query = query.join(Tenant).filter(Tenant.name == tenant_name)
    if request_source:
        query = query.filter(ChatRequest.request_source == request_source)
        
    results = query.group_by(
        ChatRequest.tenant_id,
        ChatRequest.model_name,
        ChatRequest.request_source
    ).all()
    
    tenant_cache = {}
    summary = []
    
    for r in results:
        tenant_id = r.tenant_id
        if tenant_id not in tenant_cache:
            t = db.query(Tenant).filter(Tenant.id == tenant_id).first()
            tenant_cache[tenant_id] = t.name if t else "Unknown"
            
        summary.append({
            "tenant_name": tenant_cache[tenant_id],
            "model_name": r.model_name or "Unknown",
            "request_source": r.request_source or "api",
            "request_count": r.request_count,
            "prompt_tokens": r.total_prompt_tokens or 0,
            "completion_tokens": r.total_completion_tokens or 0,
            "cost_usd": round(r.total_cost_usd or 0.0, 6)
        })
        
    totals_query = db.query(
        func.sum(ChatRequest.cost_usd).label("cost_usd"),
        func.count(ChatRequest.id).label("request_count"),
        func.sum(ChatRequest.prompt_tokens).label("prompt_tokens"),
        func.sum(ChatRequest.completion_tokens).label("completion_tokens")
    ).filter(ChatRequest.status == "completed")
    
    if model_name:
        totals_query = totals_query.filter(ChatRequest.model_name == model_name)
    if tenant_name and tenant_name != "ALL":
        totals_query = totals_query.join(Tenant).filter(Tenant.name == tenant_name)
    if request_source:
        totals_query = totals_query.filter(ChatRequest.request_source == request_source)
        
    totals_res = totals_query.first()

    paginated_res = get_paginated_response(summary, page, page_size, lambda x: x, is_query=False)

    return {
        "items": paginated_res["items"] if isinstance(paginated_res, dict) else paginated_res,
        "total": paginated_res["total"] if isinstance(paginated_res, dict) else len(summary),
        "page": paginated_res["page"] if isinstance(paginated_res, dict) else 1,
        "pages": paginated_res["pages"] if isinstance(paginated_res, dict) else 1,
        "totals": {
            "request_count": (totals_res.request_count if totals_res else 0) or 0,
            "prompt_tokens": (totals_res.prompt_tokens if totals_res else 0) or 0,
            "completion_tokens": (totals_res.completion_tokens if totals_res else 0) or 0,
            "cost_usd": round((totals_res.cost_usd if totals_res else 0.0) or 0.0, 6)
        }
    }

# --- Session & History Endpoints ---

@app.get("/api/v1/sessions")
def list_conversation_sessions(
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
    page: Optional[int] = None,
    page_size: int = 10
):
    from models import ConversationSession, ChatMessage
    query = db.query(ConversationSession).filter(
        ConversationSession.tenant_id == tenant.id
    ).order_by(ConversationSession.created_at.desc())
 
    def serialize(s):
        first_msg = db.query(ChatMessage).filter(
            ChatMessage.session_id == s.id,
            ChatMessage.role == "user"
        ).order_by(ChatMessage.created_at.asc()).first()
        title = (first_msg.content[:40] + "...") if first_msg and first_msg.content else f"Session {s.session_id}"
        return {
            "id": s.session_id,
            "db_id": s.id,
            "title": title,
            "created_at": s.created_at.isoformat() if s.created_at else None
        }
    return get_paginated_response(query, page, page_size, serialize)
 
@app.get("/api/v1/sessions/{session_id}/messages")
def get_session_messages(
    session_id: str,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
    page: Optional[int] = None,
    page_size: int = 50
):
    from models import ConversationSession, ChatMessage
    s = db.query(ConversationSession).filter(
        ConversationSession.tenant_id == tenant.id,
        ConversationSession.session_id == session_id
    ).first()
 
    if not s:
        return [] if page is None else {
            "items": [],
            "total": 0,
            "page": page,
            "page_size": page_size,
            "pages": 0
        }
 
    if page is None:
        msgs = db.query(ChatMessage).filter(
            ChatMessage.session_id == s.id
        ).order_by(ChatMessage.created_at.asc()).all()
        return [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "tool_calls": m.tool_calls,
                "json": m.json,
                "code": m.code,
                "timestamp": m.created_at.strftime("%H:%M:%S") if m.created_at else ""
            }
            for m in msgs
        ]
 
    query = db.query(ChatMessage).filter(
        ChatMessage.session_id == s.id
    ).order_by(ChatMessage.created_at.desc())
 
    import math
    total = query.count()
    offset = (page - 1) * page_size
    items = query.offset(offset).limit(page_size).all()
    items_asc = list(reversed(items))
    pages = math.ceil(total / page_size) if page_size > 0 else 1
 
    return {
        "items": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "tool_calls": m.tool_calls,
                "json": m.json,
                "code": m.code,
                "timestamp": m.created_at.strftime("%H:%M:%S") if m.created_at else ""
            }
            for m in items_asc
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": pages
    }

@app.get("/api/v1/tenants")
def get_tenants(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    page: Optional[int] = None,
    page_size: int = 10,
    search: Optional[str] = None
):
    query = db.query(Tenant)
    if current_user.id != "system":
        query = query.filter(Tenant.user_id == current_user.id)
    if search:
        query = query.filter(Tenant.name.ilike(f"%{search}%"))
    query = query.order_by(Tenant.created_at.desc())
    def serialize(t):
        return {
            "id": t.id,
            "name": t.name,
            "api_key": t.api_key,
            "is_active": t.is_active,
            "models_count": len(t.llms) if t.llms else 0,
            "created_at": t.created_at.isoformat() if t.created_at else None
        }
    return get_paginated_response(query, page, page_size, serialize)

@app.post("/api/v1/tenants")
def create_tenant(
    payload: TenantCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    import re
    name_val = payload.name.strip()
    if not name_val:
        raise HTTPException(status_code=400, detail="Tenant name cannot be empty.")
    if " " in name_val:
        raise HTTPException(status_code=400, detail="Tenant name must not contain spaces.")
    if not re.match(r"^[a-zA-Z0-9_-]+$", name_val):
        raise HTTPException(status_code=400, detail="Tenant name can only contain alphanumeric characters, underscores, and hyphens.")
    
    existing = db.query(Tenant).filter(Tenant.name.ilike(name_val)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Tenant name already exists.")

    tenant = Tenant(
        name=name_val,
        api_key=generate_api_key(),
        is_active=True,
        user_id=current_user.id if current_user.id != "system" else None
    )
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    return {
        "id": tenant.id,
        "name": tenant.name,
        "api_key": tenant.api_key,
        "created_at": tenant.created_at.isoformat()
    }

@app.delete("/api/v1/tenants/{tenant_id}")
def delete_tenant(
    tenant_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(Tenant).filter(Tenant.id == tenant_id)
    if current_user.id != "system":
        query = query.filter(Tenant.user_id == current_user.id)
    tenant = query.first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    db.delete(tenant)
    db.commit()
    return {"status": "deleted", "tenant_id": tenant_id}

@app.get("/api/v1/logs/filters")
def get_logs_filters(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    search_tenant: Optional[str] = None,
    search_model: Optional[str] = None
):
    from models import Tenant
    t_query = db.query(Tenant.name).join(ExecutionLog).distinct()
    if search_tenant:
        t_query = t_query.filter(Tenant.name.ilike(f"%{search_tenant}%"))
    tenants = t_query.limit(10).all() if not search_tenant else t_query.all()
    
    m_query = db.query(ExecutionLog.model_name).distinct()
    if search_model:
        m_query = m_query.filter(ExecutionLog.model_name.ilike(f"%{search_model}%"))
    models = m_query.limit(10).all() if not search_model else m_query.all()
    
    return {
        "tenants": [t[0] for t in tenants if t[0]],
        "models": [m[0] for m in models if m[0]]
    }

@app.get("/api/v1/logs")
def get_logs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: Optional[int] = None,
    page_size: int = 20,
    request_source: Optional[str] = None,
    tenant_name: Optional[str] = None,
    model_name: Optional[str] = None,
    sandbox_type: Optional[str] = None
):
    query = db.query(ExecutionLog)
    if request_source:
        if request_source == 'dashboard':
            query = query.filter(ExecutionLog.request_source == 'dashboard')
        else:
            query = query.filter(ExecutionLog.request_source != 'dashboard')
    if tenant_name and tenant_name != 'ALL':
        query = query.join(Tenant).filter(Tenant.name == tenant_name)
    if model_name and model_name != 'ALL':
        query = query.filter(ExecutionLog.model_name == model_name)
    if sandbox_type and sandbox_type != 'ALL':
        query = query.filter(ExecutionLog.sandbox_type == sandbox_type.lower())
        
    query = query.order_by(ExecutionLog.created_at.desc())

    def serialize(log):
        return {
            "id": log.id,
            "tenant_id": log.tenant_id,
            "tenant_name": log.tenant.name if log.tenant else "System/Global",
            "session_id": log.session_id,
            "skill_name": log.skill_name,
            "tool_name": log.tool_name,
            "command": log.command,
            "sandbox_type": log.sandbox_type,
            "stdout": log.stdout,
            "stderr": log.stderr,
            "exit_code": log.exit_code,
            "execution_time_ms": log.execution_time_ms,
            "model_name": log.model_name or "default",
            "request_source": log.request_source or "api",
            "created_at": log.created_at.isoformat() if log.created_at else None
        }
    return get_paginated_response(query, page, page_size, serialize)

# --- MCP External Server Management Endpoints ---

class McpServerCreate(BaseModel):
    name: str
    transport: Optional[str] = "stdio"
    command: Optional[str] = None
    url: Optional[str] = None
    env: Optional[str] = None

@app.get("/api/v1/mcp_servers")
def list_mcp_servers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: Optional[int] = None,
    page_size: int = 10,
    search: Optional[str] = None
):
    from models import McpServer
    from mcp_manager import mcp_manager
    query = db.query(McpServer)
    if search:
        query = query.filter(McpServer.name.ilike(f"%{search}%"))
    query = query.order_by(McpServer.created_at.desc())
    def serialize(s):
        tools = mcp_manager.list_tools(s)
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

@app.post("/api/v1/mcp_servers")
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

    skill_registry.reload_skills(db=db)
    return {"status": "deleted", "server_id": server_id}


# --- User Data Template Management Endpoints ---

class UserDataTemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    data: dict


@app.get("/api/v1/user_data_templates")
def list_user_data_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: Optional[int] = None,
    page_size: int = 10,
    search: Optional[str] = None
):
    from models import UserDataTemplate
    import json
    query = db.query(UserDataTemplate)
    if search:
        query = query.filter(UserDataTemplate.name.ilike(f"%{search}%") | UserDataTemplate.description.ilike(f"%{search}%"))
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


@app.post("/api/v1/user_data_templates")
def create_or_update_user_data_template(
    payload: UserDataTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from models import UserDataTemplate
    import json
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


@app.delete("/api/v1/user_data_templates/{template_id}")
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

@app.get("/api/v1/tenant/llms")
def list_tenant_llms(
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: Optional[int] = None,
    page_size: int = 10,
    search: Optional[str] = None
):
    from models import TenantLLM
    query = db.query(TenantLLM).filter(TenantLLM.tenant_id == tenant.id)
    if search:
        query = query.filter(TenantLLM.model_name.ilike(f"%{search}%") | TenantLLM.provider.ilike(f"%{search}%"))
    query = query.order_by(TenantLLM.created_at.desc())
    def serialize(l):
        return {
            "id": l.id,
            "provider": l.provider,
            "model_name": l.model_name,
            "base_url": l.base_url,
            "is_active": l.is_active,
            "created_at": l.created_at.isoformat() if l.created_at else None
        }
    return get_paginated_response(query, page, page_size, serialize)

@app.post("/api/v1/tenant/llms")
def create_tenant_llm(
    payload: TenantLlmCreate,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from models import TenantLLM
    from encryption_utils import encrypt_key
    
    existing = db.query(TenantLLM).filter(
        TenantLLM.tenant_id == tenant.id,
        TenantLLM.model_name == payload.model_name
    ).first()
    
    encrypted_key = encrypt_key(payload.api_key)
    
    if existing:
        existing.provider = payload.provider
        existing.api_key_encrypted = encrypted_key
        existing.base_url = payload.base_url
        existing.is_active = True
        db.commit()
        db.refresh(existing)
        return {"status": "updated", "id": existing.id}
    else:
        new_llm = TenantLLM(
            tenant_id=tenant.id,
            provider=payload.provider,
            model_name=payload.model_name,
            api_key_encrypted=encrypted_key,
            base_url=payload.base_url,
            is_active=True
        )
        db.add(new_llm)
        db.commit()
        db.refresh(new_llm)
        return {"status": "created", "id": new_llm.id}

@app.delete("/api/v1/tenant/llms/{llm_id}")
def delete_tenant_llm(
    llm_id: str,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from models import TenantLLM
    llm = db.query(TenantLLM).filter(
        TenantLLM.id == llm_id,
        TenantLLM.tenant_id == tenant.id
    ).first()
    
    if not llm:
        raise HTTPException(status_code=404, detail="LLM configuration not found")
        
    db.delete(llm)
    db.commit()
    return {"status": "deleted", "id": llm_id}

@app.get("/api/v1/generator/models")
def get_generator_models(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from models import Tenant, TenantLLM
    tenants = db.query(Tenant).filter(Tenant.user_id == current_user.id).all()
    res = []
    for t in tenants:
        models = db.query(TenantLLM).filter(
            TenantLLM.tenant_id == t.id,
            TenantLLM.is_active == True,
            TenantLLM.provider != "prochat"
        ).all()
        for m in models:
            res.append({
                "tenant_id": t.id,
                "tenant_name": t.name,
                "model_name": m.model_name,
                "provider": m.provider
            })
    return res

@app.post("/api/v1/generator/generate")
def generate_skill_content(
    payload: SkillGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from models import Tenant
    tenant = db.query(Tenant).filter(
        Tenant.id == payload.tenant_id,
        Tenant.user_id == current_user.id
    ).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found or unauthorized")
    
    from llm_client import get_llm_client
    try:
        client = get_llm_client(db=db, tenant_id=payload.tenant_id, model_name=payload.model_name)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    system_prompt = (
        "You are an expert AI developer for the AI Skill Engine. "
        "Your task is to write a valid skill file in the `SKILL.md` format based on the user's requirements.\n\n"
        "A skill file must contain a YAML frontmatter block at the very top, followed by markdown instructions.\n"
        "Here is the structure of the YAML frontmatter:\n"
        "```yaml\n"
        "name: skill_name_in_snake_case\n"
        "description: Clear, detailed description of when the LLM should trigger this skill.\n"
        "tools:\n"
        "  - name: tool_name\n"
        "    description: What this tool does.\n"
        "    # For API calls, use type: http\n"
        "    type: http\n"
        "    # CRITICAL: For GET/DELETE requests, any query parameters from user_data MUST be appended directly to the URL string\n"
        "    # (e.g. url: \"https://api.example.com/search?db={{user_data.database_name}}&token={{user_data.token}}\").\n"
        "    # Do NOT put static or user_data keys in a 'params:' block, as the http executor will ignore them.\n"
        "    url: https://api.example.com/endpoint\n"
        "    method: GET # or POST, PUT, DELETE, etc.\n"
        "    headers:\n"
        "      Authorization: \"Bearer {{user_data.api_token_name}}\" # optional mapping to user_data\n"
        "    # Define tool arguments that the LLM user supplies under parameters.properties:\n"
        "    parameters:\n"
        "      type: object\n"
        "      properties:\n"
        "        query:\n"
        "          type: string\n"
        "          description: User search query\n"
        "      required:\n"
        "        - query\n"
        "    # For custom code/scripts, use type: python (or leave out for default shell commands)\n"
        "    # type: python\n"
        "    # code: | ...\n"
        "```\n\n"
        "Rules for the output:\n"
        "1. Start directly with the triple-dash `---` and end the frontmatter block with `---`.\n"
        "2. Do NOT wrap the entire output in a code block or markdown wrapper. Return ONLY the raw file content.\n"
        "3. Keep YAML strings properly formatted and escaped.\n"
        "4. Include clear instructions/guidelines for the LLM under the frontmatter block.\n"
    )
    
    prompt = (
        f"Skill Name: {payload.skill_name}\n"
        f"Description: {payload.description}\n"
    )
    if payload.api_calls:
        prompt += "\nThe skill requires the following API calls (HTTP tools):\n"
        for i, api in enumerate(payload.api_calls):
            prompt += (
                f"\nAPI Call #{i+1}:\n"
                f"  Method: {api.method}\n"
                f"  URL: {api.url}\n"
            )
            if api.headers:
                prompt += "  Headers:\n"
                for h in api.headers:
                    prompt += f"    {h.get('key')}: {h.get('value')}\n"
            if api.query_params:
                prompt += "  Query Parameters:\n"
                for q in api.query_params:
                    prompt += f"    {q.get('key')}: {q.get('value')}\n"
            if api.body:
                prompt += f"  Request Body / payload details: {api.body}\n"
                
    if payload.inputs_secrets:
        prompt += f"\nRequired Credentials/Secrets from user_data: {payload.inputs_secrets}\n"
    if payload.behavior:
        prompt += f"\nBehavior & Rules: {payload.behavior}\n"
        
    try:
        response = client.chat.completions.create(
            model=payload.model_name,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            stream=False
        )
        content = response.choices[0].message.content
        if content.startswith("```"):
            lines = content.splitlines()
            if lines[0].startswith("```yaml") or lines[0].startswith("```markdown") or lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            content = "\n".join(lines)
        return {"content": content.strip()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM Generation failed: {str(e)}")

# Mount static files & SPA Fallback for clean HTML5 paths (/playground, /apps, /skills, etc.)
from fastapi.responses import FileResponse

frontend_dist = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")
if os.path.exists(frontend_dist):
    assets_dir = os.path.join(frontend_dist, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="static_assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API endpoint not found")
        target = os.path.join(frontend_dist, full_path)
        if os.path.isfile(target):
            return FileResponse(target)
        return FileResponse(os.path.join(frontend_dist, "index.html"))
