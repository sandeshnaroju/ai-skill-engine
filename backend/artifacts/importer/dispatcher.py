"""
backend/artifacts/importer/dispatcher.py
Main entry point for file import: reads uploaded files, determines formats,
delegates to domain parsers, and packages results into standard artifact dictionary structures.
"""
import os
import re
from typing import Dict, Any, List, Optional

from .type_inference import infer_artifact_type, infer_code_language
from .documents import _parse_docx, _parse_html_doc, _parse_pdf
from .spreadsheets import _parse_spreadsheet
from .presentations import _parse_pptx
from .cad import _parse_cad_2d, _parse_cad_3d
from .engineering import _parse_gis, _parse_engineering_data, _parse_diagram
from .pcb import _parse_pcb_file, parse_eda_file
from .bcf import parse_bcf_archive
from .pointcloud import parse_point_cloud
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
        media_url = f"/api/v1/files/download/{filename}"

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
    # 5a. IFC BIM 3D Models (.ifc) — streamed to web-ifc WASM via media_url
    # ─────────────────────────────────────────────────────────────────────────
    elif ext == ".ifc":
        artifact_type = "ifc_bim"
        media_url = f"/api/v1/files/download/{filename}"
        schema = "IFC"
        try:
            with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                head = f.read(4096)
                m = re.search(r"FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'", head)
                if m:
                    schema = m.group(1)
        except Exception:
            pass
        import json as _json
        content = _json.dumps({"format": "ifc_bim", "filename": display_filename, "schema": schema})
        blocks = [{
            "block_key": "ifc_summary",
            "title": f"IFC BIM Model: {display_filename} ({schema})",
            "content": content,
            "order_index": 0,
        }]

    # ─────────────────────────────────────────────────────────────────────────
    # 5. 3D Models (.step, .stp, .stl, .obj, .iges, .igs, .glb, .gltf)
    # ─────────────────────────────────────────────────────────────────────────
    elif ext in (".step", ".stp", ".stl", ".obj", ".iges", ".igs", ".glb", ".gltf"):
        artifact_type = "cad_3d"
        content, blocks = _parse_cad_3d(filepath, display_filename, ext)

    # ─────────────────────────────────────────────────────────────────────────
    # 5b. Point Clouds & Reality Capture (.ply, .las, .laz)
    # ─────────────────────────────────────────────────────────────────────────
    elif ext in (".ply", ".las", ".laz"):
        artifact_type = "point_cloud"
        content, media_url, blocks = parse_point_cloud(filepath, display_filename, filename, ext)

    # ─────────────────────────────────────────────────────────────────────────
    # 6. Geospatial Maps (.geojson, .kml, .kmz, .shp)
    # ─────────────────────────────────────────────────────────────────────────
    elif ext in (".geojson", ".kml", ".kmz", ".shp"):
        artifact_type = "gis"
        content, blocks = _parse_gis(filepath, display_filename, ext)

    # ─────────────────────────────────────────────────────────────────────────
    # 6b. Electronic Circuits & PCB Layouts (.pcb.json, .kicad_pcb, .eda, .eda.json, .easyeda, .gbr, .gerber, .drl, .dsn)
    # ─────────────────────────────────────────────────────────────────────────
    elif ext in (".pcb.json", ".kicad_pcb", ".eda", ".easyeda", ".gbr", ".gerber", ".gtl", ".gbl", ".gts", ".gbs", ".gto", ".gbo", ".gko", ".drl", ".dsn") or display_filename.endswith((".pcb.json", ".eda.json", ".easyeda.json")):
        artifact_type = "pcb"
        if ext in (".eda", ".easyeda") or display_filename.endswith((".eda.json", ".easyeda.json")):
            try:
                with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                    raw_txt = f.read()
                res = parse_eda_file(filepath, raw_txt)
                content = res.get("content", "")
                blocks = res.get("blocks", [])
            except Exception:
                content, blocks = _parse_pcb_file(filepath, display_filename, ext)
        else:
            content, blocks = _parse_pcb_file(filepath, display_filename, ext)

    # ─────────────────────────────────────────────────────────────────────────
    # 7. BIM Collaboration Format (.bcf, .bcfzip)
    # ─────────────────────────────────────────────────────────────────────────
    elif ext in (".bcf", ".bcfzip"):
        artifact_type = "bcf"
        content, blocks = parse_bcf_archive(filepath, display_filename)
        media_url = f"/api/v1/files/download/{filename}"

    # ─────────────────────────────────────────────────────────────────────────
    # 7b. Piping Isometrics (.pcf, .idf)
    # ─────────────────────────────────────────────────────────────────────────
    elif ext in (".pcf", ".idf"):
        artifact_type = "piping_iso"
        language = "text"
        content, blocks = _parse_code_file(filepath, display_filename, language)

    # ─────────────────────────────────────────────────────────────────────────
    # 7c. Industrial / Logic / Engineering (.l5x, .l5k, .xer, .s7p, .m, .slx)
    # ─────────────────────────────────────────────────────────────────────────
    elif ext in (".l5x", ".l5k", ".xer", ".s7p", ".m", ".slx"):
        artifact_type = "engineering_data"
        content, blocks = _parse_engineering_data(filepath, display_filename, ext)

    # ─────────────────────────────────────────────────────────────────────────
    # 8. Vector Graphics & Diagrams (.svg, .vsdx, .vsd)
    # ─────────────────────────────────────────────────────────────────────────
    elif ext in (".svg", ".vsdx", ".vsd"):
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

        # Auto-detect Microsoft Project XML schedules (.xml containing <Project and <Tasks>)
        if ext == ".xml" and artifact_type in ("code", "xer"):
            head_sample = content[:8000]
            if "<Project" in head_sample and ("<Tasks" in head_sample or "schemas.microsoft.com/project" in head_sample):
                artifact_type = "xer"

        # Auto-detect DEXPI P&ID Proteus XML (1.x <PlantModel> or 2.0 <Model>)
        if ext == ".xml" and artifact_type in ("code", "dexpi"):
            head_sample = content[:12000]
            is_dexpi_v1 = "<PlantModel" in head_sample and (
                "Proteus" in head_sample
                or "DEXPI" in head_sample
                or "<PipingNetworkSystem" in head_sample
                or "<Equipment" in head_sample
                or "<ShapeCatalogue" in head_sample
            )
            is_dexpi_v2 = "<Model" in head_sample and (
                "dexpi.org" in head_sample
                or "Plant/PlantModel" in head_sample
                or "Core/EngineeringModel" in head_sample
            )
            if is_dexpi_v1 or is_dexpi_v2:
                artifact_type = "dexpi"

        # Auto-detect LandXML Civil & Earthworks (.xml containing <LandXML)
        if ext == ".xml" and artifact_type in ("code", "landxml"):
            head_sample = content[:12000]
            if "<LandXML" in head_sample:
                artifact_type = "landxml"

        # Auto-detect Smart P&ID JSON files and link companion uploaded image if present (even if explicit_type was 'pcb')
        if ext == ".json" and artifact_type in ("code", "pandid", "pcb", "diagram", "document"):
            if (
                ('"pandid_no"' in content or '"document_no"' in content)
                and ('"symbols"' in content or '"line_numbers"' in content)
            ):
                artifact_type = "pandid"
                try:
                    import json as _json
                    pid_obj = _json.loads(content)
                    if isinstance(pid_obj, dict):
                        media_url = pid_obj.get("image_url") or pid_obj.get("image_data_uri") or pid_obj.get("image")
                except Exception:
                    pass
                if not media_url:
                    parent_dir = os.path.dirname(filepath)
                    stem = re.sub(r'\.(pandid|pid)$', '', os.path.splitext(display_filename)[0], flags=re.IGNORECASE)
                    img_exts = (".jpg", ".jpeg", ".png", ".webp", ".bmp")
                    if os.path.isdir(parent_dir):
                        candidates = [
                            f for f in os.listdir(parent_dir)
                            if f.lower().endswith(img_exts)
                        ]
                        # 1. Exact stem match (e.g. img3.json -> img3.jpg)
                        matched = next((f for f in candidates if os.path.splitext(f)[0].lower() == stem.lower()), None)
                        # 2. Numeric suffix fallback (e.g. img1.json -> img.jpg)
                        if not matched:
                            base_stem = re.sub(r'\d+$', '', stem)
                            matched = next((f for f in candidates if os.path.splitext(f)[0].lower() == base_stem.lower()), None)
                        # 3. Most recently uploaded image in the same folder
                        if not matched and candidates:
                            candidates.sort(key=lambda f: os.path.getmtime(os.path.join(parent_dir, f)), reverse=True)
                            matched = candidates[0]
                        if matched:
                            media_url = f"/api/v1/files/download/{matched}"

    return {
        "title": effective_title,
        "filename": display_filename,
        "artifact_type": artifact_type,
        "content": content,
        "language": language,
        "media_url": media_url,
        "blocks": blocks
    }
