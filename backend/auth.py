import secrets
from fastapi import Header, HTTPException, Depends, Security
from fastapi.security import APIKeyHeader
from sqlalchemy.orm import Session
from database import get_db
from models import Tenant

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

def generate_api_key(prefix: str = "sk_mgr_") -> str:
    return f"{prefix}{secrets.token_urlsafe(24)}"

def get_current_tenant(
    x_api_key: str = Security(api_key_header),
    db: Session = Depends(get_db)
) -> Tenant:
    if not x_api_key:
        # Default fallback tenant for local playground testing if no key header provided
        default_tenant = db.query(Tenant).filter(Tenant.name == "Default Playground Tenant").first()
        if not default_tenant:
            default_tenant = Tenant(
                name="Default Playground Tenant",
                api_key=generate_api_key("sk_demo_"),
                is_active=True
            )
            db.add(default_tenant)
            db.commit()
            db.refresh(default_tenant)
        return default_tenant

    tenant = db.query(Tenant).filter(Tenant.api_key == x_api_key, Tenant.is_active == True).first()
    if not tenant:
        raise HTTPException(status_code=401, detail="Invalid or inactive API Key")
    return tenant
