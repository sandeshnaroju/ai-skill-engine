"""
backend/engine/media_providers/synthesizer.py
Offline Fallback Synthesizer Template for Image (SVG) and Video (H.264 MP4).
Ensures the interactive Canvas workspace never displays broken links or empty errors.
"""
import os
import subprocess
import tempfile
from typing import Optional
from sqlalchemy.orm import Session

from engine.media_providers.base import BaseMediaProvider, MediaGenerationResult


class SynthesizerFallbackProvider(BaseMediaProvider):
    """Generates valid, renderable SVG images or ffmpeg H.264 video clips as a bulletproof fallback."""

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
        clean = (prompt or "Generated Illustration").strip()[:70]
        target_size = size or "1024x1024"
        svg_code = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="50%" stop-color="#1e1b4b" />
      <stop offset="100%" stop-color="#311042" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)" rx="16" />
  <circle cx="512" cy="400" r="160" fill="#38bdf8" opacity="0.15" />
  <text x="512" y="380" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="28" font-weight="bold" fill="#38bdf8" text-anchor="middle">Generated Media</text>
  <text x="512" y="420" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="16" fill="#94a3b8" text-anchor="middle">{clean}</text>
  <rect x="212" y="520" width="600" height="120" rx="8" fill="#1e293b" stroke="#475569" stroke-width="1.5" />
  <text x="512" y="565" font-family="monospace" font-size="14" fill="#a5b4fc" text-anchor="middle">Model: {self.model_name}</text>
  <text x="512" y="600" font-family="monospace" font-size="13" fill="#cbd5e1" text-anchor="middle">{target_size} | {style or "standard"}</text>
</svg>'''
        return MediaGenerationResult(
            bytes_data=svg_code.encode("utf-8"),
            media_format="svg",
            provider_name="Synthesized Illustration",
            revised_prompt=prompt,
            aspect_ratio=aspect_ratio,
            resolution=target_size
        )

    def generate_video(
        self,
        prompt: str,
        duration_seconds: int = 5,
        aspect_ratio: str = "16:9",
        source_image_path: Optional[str] = None,
        tenant_id: Optional[str] = None,
        db: Optional[Session] = None
    ) -> Optional[MediaGenerationResult]:
        duration = 10 if duration_seconds in (10, "10") else 5
        ratio = aspect_ratio if aspect_ratio in ("16:9", "9:16", "1:1") else "16:9"

        # Synthesize a valid MP4 using ffmpeg H.264
        try:
            with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp_mp4:
                tmp_mp4_path = tmp_mp4.name

            cmd = [
                "ffmpeg", "-y",
                "-f", "lavfi",
                "-i", f"color=c=0x0f172a:s=1280x720:d={duration}:r=30",
                "-vf", f"fade=t=in:st=0:d=1,fade=t=out:st={max(1, duration-1)}:d=1",
                "-c:v", "libx264",
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
                tmp_mp4_path
            ]
            proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
            if proc.returncode == 0 and os.path.exists(tmp_mp4_path) and os.path.getsize(tmp_mp4_path) > 1000:
                with open(tmp_mp4_path, "rb") as vf:
                    video_bytes = vf.read()
                try:
                    os.unlink(tmp_mp4_path)
                except Exception:
                    pass
                return MediaGenerationResult(
                    bytes_data=video_bytes,
                    media_format="mp4",
                    provider_name="Synthesized Cinematic Video Clip",
                    revised_prompt=prompt,
                    duration_seconds=duration,
                    aspect_ratio=ratio
                )
        except Exception:
            pass

        # If ffmpeg is not available, package an animated SVG-based media file as fallback
        clean = (prompt or "Cinematic Video Scene")[:60]
        svg_clip = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#020617"/>
      <stop offset="50%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e1b4b"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <circle cx="640" cy="320" r="140" fill="#38bdf8" opacity="0.1">
    <animate attributeName="r" values="120;150;120" dur="4s" repeatCount="indefinite"/>
  </circle>
  <text x="640" y="310" font-family="-apple-system, sans-serif" font-size="32" font-weight="bold" fill="#38bdf8" text-anchor="middle">🎬 Generated Video Clip</text>
  <text x="640" y="360" font-family="-apple-system, sans-serif" font-size="18" fill="#94a3b8" text-anchor="middle">{clean}</text>
  <text x="640" y="440" font-family="monospace" font-size="15" fill="#a5b4fc" text-anchor="middle">{duration}s | {ratio} | Model: {self.model_name}</text>
</svg>'''
        return MediaGenerationResult(
            bytes_data=svg_clip.encode("utf-8"),
            media_format="svg",
            provider_name="Synthesized Cinematic Video Clip",
            revised_prompt=prompt,
            duration_seconds=duration,
            aspect_ratio=ratio
        )
