"""
backend/engine/media_providers/openai_dalle.py
Template adapter for OpenAI DALL-E (dall-e-3, dall-e-2) image generation.
"""
import os
import base64
import urllib.request
from typing import Optional
from sqlalchemy.orm import Session

from engine.media_providers.base import BaseMediaProvider, MediaGenerationResult


class OpenAiDalleProvider(BaseMediaProvider):
    """Handles OpenAI DALL-E image generation using the official OpenAI Images API."""

    def generate_image(
        self,
        prompt: str,
        aspect_ratio: str = "1:1",
        size: Optional[str] = None,
        style: Optional[str] = None,
        source_image_path: Optional[str] = None,
        tenant_id: Optional[str] = None,
        db: Optional[Session] = None
    ) -> Optional[MediaGenerationResult]:
        from llm_client import get_llm_client

        client = None
        try:
            client = get_llm_client(db=db, tenant_id=tenant_id, model_name=self.model_name)
        except Exception:
            try:
                client = get_llm_client(db=db, tenant_id=tenant_id)
            except Exception:
                pass

        if not client or not hasattr(client, "images"):
            return None

        full_prompt = prompt.strip()
        if style and style.strip():
            full_prompt += f", in {style.strip()} style"

        dalle_size = size or "1024x1024"
        if not size:
            if aspect_ratio == "16:9":
                dalle_size = "1792x1024"
            elif aspect_ratio == "9:16":
                dalle_size = "1024x1792"

        dalle_model = self.model_name if "dall-e" in self.model_name.lower() else "dall-e-3"

        try:
            img_resp = client.images.generate(
                model=dalle_model,
                prompt=full_prompt,
                size=dalle_size,
                quality="standard",
                response_format="b64_json",
                n=1
            )
            data_item = img_resp.data[0]
            image_bytes = None
            if hasattr(data_item, "b64_json") and data_item.b64_json:
                image_bytes = base64.b64decode(data_item.b64_json)
            elif hasattr(data_item, "url") and data_item.url:
                with urllib.request.urlopen(data_item.url, timeout=30) as resp:
                    image_bytes = resp.read()

            if image_bytes:
                revised = getattr(data_item, "revised_prompt", None) or full_prompt
                return MediaGenerationResult(
                    bytes_data=image_bytes,
                    media_format="png",
                    provider_name=f"OpenAI ({dalle_model})",
                    revised_prompt=revised,
                    aspect_ratio=aspect_ratio,
                    resolution=dalle_size
                )
        except Exception:
            pass
        return None

    def generate_video(
        self,
        prompt: str,
        duration_seconds: int = 5,
        aspect_ratio: str = "16:9",
        source_image_path: Optional[str] = None,
        tenant_id: Optional[str] = None,
        db: Optional[Session] = None
    ) -> Optional[MediaGenerationResult]:
        """OpenAI Sora API has been decommissioned; fallback to other video providers."""
        return None
