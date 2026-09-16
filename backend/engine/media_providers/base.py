"""
backend/engine/media_providers/base.py
Abstract base class and data structures for modular Image and Video generation providers.
"""
from abc import ABC, abstractmethod
from typing import Optional, Tuple
from dataclasses import dataclass
from sqlalchemy.orm import Session


@dataclass
class MediaGenerationResult:
    """Standardized output returned by any media generation provider."""
    bytes_data: bytes
    media_format: str          # "png", "jpeg", "svg", "mp4", etc.
    provider_name: str         # e.g., "Google Veo (veo-3.1-generate-preview)", "OpenRouter Video"
    revised_prompt: Optional[str] = None
    duration_seconds: Optional[int] = None
    aspect_ratio: Optional[str] = None
    resolution: Optional[str] = None


class BaseMediaProvider(ABC):
    """Abstract interface that all image & video generation provider templates must implement."""

    def __init__(self, model_name: str):
        self.model_name = model_name

    @abstractmethod
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
        """Generate an image or return None if this provider does not handle image generation."""
        pass

    @abstractmethod
    def generate_video(
        self,
        prompt: str,
        duration_seconds: int = 5,
        aspect_ratio: str = "16:9",
        source_image_path: Optional[str] = None,
        tenant_id: Optional[str] = None,
        db: Optional[Session] = None
    ) -> Optional[MediaGenerationResult]:
        """Generate a video clip (.mp4) or return None if this provider does not handle video."""
        pass
