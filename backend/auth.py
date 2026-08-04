import secrets
import bcrypt
from typing import Optional
from fastapi import Header, HTTPException, Depends, Security, Cookie
from fastapi.security import APIKeyHeader
from sqlalchemy.orm import Session
from database import get_db
from models import Tenant, User

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

def generate_api_key(prefix: str = "sk_mgr_") -> str:
    return f"{prefix}{secrets.token_urlsafe(24)}"

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def verify_password(password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False

def get_current_user(
    session_token: Optional[str] = Cookie(None),
    db: Session = Depends(get_db)
) -> User:
    if not session_token:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    user = db.query(User).filter(User.session_token == session_token).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid session or logged out")
    return user

def get_current_tenant(
    x_api_key: Optional[str] = Security(api_key_header),
    session_token: Optional[str] = Cookie(None),
    db: Session = Depends(get_db)
) -> Tenant:
    # 1. API Key Auth (External API client calls)
    if x_api_key:
        tenant = db.query(Tenant).filter(Tenant.api_key == x_api_key, Tenant.is_active == True).first()
        if not tenant:
            raise HTTPException(status_code=401, detail="Invalid or inactive API Key")
        return tenant

    # 2. Session Cookie Auth (Dashboard frontend calls)
    if session_token:
        user = db.query(User).filter(User.session_token == session_token).first()
        if user:
            # Retrieve the user's tenant (or create a default one if none exists)
            tenant = db.query(Tenant).filter(Tenant.user_id == user.id, Tenant.is_active == True).first()
            if not tenant:
                safe_email = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in user.email.split("@")[0])
                tenant = Tenant(
                    name=f"{safe_email}_workspace",
                    api_key=generate_api_key("sk_usr_"),
                    is_active=True,
                    user_id=user.id
                )
                db.add(tenant)
                db.commit()
                db.refresh(tenant)
            return tenant

    raise HTTPException(status_code=401, detail="Authentication required or invalid credentials")
