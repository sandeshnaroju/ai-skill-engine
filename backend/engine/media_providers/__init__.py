"""
backend/engine/media_providers/__init__.py
Registry and factory router that selects the proper MediaProvider template
based on model identifier, tenant configurations, and available credentials.
"""
from typing import Optional, List
from sqlalchemy.orm import Session

from engine.media_providers.base import BaseMediaProvider, MediaGenerationResult
from engine.media_providers.gemini_google import GoogleGeminiVeoProvider
from engine.media_providers.openrouter import OpenRouterMediaProvider
from engine.media_providers.openai_dalle import OpenAiDalleProvider
from engine.media_providers.xai_grok import XaiGrokProvider
from engine.media_providers.fal_luma import FalLumaProvider
from engine.media_providers.gemini_google import GoogleGeminiVeoProvider
from engine.media_providers.openrouter import OpenRouterMediaProvider
from engine.media_providers.openai_dalle import OpenAiDalleProvider
from engine.media_providers.xai_grok import XaiGrokProvider
from engine.media_providers.fal_luma import FalLumaProvider


def resolve_media_provider(
    model_name: str,
    media_type: str = "video_gen",
    tenant=None,
    db: Optional[Session] = None
) -> Optional[BaseMediaProvider]:
    """
    Resolves the single provider requested by model name.
    Strictly NO fallbacks to alternative providers or synthetic generation.
    If the requested provider fails, it will fail directly.
    """
    m_lower = (model_name or "").lower().strip()

    # 1. OpenRouter (models with slash e.g. "google/veo-3.1" or "openrouter" in name)
    if "openrouter" in m_lower or ("/" in (model_name or "") and not m_lower.startswith("openai/")):
        return OpenRouterMediaProvider(model_name)

    # 2. Google Gemini / Veo native
    if any(k in m_lower for k in ("veo", "gemini", "google")):
        return GoogleGeminiVeoProvider(model_name)

    # 3. OpenAI DALL-E / Sora
    if any(k in m_lower for k in ("dall-e", "dalle", "openai", "sora")):
        return OpenAiDalleProvider(model_name)

    # 4. xAI Grok Imagine
    if any(k in m_lower for k in ("grok", "xai")):
        return XaiGrokProvider(model_name)

    # 5. Fal.ai / Luma / Kling
    if any(k in m_lower for k in ("luma", "fal", "hunyuan", "kling", "ray")):
        return FalLumaProvider(model_name)

    return None


def resolve_media_provider_chain(
    model_name: str,
    media_type: str = "video_gen",
    tenant=None,
    db: Optional[Session] = None
) -> List[BaseMediaProvider]:
    """Returns a list containing only the single requested provider (no fallbacks)."""
    prov = resolve_media_provider(model_name, media_type, tenant, db)
    return [prov] if prov else []
