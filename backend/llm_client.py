import os
from dotenv import load_dotenv
from openai import OpenAI

# Automatically load .env file from workspace root or backend dir
load_dotenv()
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

from encryption_utils import decrypt_key

def get_llm_client(db=None, tenant_id: str = None, model_name: str = None):
    if not db or not tenant_id or not model_name:
        api_key = os.getenv("LLM_API_KEY") or os.getenv("GEMINI_API_KEY") or os.getenv("OPENAI_API_KEY") or "dummy_key"
        base_url = os.getenv("LLM_BASE_URL")
        
        # Default to Gemini OpenAI-compatible endpoint if GEMINI_API_KEY is present and no base_url set
        if not base_url and (os.getenv("GEMINI_API_KEY") or "AIza" in api_key or "gemini" in (model_name or "").lower()):
            base_url = "https://generativelanguage.googleapis.com/v1beta/openai/"
        
        if base_url:
            return OpenAI(api_key=api_key, base_url=base_url)
        else:
            return OpenAI(api_key=api_key)

    from models import TenantLLM
    config = db.query(TenantLLM).filter(
        TenantLLM.tenant_id == tenant_id,
        TenantLLM.model_name == model_name,
        TenantLLM.is_active == True
    ).first()

    if config:
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
            if not base_url and (config.provider == "gemini" or "gemini" in model_name.lower()):
                base_url = "https://generativelanguage.googleapis.com/v1beta/openai/"
            
            if base_url:
                return OpenAI(api_key=api_key, base_url=base_url)
            else:
                return OpenAI(api_key=api_key)

    raise ValueError(f"Model '{model_name}' is not configured/registered for this tenant.")

def get_model_name():
    return os.getenv("LLM_MODEL", "gemini-2.5-flash")
