"""
backend/artifacts/importer/dispatcher.py
Main entry point for file import: reads uploaded files, determines formats,
delegates to domain parsers, and packages results into standard artifact dictionary structures.
"""
import os
from typing import Dict, Any, List, Optional

from .type_inference import infer_artifact_type, infer_code_language
from .documents import _parse_docx, _parse_html_doc, _parse_pdf
from .spreadsheets import _parse_spreadsheet
from .presentations import _parse_pptx
from .cad import _parse_cad_2d, _parse_cad_3d
from .engineering import _parse_gis, _parse_engineering_data, _parse_diagram
from .code import _parse_code_file
from .media import _parse_image_file


def import_file_to_artifact_data(filepath: str, title: Optional[str] = None, explicit_type: Optional[str] = None) -> Dict[str, Any]:
    """
    Reads an uploaded file from disk and converts it into standard artifact fields:
    Returns dict:
      {
        "title": str,
        "filename": str,
        "artifact_type": str,
        "content": str,
        "language": Optional[str],
        "media_url": Optional[str],
        "blocks": List[Dict]
      }
    """
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"File not found at path: {filepath}")

    filename = os.path.basename(filepath)
    # Remove leading UUID hex prefix if present (e.g. "a1b2c3d4e5f6_report.docx" -> "report.docx")
    display_filename = filename
    if "_" in filename:
        parts = filename.split("_", 1)
        if len(parts[0]) >= 32:
            display_filename = parts[1]

    ext = os.path.splitext(display_filename)[1].lower()
    base_name = os.path.splitext(display_filename)[0].replace("_", " ").replace("-", " ").title()
    effective_title = title or base_name or "Uploaded File"

    # Infer artifact_type if not explicitly supplied
    artifact_type = explicit_type
    if not artifact_type:
        artifact_type = infer_artifact_type(display_filename)

    content = ""
    language = None
    media_url = None
    blocks: List[Dict[str, Any]] = []

    # ─────────────────────────────────────────────────────────────────────────
    # 1. Documents: Word (.docx, .doc), PDF (.pdf), Markdown & Text (.md, .txt)
    # ─────────────────────────────────────────────────────────────────────────
    if ext in (".docx", ".doc"):
        artifact_type = "document"
        content, blocks = _parse_docx(filepath, effective_title)

    elif ext == ".pdf":
        artifact_type = "pdf"
        content, blocks = _parse_pdf(filepath, effective_title)

    elif ext in (".md", ".markdown", ".txt", ".text", ".rst", ".html", ".htm"):
        artifact_type = "document"
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
        language = "html" if ext in (".html", ".htm") else ("markdown" if ext in (".md", ".markdown") else "text")
        if ext in (".html", ".htm"):
            content, blocks = _parse_html_doc(content, effective_title)

    # ─────────────────────────────────────────────────────────────────────────
    # 2. Spreadsheets: Excel (.xlsx, .xls), CSV (.csv), TSV (.tsv)
    # ─────────────────────────────────────────────────────────────────────────
    elif ext in (".xlsx", ".xls", ".csv", ".tsv"):
        artifact_type = "spreadsheet"
        content, blocks = _parse_spreadsheet(filepath, ext)

    # ─────────────────────────────────────────────────────────────────────────
    # 3. Presentations: PowerPoint (.pptx, .ppt)
    # ─────────────────────────────────────────────────────────────────────────
    elif ext in (".pptx", ".ppt"):
        artifact_type = "presentation"
        content, blocks = _parse_pptx(filepath, effective_title)

    # ─────────────────────────────────────────────────────────────────────────
    # 4. 2D CAD Drawings (.dxf, .dwg)
    # ─────────────────────────────────────────────────────────────────────────
    elif ext in (".dxf", ".dwg"):
        artifact_type = "cad_2d"
        content, blocks = _parse_cad_2d(filepath, display_filename, ext)

    # ─────────────────────────────────────────────────────────────────────────
    # 5. 3D Models (.step, .stp, .stl, .obj, .iges, .igs, .ifc, .glb, .gltf)
    # ─────────────────────────────────────────────────────────────────────────
    elif ext in (".step", ".stp", ".stl", ".obj", ".iges", ".igs", ".ifc", ".glb", ".gltf"):
        artifact_type = "cad_3d"
        content, blocks = _parse_cad_3d(filepath, display_filename, ext)

    # ─────────────────────────────────────────────────────────────────────────
    # 6. Geospatial Maps (.geojson, .kml, .kmz, .shp)
    # ─────────────────────────────────────────────────────────────────────────
    elif ext in (".geojson", ".kml", ".kmz", ".shp"):
        artifact_type = "gis"
        content, blocks = _parse_gis(filepath, display_filename, ext)

    # ─────────────────────────────────────────────────────────────────────────
    # 7. Industrial / Logic / Engineering (.l5x, .l5k, .xer, .s7p, .m, .slx)
    # ─────────────────────────────────────────────────────────────────────────
    elif ext in (".l5x", ".l5k", ".xer", ".s7p", ".m", ".slx"):
        artifact_type = "engineering_data"
        content, blocks = _parse_engineering_data(filepath, display_filename, ext)

    # ─────────────────────────────────────────────────────────────────────────
    # 8. Vector Graphics & Diagrams (.svg, .vsdx)
    # ─────────────────────────────────────────────────────────────────────────
    elif ext in (".svg", ".vsdx"):
        artifact_type = "svg" if ext == ".svg" else "diagram"
        content, blocks = _parse_diagram(filepath, display_filename, ext)

    # ─────────────────────────────────────────────────────────────────────────
    # 9. Audio / Video Media & Raster Images
    # ─────────────────────────────────────────────────────────────────────────
    elif ext in (".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff"):
        artifact_type = "image"
        content, media_url, blocks = _parse_image_file(filepath, filename, display_filename)

    elif ext in (".mp3", ".wav", ".ogg", ".m4a", ".aac"):
        artifact_type = "audio"
        content = f"[Audio File: {display_filename}]"
        media_url = f"/api/v1/files/download/{filename}"
        blocks = [{
            "block_key": "media_audio",
            "title": f"Audio Player: {display_filename}",
            "content": content,
            "order_index": 0
        }]

    elif ext in (".mp4", ".webm", ".mov", ".mkv"):
        artifact_type = "video"
        content = f"[Video File: {display_filename}]"
        media_url = f"/api/v1/files/download/{filename}"
        blocks = [{
            "block_key": "media_video",
            "title": f"Video Player: {display_filename}",
            "content": content,
            "order_index": 0
        }]

    # ─────────────────────────────────────────────────────────────────────────
    # 10. Code & Markup (.py, .js, .ts, .html, .css, .json, .sql, .sh, etc.)
    # ─────────────────────────────────────────────────────────────────────────
    else:
        artifact_type = "code" if not artifact_type or artifact_type == "document" else artifact_type
        language = infer_code_language(display_filename)
        content, blocks = _parse_code_file(filepath, display_filename, language)

    return {
        "title": effective_title,
        "filename": display_filename,
        "artifact_type": artifact_type,
        "content": content,
        "language": language,
        "media_url": media_url,
        "blocks": blocks
    }
