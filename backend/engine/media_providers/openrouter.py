"""
backend/engine/media_providers/openrouter.py
Template adapter for OpenRouter dedicated Video API (POST /api/v1/videos) and Image Generation.
"""
import os
import time
import requests
from typing import Optional
from sqlalchemy.orm import Session

from engine.media_providers.base import BaseMediaProvider, MediaGenerationResult


class OpenRouterMediaProvider(BaseMediaProvider):
    """Handles video generation via OpenRouter's async Video API (POST /api/v1/videos) and image generation."""

    def _get_api_key(self, tenant_id: Optional[str], db: Optional[Session]) -> Optional[str]:
        if db and tenant_id:
            try:
                from encryption_utils import decrypt_key
                from models import TenantLLM
                cfg = db.query(TenantLLM).filter(
                    TenantLLM.tenant_id == tenant_id,
                    TenantLLM.provider.in_(["openrouter", "openai"]),
                    TenantLLM.is_active == True
                ).first()
                if cfg and cfg.api_key_encrypted:
                    dec = decrypt_key(cfg.api_key_encrypted)
                    if dec:
                        return dec
            except Exception:
                pass
        return os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENAI_API_KEY") or os.getenv("LLM_API_KEY")

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
        """Attempt image generation via OpenRouter or standard OpenAI Images endpoint."""
        api_key = self._get_api_key(tenant_id, db)
        if not api_key:
            return None

        full_prompt = prompt.strip()
        if style and style.strip():
            full_prompt += f", in {style.strip()} style"

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://ai-skill-engine.internal",
            "X-Title": "AI Skill Engine"
        }

        # OpenRouter dedicated Image Generation API: POST /api/v1/images
        try:
            url = "https://openrouter.ai/api/v1/images"
            payload = {
                "model": self.model_name,
                "prompt": full_prompt
            }
            if aspect_ratio and aspect_ratio in ("1:1", "16:9", "9:16", "4:3", "3:4"):
                payload["aspect_ratio"] = aspect_ratio
            if size:
                payload["resolution"] = size

            resp = requests.post(url, json=payload, headers=headers, timeout=45)
            if resp.status_code in (200, 201):
                data = resp.json()
                items = data.get("data", [])
                if items:
                    item = items[0]
                    # OpenRouter returns generated images in data[0].b64_json
                    b64_val = item.get("b64_json")
                    if b64_val:
                        import base64
                        img_bytes = base64.b64decode(b64_val)
                        return MediaGenerationResult(
                            bytes_data=img_bytes,
                            media_format="png",
                            provider_name=f"OpenRouter ({self.model_name})",
                            revised_prompt=full_prompt,
                            aspect_ratio=aspect_ratio,
                            resolution=size
                        )
                    # Fallback if returned as direct URL
                    img_url = item.get("url")
                    if img_url:
                        dl = requests.get(img_url, timeout=30)
                        if dl.status_code == 200:
                            return MediaGenerationResult(
                                bytes_data=dl.content,
                                media_format="png",
                                provider_name=f"OpenRouter ({self.model_name})",
                                revised_prompt=full_prompt,
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
        """
        Executes OpenRouter Video Generation per official specification:
        1. POST https://openrouter.ai/api/v1/videos
        2. Poll GET polling_url or https://openrouter.ai/api/v1/videos/{job_id} until completed
        3. Retrieve output from unsigned_urls or video_url and download MP4 bytes
        """
        api_key = self._get_api_key(tenant_id, db)
        if not api_key:
            return None

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://ai-skill-engine.internal",
            "X-Title": "AI Skill Engine"
        }

        model_name = self.model_name
        # Strip provider prefix if user selected e.g. openrouter/google/veo-3.1
        if model_name.startswith("openrouter/"):
            model_name = model_name[len("openrouter/"):]

        ratio = aspect_ratio if aspect_ratio in ("16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "21:9", "9:21") else "16:9"
        duration = 5 if duration_seconds in (5, "5") else 10

        payload = {
            "model": model_name,
            "prompt": prompt.strip(),
            "duration": duration,
            "aspect_ratio": ratio
        }

        if source_image_path:
            from engine.subagents import resolve_media_to_data_uri
            src_uri, _, _ = resolve_media_to_data_uri(source_image_path, tenant_id=tenant_id)
            if src_uri:
                payload["frame_images"] = [src_uri]

        try:
            # 1. Initiate video generation
            init_url = "https://openrouter.ai/api/v1/videos"
            resp = requests.post(init_url, json=payload, headers=headers, timeout=30)
            if resp.status_code in (200, 201, 202):
                data = resp.json()
                # OpenRouter returns job id and explicit polling_url
                job_id = data.get("id") or data.get("job_id") or data.get("request_id")
                poll_url = data.get("polling_url") or (f"https://openrouter.ai/api/v1/videos/{job_id}" if job_id else None)

                if poll_url:
                    # 2. Poll up to 120 seconds
                    for _ in range(24):
                        time.sleep(5)
                        poll_resp = requests.get(poll_url, headers=headers, timeout=15)
                        if poll_resp.status_code == 200:
                            p_data = poll_resp.json()
                            status = p_data.get("status", "").lower()
                            if status in ("completed", "succeeded", "done"):
                                # Check unsigned_urls (official OpenRouter schema) first, then fallback keys
                                unsigned_list = p_data.get("unsigned_urls") or []
                                video_url = None
                                if isinstance(unsigned_list, list) and len(unsigned_list) > 0:
                                    video_url = unsigned_list[0]
                                if not video_url:
                                    video_url = (
                                        p_data.get("video_url")
                                        or p_data.get("url")
                                        or (p_data.get("output", {}) if isinstance(p_data.get("output"), dict) else {}).get("url")
                                        or (p_data.get("assets", {}) if isinstance(p_data.get("assets"), dict) else {}).get("video")
                                    )
                                if video_url:
                                    dl = requests.get(video_url, timeout=60)
                                    if dl.status_code == 200 and len(dl.content) > 1000:
                                        return MediaGenerationResult(
                                            bytes_data=dl.content,
                                            media_format="mp4",
                                            provider_name=f"OpenRouter ({model_name})",
                                            revised_prompt=prompt,
                                            duration_seconds=duration,
                                            aspect_ratio=ratio
                                        )
                            elif status in ("failed", "error", "rejected"):
                                break
        except Exception:
            pass
        return None
