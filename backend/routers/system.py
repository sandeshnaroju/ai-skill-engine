from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import User, Tenant
from auth import get_current_user, get_current_tenant
from schemas import StorageConfigPayload, SandboxConfigPayload, EmailConfigSave, EmailConfigTest

router = APIRouter()


@router.get("/db-status")
def get_db_status():
    from database import db_creation_status
    return db_creation_status


@router.get("/health")
def get_health():
    """
    Public health check endpoint — no auth required.
    Returns DB readiness and encryption key status so the frontend
    can display configuration errors before the user interacts.
    """
    from database import db_creation_status
    from main import _ENCRYPTION_ERROR
    return {
        "db_ready": db_creation_status.get("ready", False),
        "encryption_ok": _ENCRYPTION_ERROR is None,
        "encryption_error": _ENCRYPTION_ERROR,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Storage Configuration API
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/storage/config")
def get_storage_config(
    tenant_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant)
):
    """Return current storage config with credentials masked."""
    from models import StorageConfig
    target_tenant_id = current_tenant.id
    if tenant_id:
        tenant_check = db.query(Tenant).filter(Tenant.id == tenant_id, Tenant.user_id == current_tenant.user_id).first()
        if tenant_check:
            target_tenant_id = tenant_check.id

    config = db.query(StorageConfig).filter(
        StorageConfig.is_active == True,
        StorageConfig.tenant_id == target_tenant_id
    ).first()
    from models import Tenant as DBTenant
    t_obj = db.query(DBTenant).filter(DBTenant.id == target_tenant_id).first()
    t_name = t_obj.name if t_obj else "Global"

    if not config:
        return {"provider": "local", "tenant_name": t_name}
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
        "tenant_name": t_name,
    }


@router.put("/storage/config")
def update_storage_config(
    payload: StorageConfigPayload,
    db: Session = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant)
):
    """Save or update the global storage configuration."""
    from models import StorageConfig
    from encryption_utils import encrypt_key

    target_tenant_id = current_tenant.id
    if payload.tenant_id:
        tenant_check = db.query(Tenant).filter(Tenant.id == payload.tenant_id, Tenant.user_id == current_tenant.user_id).first()
        if tenant_check:
            target_tenant_id = tenant_check.id

    config = db.query(StorageConfig).filter(
        StorageConfig.is_active == True,
        StorageConfig.tenant_id == target_tenant_id
    ).first()
    if not config:
        config = StorageConfig(is_active=True, tenant_id=target_tenant_id)
        db.add(config)

    config.provider = payload.provider
    config.bucket_name = payload.bucket_name
    config.region = payload.region
    config.endpoint_url = payload.endpoint_url
    config.container_name = payload.container_name
    config.use_presigned_urls = payload.use_presigned_urls if payload.use_presigned_urls is not None else True
    config.presigned_url_expires_seconds = payload.presigned_url_expires_seconds or 3600

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


@router.post("/storage/test")
def test_storage_connection(
    payload: Optional[StorageConfigPayload] = None,
    db: Session = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant)
):
    """Test connectivity for the currently saved storage config, or a transient config payload."""
    from storage import S3Storage, AzureStorage, get_storage_backend
    from models import StorageConfig
    from encryption_utils import decrypt_key as decrypt_value

    target_tenant_id = current_tenant.id
    if payload and payload.tenant_id:
        tenant_check = db.query(Tenant).filter(Tenant.id == payload.tenant_id, Tenant.user_id == current_tenant.user_id).first()
        if tenant_check:
            target_tenant_id = tenant_check.id

    if payload is not None:
        if payload.provider == "local":
            return {"success": True, "message": "Local storage is always available — no connection required."}

        config = db.query(StorageConfig).filter(
            StorageConfig.is_active == True,
            StorageConfig.tenant_id == target_tenant_id
        ).first()
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

    try:
        backend = get_storage_backend(db, tenant_id=target_tenant_id)
        if isinstance(backend, (S3Storage, AzureStorage)):
            return backend.test_connection()
    except Exception as e:
        return {"success": False, "message": str(e)}

    return {"success": True, "message": "Local storage is always available — no connection required."}


# ─────────────────────────────────────────────────────────────────────────────
# Sandbox Configuration API
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/sandbox/config")
def get_sandbox_config(
    tenant_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant)
):
    """Return the global sandbox config with masked secrets."""
    from models import SandboxConfig
    target_tenant_id = current_tenant.id
    if tenant_id:
        tenant_check = db.query(Tenant).filter(Tenant.id == tenant_id, Tenant.user_id == current_tenant.user_id).first()
        if tenant_check:
            target_tenant_id = tenant_check.id

    config = db.query(SandboxConfig).filter(
        SandboxConfig.is_active == True,
        SandboxConfig.tenant_id == target_tenant_id
    ).first()
    from models import Tenant as DBTenant
    t_obj = db.query(DBTenant).filter(DBTenant.id == target_tenant_id).first()
    t_name = t_obj.name if t_obj else "Global"

    if not config:
        return {"provider": "none", "tenant_name": t_name}
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
        "tenant_name": t_name,
    }


@router.put("/sandbox/config")
def update_sandbox_config(
    payload: SandboxConfigPayload,
    db: Session = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant)
):
    """Save or update the global sandbox configuration."""
    from models import SandboxConfig
    from encryption_utils import encrypt_key

    target_tenant_id = current_tenant.id
    if payload.tenant_id:
        tenant_check = db.query(Tenant).filter(Tenant.id == payload.tenant_id, Tenant.user_id == current_tenant.user_id).first()
        if tenant_check:
            target_tenant_id = tenant_check.id

    config = db.query(SandboxConfig).filter(
        SandboxConfig.is_active == True,
        SandboxConfig.tenant_id == target_tenant_id
    ).first()
    if not config:
        config = SandboxConfig(is_active=True, tenant_id=target_tenant_id)
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


# ─────────────────────────────────────────────────────────────────────────────
# Email Configuration API
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/email_config")
def get_email_config(
    tenant_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from models import EmailConfig, Tenant
    query = db.query(EmailConfig)
    if tenant_id:
        query = query.filter(EmailConfig.tenant_id == tenant_id)
    else:
        if current_user.id != "system":
            tenant = db.query(Tenant).filter(Tenant.user_id == current_user.id).first()
            if tenant:
                query = query.filter(EmailConfig.tenant_id == tenant.id)
            else:
                return {}
    config = query.first()
    if not config:
        return {}

    return {
        "id": config.id,
        "tenant_id": config.tenant_id,
        "smtp_host": config.smtp_host,
        "smtp_port": config.smtp_port,
        "smtp_username": config.smtp_username,
        "sender_email": config.sender_email,
        "use_tls": config.use_tls,
        "use_ssl": config.use_ssl,
        "has_password": bool(config.smtp_password_encrypted)
    }


@router.post("/email_config")
def save_email_config(
    payload: EmailConfigSave,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from models import EmailConfig, Tenant
    from encryption_utils import encrypt_key

    t_id = payload.tenant_id
    if not t_id and current_user.id != "system":
        tenant = db.query(Tenant).filter(Tenant.user_id == current_user.id).first()
        if tenant:
            t_id = tenant.id
        else:
            raise HTTPException(status_code=400, detail="User must belong to a tenant to save SMTP config.")

    config = db.query(EmailConfig).filter(EmailConfig.tenant_id == t_id).first()
    if not config:
        config = EmailConfig(tenant_id=t_id)
        db.add(config)

    config.smtp_host = payload.smtp_host
    config.smtp_port = payload.smtp_port
    config.smtp_username = payload.smtp_username
    config.sender_email = payload.sender_email
    config.use_tls = payload.use_tls if payload.use_tls is not None else True
    config.use_ssl = payload.use_ssl if payload.use_ssl is not None else False

    if payload.smtp_password:
        config.smtp_password_encrypted = encrypt_key(payload.smtp_password)

    db.commit()
    db.refresh(config)
    return {
        "status": "success",
        "config_id": config.id,
        "has_password": bool(config.smtp_password_encrypted)
    }


@router.post("/email_config/test")
def test_email_config(
    payload: EmailConfigTest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from models import EmailConfig, Tenant
    from encryption_utils import decrypt_key
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart

    query = db.query(EmailConfig)
    if payload.tenant_id:
        query = query.filter(EmailConfig.tenant_id == payload.tenant_id)
    else:
        if current_user.id != "system":
            tenant = db.query(Tenant).filter(Tenant.user_id == current_user.id).first()
            if tenant:
                query = query.filter(EmailConfig.tenant_id == tenant.id)
            else:
                raise HTTPException(status_code=400, detail="No tenant associated with user.")
    config = query.first()
    if not config:
        raise HTTPException(status_code=404, detail="Email SMTP settings not found. Please configure them first.")

    password = None
    if config.smtp_password_encrypted:
        try:
            password = decrypt_key(config.smtp_password_encrypted)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to decrypt SMTP password: {str(e)}")

    try:
        msg = MIMEMultipart()
        msg['From'] = config.sender_email
        msg['To'] = payload.test_receiver
        msg['Subject'] = "AI Skill Engine - SMTP Connection Test"
        msg.attach(MIMEText("This is a test email validating your SMTP mail configuration from the AI Skill Engine Gateway. Your setup is successful!", "plain"))

        if config.use_ssl:
            server = smtplib.SMTP_SSL(config.smtp_host, config.smtp_port, timeout=10)
        else:
            server = smtplib.SMTP(config.smtp_host, config.smtp_port, timeout=10)
            if config.use_tls:
                server.starttls()

        if config.smtp_username:
            server.login(config.smtp_username, password)

        server.sendmail(config.sender_email, payload.test_receiver, msg.as_string())
        server.quit()
        return {"status": "success", "detail": f"Test email sent successfully to {payload.test_receiver}"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"SMTP test failed: {str(e)}")
