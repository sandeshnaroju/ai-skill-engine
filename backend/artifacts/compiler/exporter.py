"""
backend/artifacts/compiler/exporter.py
Central export dispatcher that handles format determination, compiler routing,
MIME type assignment, and raw code/text fallback.
"""
import re
from typing import Tuple

from models import SessionArtifact
from ..manager import assemble_full_content
from .utils import _fetch_image_bytes
from .docx import compile_to_docx
from .xlsx import compile_to_xlsx
from .pptx import compile_to_pptx
from .pdf import compile_to_pdf


def export_artifact(artifact: SessionArtifact, target_format: str = None) -> Tuple[bytes, str, str]:
    """
    Export artifact in requested format.
    Returns: (file_bytes, mime_type, filename)
    """
    ext = target_format or (artifact.filename.split(".")[-1] if "." in artifact.filename else "txt")
    ext = ext.lower().lstrip(".")
    base_name = artifact.filename.rsplit(".", 1)[0] if "." in artifact.filename else artifact.filename

    if ext == "docx" or (ext == "doc" and artifact.artifact_type == "document"):
        buf = compile_to_docx(artifact)
        return buf.read(), "application/vnd.openxmlformats-officedocument.wordprocessingml.document", f"{base_name}.docx"

    elif ext in ("xlsx", "xls") or (ext == "csv" and artifact.artifact_type == "spreadsheet"):
        if ext == "csv":
            content = assemble_full_content(artifact)
            return content.encode("utf-8"), "text/csv", f"{base_name}.csv"
        buf = compile_to_xlsx(artifact)
        return buf.read(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", f"{base_name}.xlsx"

    elif ext == "pptx" or artifact.artifact_type == "presentation":
        buf = compile_to_pptx(artifact)
        return buf.read(), "application/vnd.openxmlformats-officedocument.presentationml.presentation", f"{base_name}.pptx"

    elif ext == "pdf":
        buf = compile_to_pdf(artifact)
        return buf.read(), "application/pdf", f"{base_name}.pdf"

    elif ext in ("png", "jpg", "jpeg", "webp", "gif", "bmp") or getattr(artifact, "artifact_type", None) == "image":
        mime_map = {
            "png": "image/png",
            "jpg": "image/jpeg",
            "jpeg": "image/jpeg",
            "webp": "image/webp",
            "gif": "image/gif",
            "bmp": "image/bmp"
        }
        mime = mime_map.get(ext, "image/png")
        img_bytes = None
        if getattr(artifact, "media_url", None):
            img_bytes = _fetch_image_bytes(artifact.media_url)
        if not img_bytes and getattr(artifact, "filename", None):
            img_bytes = _fetch_image_bytes(artifact.filename)
        if not img_bytes:
            full_text = assemble_full_content(artifact)
            match = re.search(r'(data:image/[a-zA-Z]+;base64,[A-Za-z0-9+/=]+)', full_text)
            if match:
                img_bytes = _fetch_image_bytes(match.group(1))
            else:
                img_match = re.search(r'!\[.*?\]\((.*?)\)', full_text)
                if img_match:
                    img_bytes = _fetch_image_bytes(img_match.group(1))

        if img_bytes:
            out_name = f"{base_name}.{ext}" if not artifact.filename.endswith(f".{ext}") else artifact.filename
            return img_bytes, mime, out_name

    # Default: raw text/code
    full_text = assemble_full_content(artifact)
    mime = "text/plain"
    if ext == "py":
        mime = "text/x-python"
    elif ext in ("js", "ts"):
        mime = "application/javascript"
    elif ext == "json":
        mime = "application/json"
    elif ext == "svg":
        mime = "image/svg+xml"
    elif ext == "html":
        mime = "text/html"
    elif ext == "dxf":
        mime = "image/vnd.dxf"
    elif ext == "dwg":
        mime = "image/vnd.dwg"
    elif ext in ("step", "stp"):
        mime = "model/step"
    elif ext in ("iges", "igs"):
        mime = "model/iges"
    elif ext == "stl":
        mime = "model/stl"
    elif ext == "obj":
        mime = "model/obj"
    elif ext in ("gltf", "glb"):
        mime = "model/gltf+json" if ext == "gltf" else "model/gltf-binary"
    elif ext == "ifc":
        mime = "application/x-step"
    elif ext == "geojson":
        mime = "application/geo+json"
    elif ext in ("kml", "kmz"):
        mime = "application/vnd.google-earth.kml+xml" if ext == "kml" else "application/vnd.google-earth.kmz"
    elif ext == "vsdx":
        mime = "application/vnd.visio"
    elif ext in ("l5x", "l5k"):
        mime = "application/xml"
    elif ext == "m":
        mime = "text/x-matlab"
    elif ext == "xer":
        mime = "text/plain"

    out_name = f"{base_name}.{ext}" if not artifact.filename.endswith(f".{ext}") else artifact.filename
    return full_text.encode("utf-8"), mime, out_name
