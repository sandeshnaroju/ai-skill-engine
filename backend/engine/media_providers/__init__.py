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
from engine.media_providers.synthesizer import SynthesizerFallbackProvider


def resolve_media_provider_chain(
    model_name: str,
    media_type: str = "video_gen",
    tenant=None,
    db: Optional[Session] = None
) -> List[BaseMediaProvider]:
    """
    Returns an ordered list of providers to try for a media generation request.
    The primary provider is chosen by model name and configuration, followed
    by applicable secondary providers, ending with the offline Synthesizer fallback.
    """
    m_lower = (model_name or "").lower()
    chain: List[BaseMediaProvider] = []

    # 1. OpenRouter (if model has slash e.g. "google/veo-3.1" or "openrouter" in name)
    if "openrouter" in m_lower or ("/" in (model_name or "") and not m_lower.startswith("openai/")):
        chain.append(OpenRouterMediaProvider(model_name))

    # 2. Google Gemini / Veo
    if any(k in m_lower for k in ("veo", "gemini", "google")):
        chain.append(GoogleGeminiVeoProvider(model_name))

    # 3. OpenAI DALL-E
    if any(k in m_lower for k in ("dall-e", "dalle", "openai")):
        chain.append(OpenAiDalleProvider(model_name))

    # 4. xAI Grok Imagine
    if any(k in m_lower for k in ("grok", "xai")):
        chain.append(XaiGrokProvider(model_name))

    # 5. Fal.ai / Luma
    if any(k in m_lower for k in ("luma", "fal", "hunyuan", "kling", "ray")):
        chain.append(FalLumaProvider(model_name))

    # Add general providers ONLY if tenant has them explicitly configured or model implies them
    if not chain:
        chain.append(SynthesizerFallbackProvider(model_name))
    else:
        # Final guaranteed fallback at end of chain
        chain.append(SynthesizerFallbackProvider(model_name))

    return chain
