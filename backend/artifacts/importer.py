"""
backend/artifacts/importer.py
Comprehensive file importer that parses uploaded user files across multiple formats
into structured content, metadata, and decomposed blocks for the Canvas Artifact Editor.
"""
import os
import re
import json
from typing import Dict, Any, Tuple, List, Optional


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

    elif ext in (".md", ".markdown", ".txt", ".text", ".rst"):
        artifact_type = "document"
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
        language = "markdown" if ext in (".md", ".markdown") else "text"

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
        try:
            with open(filepath, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
        except Exception:
            content = f"// Binary CAD File: {display_filename}"

    # ─────────────────────────────────────────────────────────────────────────
    # 5. 3D Models (.step, .stp, .stl, .obj, .iges, .igs, .ifc, .glb, .gltf)
    # ─────────────────────────────────────────────────────────────────────────
    elif ext in (".step", ".stp", ".stl", ".obj", ".iges", ".igs", ".ifc", ".glb", ".gltf"):
        artifact_type = "cad_3d"
        try:
            with open(filepath, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
        except Exception:
            content = f"// 3D Solid Model: {display_filename}"

    # ─────────────────────────────────────────────────────────────────────────
    # 6. Geospatial Maps (.geojson, .kml, .kmz, .shp)
    # ─────────────────────────────────────────────────────────────────────────
    elif ext in (".geojson", ".kml", ".kmz", ".shp"):
        artifact_type = "gis"
        try:
            with open(filepath, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
        except Exception:
            content = f"// GIS Spatial Dataset: {display_filename}"

    # ─────────────────────────────────────────────────────────────────────────
    # 7. Industrial / Logic / Engineering (.l5x, .l5k, .xer, .s7p, .m, .slx)
    # ─────────────────────────────────────────────────────────────────────────
    elif ext in (".l5x", ".l5k", ".xer", ".s7p", ".m", ".slx"):
        artifact_type = "engineering_data"
        try:
            with open(filepath, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
        except Exception:
            content = f"// Industrial Automation / Engineering Project: {display_filename}"

    # ─────────────────────────────────────────────────────────────────────────
    # 8. Vector Graphics & Diagrams (.svg, .vsdx)
    # ─────────────────────────────────────────────────────────────────────────
    elif ext == ".svg":
        artifact_type = "svg"
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()

    elif ext == ".vsdx":
        artifact_type = "diagram"
        content = f"// Visio Diagram: {display_filename}"

    # ─────────────────────────────────────────────────────────────────────────
    # 9. Audio / Video Media
    # ─────────────────────────────────────────────────────────────────────────
    elif ext in (".mp3", ".wav", ".ogg", ".m4a", ".aac"):
        artifact_type = "audio"
        content = f"[Audio File: {display_filename}]"
        media_url = f"/api/v1/files/download/{filename}"

    elif ext in (".mp4", ".webm", ".mov", ".mkv"):
        artifact_type = "video"
        content = f"[Video File: {display_filename}]"
        media_url = f"/api/v1/files/download/{filename}"

    # ─────────────────────────────────────────────────────────────────────────
    # 10. Code & Markup (.py, .js, .ts, .html, .css, .json, .sql, .sh, etc.)
    # ─────────────────────────────────────────────────────────────────────────
    else:
        artifact_type = "code" if not artifact_type or artifact_type == "document" else artifact_type
        language = infer_code_language(display_filename)
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()

    return {
        "title": effective_title,
        "filename": display_filename,
        "artifact_type": artifact_type,
        "content": content,
        "language": language,
        "media_url": media_url,
        "blocks": blocks
    }


def infer_artifact_type(filename: str) -> str:
    """Infers artifact_type from filename extension."""
    fn = filename.lower()
    if fn.endswith((".docx", ".doc")):
        return "document"
    elif fn.endswith((".xlsx", ".xls", ".csv", ".tsv")):
        return "spreadsheet"
    elif fn.endswith((".pptx", ".ppt")):
        return "presentation"
    elif fn.endswith(".pdf"):
        return "pdf"
    elif fn.endswith(".svg"):
        return "svg"
    elif fn.endswith((".mp3", ".wav", ".ogg", ".m4a", ".aac")):
        return "audio"
    elif fn.endswith((".mp4", ".webm", ".mov", ".mkv")):
        return "video"
    elif fn.endswith((".dwg", ".dxf")):
        return "cad_2d"
    elif fn.endswith((".step", ".stp", ".iges", ".igs", ".ifc", ".stl", ".obj", ".glb", ".gltf")):
        return "cad_3d"
    elif fn.endswith((".geojson", ".kml", ".kmz", ".shp")):
        return "gis"
    elif fn.endswith((".vsdx",)):
        return "diagram"
    elif fn.endswith((".l5x", ".l5k", ".s7p", ".xer", ".m", ".slx")):
        return "engineering_data"
    elif fn.endswith((".py", ".js", ".jsx", ".ts", ".tsx", ".html", ".css", ".json", ".sql", ".sh", ".yaml", ".yml", ".xml", ".go", ".rs", ".java", ".cpp", ".c", ".rb", ".php")):
        return "code"
    elif fn.endswith((".md", ".markdown", ".txt")):
        return "document"
    return "document"


def infer_code_language(filename: str) -> str:
    """Infers code syntax highlighting language from filename extension."""
    ext = os.path.splitext(filename)[1].lower()
    mapping = {
        ".py": "python",
        ".js": "javascript",
        ".jsx": "jsx",
        ".ts": "typescript",
        ".tsx": "tsx",
        ".html": "html",
        ".htm": "html",
        ".css": "css",
        ".json": "json",
        ".sql": "sql",
        ".sh": "bash",
        ".bash": "bash",
        ".yaml": "yaml",
        ".yml": "yaml",
        ".xml": "xml",
        ".go": "go",
        ".rs": "rust",
        ".java": "java",
        ".cpp": "cpp",
        ".c": "c",
        ".cs": "csharp",
        ".rb": "ruby",
        ".php": "php",
        ".dxf": "dxf",
        ".geojson": "json",
        ".kml": "xml",
        ".l5x": "xml",
        ".xer": "text",
        ".md": "markdown",
    }
    return mapping.get(ext, "text")


# ─────────────────────────────────────────────────────────────────────────────
# Internal Parsers
# ─────────────────────────────────────────────────────────────────────────────

def _parse_docx(filepath: str, title: str) -> Tuple[str, List[Dict[str, Any]]]:
    """Extracts Word document paragraphs, headings, and tables into structured markdown."""
    try:
        import docx
        doc = docx.Document(filepath)
    except Exception as e:
        return f"# {title}\n\n*Error reading docx: {str(e)}*", []

    md_lines = []
    blocks = []
    current_block_lines = []
    current_block_title = "Document Overview"
    current_block_key = "sec_intro"
    sec_idx = 0

    def commit_block():
        nonlocal current_block_lines, current_block_title, current_block_key, sec_idx
        if current_block_lines:
            text = "\n\n".join(current_block_lines).strip()
            if text:
                blocks.append({
                    "block_key": current_block_key,
                    "title": current_block_title,
                    "content": text,
                    "order_index": sec_idx
                })
                sec_idx += 1
            current_block_lines = []

    for para in doc.paragraphs:
        text = para.text.strip()
        if not text:
            continue

        style_name = (para.style.name or "").lower()
        if "heading 1" in style_name or style_name == "title":
            commit_block()
            current_block_title = text
            current_block_key = f"sec_{sec_idx + 1}"
            current_block_lines.append(f"# {text}")
            md_lines.append(f"# {text}")
        elif "heading 2" in style_name:
            commit_block()
            current_block_title = text
            current_block_key = f"sec_{sec_idx + 1}"
            current_block_lines.append(f"## {text}")
            md_lines.append(f"## {text}")
        elif "heading 3" in style_name:
            current_block_lines.append(f"### {text}")
            md_lines.append(f"### {text}")
        else:
            current_block_lines.append(text)
            md_lines.append(text)

    # Tables extraction
    for table in doc.tables:
        table_md = []
        headers = [cell.text.strip().replace("\n", " ") for cell in table.rows[0].cells] if table.rows else []
        if headers:
            table_md.append("| " + " | ".join(headers) + " |")
            table_md.append("| " + " | ".join(["---"] * len(headers)) + " |")
            for row in table.rows[1:]:
                row_vals = [cell.text.strip().replace("\n", " ") for cell in row.cells]
                table_md.append("| " + " | ".join(row_vals) + " |")
            table_str = "\n".join(table_md)
            current_block_lines.append(table_str)
            md_lines.append(table_str)

    commit_block()
    full_content = "\n\n".join(md_lines).strip()
    return full_content, blocks


def _parse_pdf(filepath: str, title: str) -> Tuple[str, List[Dict[str, Any]]]:
    """Extracts PDF text page by page into structured blocks."""
    full_content_parts = []
    blocks = []

    try:
        import pdfplumber
        with pdfplumber.open(filepath) as pdf:
            for idx, page in enumerate(pdf.pages):
                page_text = (page.extract_text() or "").strip()
                if not page_text:
                    continue
                block_title = f"Page {idx + 1}"
                page_md = f"## {block_title}\n\n{page_text}"
                full_content_parts.append(page_md)
                blocks.append({
                    "block_key": f"page_{idx + 1}",
                    "title": block_title,
                    "content": page_md,
                    "order_index": idx
                })
    except Exception:
        try:
            import pypdf
            reader = pypdf.PdfReader(filepath)
            for idx, page in enumerate(reader.pages):
                page_text = (page.extract_text() or "").strip()
                if not page_text:
                    continue
                block_title = f"Page {idx + 1}"
                page_md = f"## {block_title}\n\n{page_text}"
                full_content_parts.append(page_md)
                blocks.append({
                    "block_key": f"page_{idx + 1}",
                    "title": block_title,
                    "content": page_md,
                    "order_index": idx
                })
        except Exception as e:
            err_msg = f"# {title}\n\n*Error extracting PDF content: {str(e)}*"
            return err_msg, []

    full_content = "\n\n".join(full_content_parts).strip()
    return full_content, blocks


def _parse_spreadsheet(filepath: str, ext: str) -> Tuple[str, List[Dict[str, Any]]]:
    """Parses Excel or CSV into Canvas spreadsheet schema JSON."""
    sheets = []
    blocks = []

    try:
        import pandas as pd
        if ext in (".xlsx", ".xls"):
            xls = pd.ExcelFile(filepath)
            for idx, sheet_name in enumerate(xls.sheet_names):
                df = pd.read_excel(xls, sheet_name=sheet_name)
                df = df.fillna("")
                columns = [str(c) for c in df.columns]
                rows = df.values.tolist()
                sheet_obj = {
                    "sheet_name": sheet_name,
                    "columns": columns,
                    "rows": rows
                }
                sheets.append(sheet_obj)
                blocks.append({
                    "block_key": f"sheet_{idx + 1}",
                    "title": sheet_name,
                    "content": json.dumps(sheet_obj, indent=2),
                    "order_index": idx
                })
        else:
            sep = "\t" if ext == ".tsv" else ","
            df = pd.read_csv(filepath, sep=sep)
            df = df.fillna("")
            sheet_name = "Sheet 1"
            columns = [str(c) for c in df.columns]
            rows = df.values.tolist()
            sheet_obj = {
                "sheet_name": sheet_name,
                "columns": columns,
                "rows": rows
            }
            sheets.append(sheet_obj)
            blocks.append({
                "block_key": "sheet_1",
                "title": sheet_name,
                "content": json.dumps(sheet_obj, indent=2),
                "order_index": 0
            })
    except Exception as e:
        sheets = [{"sheet_name": "Sheet 1", "columns": ["Error"], "rows": [[str(e)]]}]

    full_content = json.dumps({"sheets": sheets}, indent=2)
    return full_content, blocks


def _parse_pptx(filepath: str, title: str) -> Tuple[str, List[Dict[str, Any]]]:
    """Parses PowerPoint deck into Canvas presentation slides JSON."""
    slides = []
    blocks = []

    try:
        from pptx import Presentation
        prs = Presentation(filepath)

        for idx, slide in enumerate(prs.slides):
            slide_title = f"Slide {idx + 1}"
            bullets = []
            notes = ""

            for shape in slide.shapes:
                if not shape.has_text_frame:
                    continue
                tf = shape.text_frame
                text = tf.text.strip()
                if not text:
                    continue

                if shape == slide.shapes.title or (shape.name and "title" in shape.name.lower()):
                    slide_title = text
                else:
                    for p in tf.paragraphs:
                        p_text = p.text.strip()
                        if p_text:
                            bullets.append(p_text)

            if slide.has_notes_slide and slide.notes_slide.notes_text_frame:
                notes = slide.notes_slide.notes_text_frame.text.strip()

            slide_obj = {
                "title": slide_title,
                "bullets": bullets,
                "notes": notes,
                "layout": "split" if len(bullets) <= 3 else "grid"
            }
            slides.append(slide_obj)
            blocks.append({
                "block_key": f"slide_{idx + 1}",
                "title": slide_title,
                "content": json.dumps(slide_obj, indent=2),
                "order_index": idx
            })

    except Exception as e:
        slides = [{
            "title": title,
            "bullets": [f"Error reading presentation: {str(e)}"],
            "notes": ""
        }]

    full_content = json.dumps({"slides": slides}, indent=2)
    return full_content, blocks
