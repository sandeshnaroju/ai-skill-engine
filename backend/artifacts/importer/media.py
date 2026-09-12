"""
backend/artifacts/importer/media.py
Parses raster image files (.png, .jpg, .jpeg, .webp, .gif, .bmp) into an image artifact.
Extracts image dimensions and metadata using PIL, constructs a media URL and a preview block.
"""
import os
from typing import Tuple, List, Dict, Any


def _parse_image_file(filepath: str, filename: str, display_filename: str) -> Tuple[str, str, List[Dict[str, Any]]]:
    """
    Parses raster image files (.png, .jpg, .jpeg, .webp, .gif, .bmp) into an image artifact.
    Extracts image dimensions and metadata using PIL, constructs a media URL and a preview block.
    """
    media_url = f"/api/v1/files/download/{filename}"
    img_format = "Image"
    width, height = None, None
    file_size_str = ""

    try:
        size_bytes = os.path.getsize(filepath)
        if size_bytes < 1024:
            file_size_str = f"{size_bytes} B"
        elif size_bytes < 1024 * 1024:
            file_size_str = f"{size_bytes / 1024:.1f} KB"
        else:
            file_size_str = f"{size_bytes / (1024 * 1024):.2f} MB"
    except Exception:
        pass

    try:
        from PIL import Image as PILImage
        with PILImage.open(filepath) as img:
            width, height = img.size
            img_format = img.format or "Image"
    except Exception:
        pass

    dim_info = f"**Dimensions:** {width} × {height} px" if width and height else ""
    meta_parts = [p for p in [dim_info, f"**Format:** {img_format}", f"**File Size:** {file_size_str}" if file_size_str else ""] if p]
    meta_line = " | ".join(meta_parts)

    content = f"![{display_filename}]({media_url})"
    if meta_line:
        content += f"\n\n{meta_line}"

    blocks = [{
        "block_key": "media_image",
        "title": f"Image: {display_filename}",
        "content": content,
        "order_index": 0
    }]
    return content, media_url, blocks
