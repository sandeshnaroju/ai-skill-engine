"""
backend/engine/media_providers/fal_luma.py
Template adapter for Luma Dream Machine (Ray 2) and Fal.ai (HunyuanVideo / Kling).
"""
import os
import time
import requests
from typing import Optional
from sqlalchemy.orm import Session

from engine.media_providers.base import BaseMediaProvider, MediaGenerationResult


class FalLumaProvider(BaseMediaProvider):
    """Handles video generation via Luma Dream Machine API or Fal.ai queue endpoints."""

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
        ratio = aspect_ratio if aspect_ratio in ("16:9", "9:16", "1:1") else "16:9"

        # 1. Try Luma Dream Machine if LUMA_API_KEY is configured
        luma_api_key = os.getenv("LUMA_API_KEY")
        if luma_api_key:
            try:
                headers = {"Authorization": f"Bearer {luma_api_key}", "Content-Type": "application/json"}
                luma_payload = {
                    "prompt": prompt.strip(),
                    "aspect_ratio": ratio,
                    "loop": False
                }
                luma_init = requests.post("https://api.lumalabs.ai/v1/generations", json=luma_payload, headers=headers, timeout=20)
                if luma_init.status_code in (200, 201):
                    gen_id = luma_init.json().get("id")
                    if gen_id:
                        for _ in range(20):
                            time.sleep(5)
                            stat = requests.get(f"https://api.lumalabs.ai/v1/generations/{gen_id}", headers=headers, timeout=15)
                            if stat.status_code == 200:
                                s_data = stat.json()
                                if s_data.get("state") == "completed":
                                    video_url = s_data.get("assets", {}).get("video")
                                    if video_url:
                                        dl = requests.get(video_url, timeout=45)
                                        if dl.status_code == 200:
                                            return MediaGenerationResult(
                                                bytes_data=dl.content,
                                                media_format="mp4",
                                                provider_name="Luma Dream Machine (Ray 2)",
                                                revised_prompt=prompt,
                                                duration_seconds=duration_seconds,
                                                aspect_ratio=ratio
                                            )
                                elif s_data.get("state") == "failed":
                                    break
            except Exception:
                pass

        # 2. Try Fal.ai (HunyuanVideo) if FAL_KEY is configured
        fal_key = os.getenv("FAL_KEY")
        if fal_key:
            try:
                headers = {"Authorization": f"Key {fal_key}", "Content-Type": "application/json"}
                fal_endpoint = "https://queue.fal.run/fal-ai/hunyuan-video"
                fal_init = requests.post(fal_endpoint, json={"prompt": prompt.strip(), "aspect_ratio": ratio}, headers=headers, timeout=20)
                if fal_init.status_code in (200, 201, 202):
                    res_url = fal_init.json().get("response_url")
                    if res_url:
                        for _ in range(20):
                            time.sleep(5)
                            check = requests.get(res_url, headers=headers, timeout=15)
                            if check.status_code == 200:
                                check_data = check.json()
                                v_url = check_data.get("video", {}).get("url")
                                if v_url:
                                    dl = requests.get(v_url, timeout=45)
                                    if dl.status_code == 200:
                                        return MediaGenerationResult(
                                            bytes_data=dl.content,
                                            media_format="mp4",
                                            provider_name="Fal.ai HunyuanVideo",
                                            revised_prompt=prompt,
                                            duration_seconds=duration_seconds,
                                            aspect_ratio=ratio
                                        )
            except Exception:
                pass

        return None
