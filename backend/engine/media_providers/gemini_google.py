"""
backend/engine/media_providers/gemini_google.py
Template adapter for Google Gemini Flash Image and Google Veo (Veo 2 / Veo 3.1) video generation.
"""
import os
import time
import base64
import requests
from typing import Optional
from sqlalchemy.orm import Session

from engine.media_providers.base import BaseMediaProvider, MediaGenerationResult


class GoogleGeminiVeoProvider(BaseMediaProvider):
    """Handles image generation via Gemini Flash Image and video generation via Veo Long-Running Operations (LRO)."""

    def _get_api_key(self, tenant_id: Optional[str], db: Optional[Session]) -> Optional[str]:
        if db and tenant_id:
            try:
                from encryption_utils import decrypt_key
                from models import TenantLLM
                gem_cfg = db.query(TenantLLM).filter(
                    TenantLLM.tenant_id == tenant_id,
                    TenantLLM.provider == "gemini",
                    TenantLLM.is_active == True
                ).first()
                if gem_cfg and gem_cfg.api_key_encrypted:
                    dec = decrypt_key(gem_cfg.api_key_encrypted)
                    if dec:
                        return dec
            except Exception:
                pass
        return os.getenv("GEMINI_API_KEY") or os.getenv("LLM_API_KEY")

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
        gemini_api_key = self._get_api_key(tenant_id, db)
        if not gemini_api_key:
            return None

        # Build prompt with style hints
        full_prompt = prompt.strip()
        if style and style.strip():
            full_prompt += f", in {style.strip()} style"
        if aspect_ratio and aspect_ratio.strip():
            full_prompt += f", aspect ratio {aspect_ratio.strip()}"

        model_name = self.model_name
        if "gemini" not in model_name.lower():
            model_name = "gemini-3.1-flash-image"

        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={gemini_api_key}"
            req_parts = [{"text": full_prompt}]

            if source_image_path:
                from engine.subagents import resolve_media_to_data_uri
                src_uri, src_mime, _ = resolve_media_to_data_uri(source_image_path, tenant_id=tenant_id)
                if src_uri:
                    raw_b64 = src_uri.split(",", 1)[-1].strip()
                    req_parts.append({
                        "inlineData": {
                            "mimeType": src_mime or "image/jpeg",
                            "data": raw_b64
                        }
                    })

            payload = {
                "contents": [{"parts": req_parts}],
                "generationConfig": {
                    "responseModalities": ["TEXT", "IMAGE"]
                }
            }

            resp = requests.post(url, json=payload, timeout=60)
            if resp.status_code == 200:
                data = resp.json()
                parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
                for p in parts:
                    if "inlineData" in p and p["inlineData"].get("data"):
                        image_bytes = base64.b64decode(p["inlineData"]["data"])
                        mime = p["inlineData"].get("mimeType", "image/png")
                        fmt = "png" if "png" in mime else "jpeg"
                        return MediaGenerationResult(
                            bytes_data=image_bytes,
                            media_format=fmt,
                            provider_name=f"Google Gemini ({model_name})",
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
        gemini_api_key = self._get_api_key(tenant_id, db)
        if not gemini_api_key:
            return None

        veo_model = self.model_name
        if "/" in veo_model:
            veo_model = veo_model.split("/")[-1]
        if "veo" not in veo_model.lower():
            veo_model = "veo-3.1-fast-generate-preview"
        elif "veo-3" in veo_model.lower():
            veo_model = "veo-3.1-fast-generate-preview"
        elif "veo-2" in veo_model.lower() or veo_model == "veo-2.0-generate-001":
            veo_model = "veo-2.0-generate-001"

        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{veo_model}:predictLongRunning?key={gemini_api_key}"
            instance_obj = {"prompt": prompt.strip()}

            if source_image_path:
                from engine.subagents import resolve_media_to_data_uri
                src_uri, src_mime, _ = resolve_media_to_data_uri(source_image_path, tenant_id=tenant_id)
                if src_uri:
                    instance_obj["image"] = {
                        "bytesBase64Encoded": src_uri.split(",", 1)[-1].strip(),
                        "mimeType": src_mime or "image/jpeg"
                    }

            veo_duration = 6 if duration_seconds in (5, 6, 10) else 4
            ratio = aspect_ratio if aspect_ratio in ("16:9", "9:16", "1:1") else "16:9"
            req_payload = {
                "instances": [instance_obj],
                "parameters": {
                    "aspectRatio": ratio,
                    "durationSeconds": veo_duration
                }
            }

            init_resp = requests.post(url, json=req_payload, timeout=30)
            if init_resp.status_code in (200, 202):
                init_data = init_resp.json()
                op_name = init_data.get("name")
                if op_name:
                    poll_url = f"https://generativelanguage.googleapis.com/v1beta/{op_name}?key={gemini_api_key}"
                    for _ in range(36):
                        time.sleep(5)
                        poll_resp = requests.get(poll_url, timeout=15)
                        if poll_resp.status_code == 200:
                            poll_data = poll_resp.json()
                            if poll_data.get("done"):
                                if "error" in poll_data:
                                    import logging
                                    logging.getLogger("google_veo").warning(f"Veo operation error: {poll_data['error']}")
                                    break
                                res = poll_data.get("response", {})
                                video_b64 = None
                                if "video" in res and "bytesBase64Encoded" in res["video"]:
                                    video_b64 = res["video"]["bytesBase64Encoded"]
                                elif "generateVideoResponse" in res:
                                    samples = res["generateVideoResponse"].get("generatedSamples", [])
                                    if samples and "video" in samples[0]:
                                        video_b64 = samples[0]["video"].get("bytesBase64Encoded")
                                        if not video_b64 and "uri" in samples[0]["video"]:
                                            dl_uri = samples[0]["video"]["uri"]
                                            sep = "&" if "?" in dl_uri else "?"
                                            auth_dl_url = f"{dl_uri}{sep}key={gemini_api_key}"
                                            dl = requests.get(auth_dl_url, headers={"x-goog-api-key": gemini_api_key}, timeout=60)
                                            if dl.status_code == 200 and len(dl.content) > 1000:
                                                return MediaGenerationResult(
                                                    bytes_data=dl.content,
                                                    media_format="mp4",
                                                    provider_name=f"Google Veo ({veo_model})",
                                                    revised_prompt=prompt,
                                                    duration_seconds=veo_duration,
                                                    aspect_ratio=ratio
                                                )
                                if video_b64:
                                    return MediaGenerationResult(
                                        bytes_data=base64.b64decode(video_b64),
                                        media_format="mp4",
                                        provider_name=f"Google Veo ({veo_model})",
                                        revised_prompt=prompt,
                                        duration_seconds=veo_duration,
                                        aspect_ratio=ratio
                                    )
                                break
        except Exception:
            pass
        return None
