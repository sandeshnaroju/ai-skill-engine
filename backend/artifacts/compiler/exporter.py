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
from .pcb import (
    compile_to_gerber_zip,
    compile_to_kicad_pcb,
    compile_to_bom_csv,
    compile_to_centroid_csv,
    export_to_eda_pcb,
    export_to_spice_netlist,
    run_circuit_simulation,
)
import json


def export_artifact(artifact: SessionArtifact, target_format: str = None) -> Tuple[bytes, str, str]:
    """
    Export artifact in requested format.
    Returns: (file_bytes, mime_type, filename)
    """
    ext = target_format or (artifact.filename.split(".")[-1] if "." in artifact.filename else "txt")
    ext = ext.lower().lstrip(".")
    base_name = artifact.filename.rsplit(".", 1)[0] if "." in artifact.filename else artifact.filename

    # PCB & Circuit Exports
    if ext in ("gerber_zip", "gerber", "gbr") or (ext == "zip" and getattr(artifact, "artifact_type", None) == "pcb"):
        content = assemble_full_content(artifact)
        zip_bytes = compile_to_gerber_zip(content, base_name=base_name)
        return zip_bytes, "application/zip", f"{base_name}_gerbers.zip"

    elif ext in ("eda", "eda_json", "eda_pcb", "easyeda", "easyeda_json"):
        content = assemble_full_content(artifact)
        try:
            circuit_data = json.loads(content)
        except Exception:
            circuit_data = {}
        eda_obj = export_to_eda_pcb(circuit_data)
        out_str = json.dumps(eda_obj, indent=2)
        return out_str.encode("utf-8"), "application/json", f"{base_name}_eda.json"

    elif ext in ("spice", "spice_netlist", "cir"):
        content = assemble_full_content(artifact)
        try:
            circuit_data = json.loads(content)
        except Exception:
            circuit_data = {}
        spice_net = export_to_spice_netlist(circuit_data)
        return spice_net.encode("utf-8"), "text/plain", f"{base_name}.cir"

    elif ext in ("kicad_pcb", "kicad") or (getattr(artifact, "artifact_type", None) == "pcb" and ext == "kicad_pcb"):
        content = assemble_full_content(artifact)
        kicad_str = compile_to_kicad_pcb(content)
        return kicad_str.encode("utf-8"), "text/plain", f"{base_name}.kicad_pcb"

    elif ext in ("bom_csv", "bom"):
        content = assemble_full_content(artifact)
        bom_str = compile_to_bom_csv(content)
        return bom_str.encode("utf-8"), "text/csv", f"{base_name}_BOM.csv"

    elif ext in ("centroid_csv", "cpl"):
        content = assemble_full_content(artifact)
        cpl_str = compile_to_centroid_csv(content)
        return cpl_str.encode("utf-8"), "text/csv", f"{base_name}_CPL.csv"

    elif ext == "docx" or (ext == "doc" and artifact.artifact_type == "document"):
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

    elif ext in ("mp4", "webm", "mov", "mkv", "avi") or getattr(artifact, "artifact_type", None) == "video":
        video_bytes = None
        if getattr(artifact, "media_url", None):
            video_bytes = _fetch_image_bytes(artifact.media_url)
        if not video_bytes and getattr(artifact, "filename", None):
            video_bytes = _fetch_image_bytes(artifact.filename)
        if video_bytes:
            out_name = f"{base_name}.{ext}" if not artifact.filename.endswith(f".{ext}") else artifact.filename
            return video_bytes, f"video/{ext if ext != 'mov' else 'quicktime'}", out_name

    elif ext in ("mp3", "wav", "ogg", "m4a", "aac", "flac") or getattr(artifact, "artifact_type", None) == "audio":
        audio_bytes = None
        if getattr(artifact, "media_url", None):
            audio_bytes = _fetch_image_bytes(artifact.media_url)
        if not audio_bytes and getattr(artifact, "filename", None):
            audio_bytes = _fetch_image_bytes(artifact.filename)
        if audio_bytes:
            out_name = f"{base_name}.{ext}" if not artifact.filename.endswith(f".{ext}") else artifact.filename
            return audio_bytes, f"audio/{ext if ext != 'mp3' else 'mpeg'}", out_name

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
    elif ext in ("vsdx", "vsd"):
        mime = "application/vnd.visio"
    elif ext in ("l5x", "l5k"):
        mime = "application/xml"
    elif ext == "m":
        mime = "text/x-matlab"
    elif ext == "xer":
        mime = "text/plain"

    out_name = f"{base_name}.{ext}" if not artifact.filename.endswith(f".{ext}") else artifact.filename
    return full_text.encode("utf-8"), mime, out_name
