"""
backend/engine/media_providers/xai_grok.py
Template adapter for xAI Grok Imagine Video (POST /v1/videos/generations).
"""
import os
import time
import requests
from typing import Optional
from sqlalchemy.orm import Session

from engine.media_providers.base import BaseMediaProvider, MediaGenerationResult


class XaiGrokProvider(BaseMediaProvider):
    """Handles xAI Grok Imagine Video generations."""

    def _get_api_key(self, tenant_id: Optional[str], db: Optional[Session]) -> Optional[str]:
        if db and tenant_id:
            try:
                from encryption_utils import decrypt_key
                from models import TenantLLM
                cfg = db.query(TenantLLM).filter(
                    TenantLLM.tenant_id == tenant_id,
                    TenantLLM.provider.in_(["grok", "xai"]),
                    TenantLLM.is_active == True
                ).first()
                if cfg and cfg.api_key_encrypted:
                    dec = decrypt_key(cfg.api_key_encrypted)
                    if dec:
                        return dec
            except Exception:
                pass
        return os.getenv("XAI_API_KEY") or os.getenv("GROK_API_KEY")

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
        """Generate an image using xAI Grok Imagine API: POST /v1/images/generations."""
        api_key = self._get_api_key(tenant_id, db)
        if not api_key:
            return None

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }

        full_prompt = prompt.strip()
        if style and style.strip():
            full_prompt += f", in {style.strip()} style"

        model = self.model_name if "grok" in self.model_name.lower() else "grok-imagine-image-2.0"
        payload = {
            "model": model,
            "prompt": full_prompt,
            "n": 1,
            "response_format": "b64_json"
        }

        try:
            url = "https://api.x.ai/v1/images/generations"
            resp = requests.post(url, json=payload, headers=headers, timeout=40)
            if resp.status_code in (200, 201):
                data = resp.json()
                items = data.get("data", [])
                if items:
                    item = items[0]
                    # Check b64_json
                    b64_val = item.get("b64_json")
                    if b64_val:
                        import base64
                        img_bytes = base64.b64decode(b64_val)
                        return MediaGenerationResult(
                            bytes_data=img_bytes,
                            media_format="png" if "png" in item.get("mime_type", "") else "jpeg",
                            provider_name=f"xAI Grok ({model})",
                            revised_prompt=item.get("revised_prompt") or full_prompt,
                            aspect_ratio=aspect_ratio,
                            resolution=size
                        )
                    # Check url fallback
                    img_url = item.get("url")
                    if img_url:
                        dl = requests.get(img_url, timeout=30)
                        if dl.status_code == 200:
                            return MediaGenerationResult(
                                bytes_data=dl.content,
                                media_format="png" if "png" in item.get("mime_type", "") else "jpeg",
                                provider_name=f"xAI Grok ({model})",
                                revised_prompt=item.get("revised_prompt") or full_prompt,
                                aspect_ratio=aspect_ratio,
                                resolution=size
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
        api_key = self._get_api_key(tenant_id, db)
        if not api_key:
            return None

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        model = self.model_name if "grok" in self.model_name.lower() else "grok-imagine-video-1.5"
        payload = {
            "model": model,
            "prompt": prompt.strip(),
            "duration": min(max(duration_seconds, 5), 15)
        }

        try:
            url = "https://api.x.ai/v1/videos/generations"
            resp = requests.post(url, json=payload, headers=headers, timeout=25)
            if resp.status_code in (200, 201, 202):
                data = resp.json()
                req_id = data.get("request_id") or data.get("id")
                if req_id:
                    check_url = f"https://api.x.ai/v1/videos/generations/{req_id}"
                    for _ in range(24):
                        time.sleep(5)
                        poll_resp = requests.get(check_url, headers=headers, timeout=15)
                        if poll_resp.status_code == 200:
                            p_data = poll_resp.json()
                            if p_data.get("status") == "completed":
                                v_url = p_data.get("video_url") or p_data.get("url")
                                if v_url:
                                    dl = requests.get(v_url, timeout=60)
                                    if dl.status_code == 200:
                                        return MediaGenerationResult(
                                            bytes_data=dl.content,
                                            media_format="mp4",
                                            provider_name=f"xAI Grok ({model})",
                                            revised_prompt=prompt,
                                            duration_seconds=duration_seconds,
                                            aspect_ratio=aspect_ratio
                                        )
                            elif p_data.get("status") in ("failed", "error"):
                                break
        except Exception:
            pass
        return None
