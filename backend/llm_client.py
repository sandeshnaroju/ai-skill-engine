import os
from dotenv import load_dotenv
from openai import OpenAI

# Automatically load .env file from workspace root or backend dir
load_dotenv()
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

from encryption_utils import decrypt_key

def get_llm_client(db=None, tenant_id: str = None, model_name: str = None):
    if not db:
        raise ValueError("Database session is required to initialize an LLM client.")
    if not tenant_id:
        raise ValueError("Tenant/workspace ID is required to initialize an LLM client.")
    if not model_name:
        raise ValueError("Model name is required to initialize an LLM client.")

    from models import TenantLLM
    config = db.query(TenantLLM).filter(
        TenantLLM.tenant_id == tenant_id,
        TenantLLM.model_name == model_name,
        TenantLLM.is_active == True
    ).first()

    if not config:
        raise ValueError(f"Model '{model_name}' is not configured or active for this workspace. Please register an LLM and API key in Settings.")

    api_key = decrypt_key(config.api_key_encrypted)
    base_url = config.base_url
    
    if config.provider == "openrouter":
        if not base_url:
            base_url = "https://openrouter.ai/api/v1"
        return OpenAI(
            api_key=api_key,
            base_url=base_url,
            default_headers={
                "HTTP-Referer": "https://github.com/sandeshnaroju/ai-skill-engine",
                "X-Title": "AI Skill Engine"
            }
        )
    else:
        if not base_url and (config.provider == "gemini" or "gemini" in (config.model_name or "").lower()):
            base_url = "https://generativelanguage.googleapis.com/v1beta/openai/"
        
        if base_url:
            return OpenAI(api_key=api_key, base_url=base_url)
        else:
            return OpenAI(api_key=api_key)

def get_model_name(db=None, tenant_id: str = None):
    if db and tenant_id:
        from models import TenantLLM
        first = db.query(TenantLLM).filter(
            TenantLLM.tenant_id == tenant_id,
            TenantLLM.is_active == True
        ).first()
        if first:
            return first.model_name
    return None
