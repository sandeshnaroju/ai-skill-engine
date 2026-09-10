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
    # 9. Audio / Video Media
    # ─────────────────────────────────────────────────────────────────────────
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


def _parse_cad_2d(filepath: str, filename: str, ext: str) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Parses 2D CAD files (.dxf, .dwg) into structured sections.
    For DXF: Extracts standard sections (HEADER, TABLES, BLOCKS, ENTITIES) into
    isolated blocks for surgical inspection and co-editing, and summarizes drawing layers.
    """
    blocks = []
    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            raw_text = f.read()
    except Exception as e:
        content = f"// Error reading CAD file {filename}: {str(e)}"
        return content, [{"block_key": "cad_error", "title": "Error", "content": content, "order_index": 0}]

    if ext == ".dxf" and "SECTION" in raw_text:
        # Always preserve the complete valid DXF drawing as the primary block
        # so Canvas Cad2DViewer has immediate access to the full drawing data
        blocks.append({
            "block_key": "main_drawing",
            "title": f"2D Drawing: {filename}",
            "content": raw_text,
            "order_index": 0
        })

        # Split into DXF sections for surgical inspection and co-editing
        section_pattern = re.compile(r'(0\s*\n\s*SECTION\s*\n\s*2\s*\n\s*[^\n]+)', flags=re.IGNORECASE)
        splits = section_pattern.split(raw_text)

        if len(splits) > 1:
            idx = 1
            # If there is a header or preamble before the first SECTION
            preamble = splits[0].strip()
            if preamble:
                blocks.append({
                    "block_key": "cad_preamble",
                    "title": "CAD File Header",
                    "content": preamble,
                    "order_index": idx
                })
                idx += 1

            for s_i in range(1, len(splits), 2):
                sec_header = splits[s_i].strip()
                sec_name_match = re.search(r'2\s*\n\s*([^\n]+)', sec_header)
                sec_name = sec_name_match.group(1).strip() if sec_name_match else f"SECTION_{idx + 1}"
                sec_body = splits[s_i + 1].strip() if s_i + 1 < len(splits) else ""
                full_section = f"{sec_header}\n{sec_body}".strip()

                # Friendly titles for common DXF sections
                friendly_names = {
                    "HEADER": "Drawing Variables & Limits (HEADER)",
                    "CLASSES": "Application Definitions (CLASSES)",
                    "TABLES": "Layers, LineTypes & Styles (TABLES)",
                    "BLOCKS": "Component Blocks & Symbols (BLOCKS)",
                    "ENTITIES": "Geometry & Annotations (ENTITIES)",
                    "OBJECTS": "Non-Graphical Data (OBJECTS)"
                }
                title = friendly_names.get(sec_name.upper(), f"CAD Section: {sec_name.upper()}")

                blocks.append({
                    "block_key": f"sec_{sec_name.lower()}",
                    "title": title,
                    "content": full_section,
                    "order_index": idx
                })
                idx += 1

    if not blocks:
        blocks.append({
            "block_key": "main_drawing",
            "title": f"2D Drawing: {filename}",
            "content": raw_text,
            "order_index": 0
        })

    return raw_text, blocks


def _parse_cad_3d(filepath: str, filename: str, ext: str) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Parses 3D Solid and Mesh Models (.step, .stp, .stl, .obj, .iges, .ifc, .glb).
    Decomposes large solids or multi-part assemblies into logical sub-blocks:
    - OBJ: Decomposes by Object/Group ('o' or 'g' tokens) or material groups ('usemtl').
    - STL: Separates multiple solids or extracts facet bounding summaries.
    - STEP / IGES: Extracts product definitions and topological geometric blocks.
    """
    blocks = []
    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            raw_text = f.read()
    except Exception as e:
        raw_text = f"// Binary 3D CAD File: {filename}"
        return raw_text, [{"block_key": "solid_main", "title": f"3D Model: {filename}", "content": raw_text, "order_index": 0}]

    # 1. Wavefront OBJ (.obj): Group by objects or groups ('o name' or 'g name')
    if ext == ".obj":
        group_pattern = re.compile(r'^(o\s+[^\n]+|g\s+[^\n]+)', re.MULTILINE)
        parts = group_pattern.split(raw_text)
        if len(parts) > 1:
            idx = 0
            intro = parts[0].strip()
            if intro:
                blocks.append({
                    "block_key": "obj_header",
                    "title": "Header & Material Lib",
                    "content": intro,
                    "order_index": idx
                })
                idx += 1

            for p_i in range(1, len(parts), 2):
                group_decl = parts[p_i].strip()
                group_name = re.sub(r'^[og]\s+', '', group_decl).strip() or f"Part {idx + 1}"
                group_body = parts[p_i + 1].strip() if p_i + 1 < len(parts) else ""
                blocks.append({
                    "block_key": f"part_{idx + 1}",
                    "title": f"3D Subpart: {group_name}",
                    "content": f"{group_decl}\n{group_body}".strip(),
                    "order_index": idx
                })
                idx += 1

    # 2. STL (.stl): Multi-solid detection
    elif ext == ".stl" and "solid" in raw_text.lower():
        solid_pattern = re.compile(r'(solid\s+[^\n]*)', re.IGNORECASE)
        parts = solid_pattern.split(raw_text)
        if len(parts) > 1:
            idx = 0
            for s_i in range(1, len(parts), 2):
                solid_decl = parts[s_i].strip()
                solid_name = re.sub(r'(?i)^solid\s*', '', solid_decl).strip() or f"Solid {idx + 1}"
                solid_body = parts[s_i + 1].strip() if s_i + 1 < len(parts) else ""
                blocks.append({
                    "block_key": f"solid_{idx + 1}",
                    "title": f"Solid: {solid_name}",
                    "content": f"{solid_decl}\n{solid_body}".strip(),
                    "order_index": idx
                })
                idx += 1

    # 3. STEP / IGES ISO-10303 (.step, .stp, .iges, .igs)
    elif ext in (".step", ".stp", ".iges", ".igs"):
        if "HEADER;" in raw_text and "DATA;" in raw_text:
            data_parts = re.split(r'(DATA;|ENDSEC;)', raw_text, flags=re.IGNORECASE)
            if len(data_parts) >= 3:
                header_text = data_parts[0].strip()
                body_text = raw_text[len(header_text):].strip()
                blocks.append({
                    "block_key": "step_header",
                    "title": "ISO-10303 Exchange Protocol Header",
                    "content": header_text,
                    "order_index": 0
                })
                blocks.append({
                    "block_key": "step_data",
                    "title": "Topological Solid & Assembly Data",
                    "content": body_text,
                    "order_index": 1
                })

    if not blocks:
        blocks.append({
            "block_key": "solid_main",
            "title": f"3D Solid Model: {filename}",
            "content": raw_text,
            "order_index": 0
        })

    return raw_text, blocks


def _parse_gis(filepath: str, filename: str, ext: str) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Parses Geospatial files (.geojson, .kml, .kmz, .shp).
    For GeoJSON: Decomposes into feature layer blocks or feature groups with property tables.
    For KML: Parses Placemarks into discrete geographical landmark blocks.
    """
    blocks = []
    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            raw_text = f.read()
    except Exception as e:
        content = f"// Error reading GIS file {filename}: {str(e)}"
        return content, [{"block_key": "gis_error", "title": "Error", "content": content, "order_index": 0}]

    if ext == ".geojson" or raw_text.strip().startswith("{"):
        try:
            geo_obj = json.loads(raw_text)
            features = geo_obj.get("features", [])
            if features:
                # Group features by geometry type or name property
                max_display = min(len(features), 20)
                for idx in range(max_display):
                    feat = features[idx]
                    props = feat.get("properties") or {}
                    feat_title = (
                        props.get("name") or props.get("title") or
                        props.get("id") or f"{feat.get('geometry', {}).get('type', 'Feature')} {idx + 1}"
                    )
                    blocks.append({
                        "block_key": f"feat_{idx + 1}",
                        "title": f"GIS Feature: {feat_title}",
                        "content": json.dumps(feat, indent=2),
                        "order_index": idx
                    })
                if len(features) > max_display:
                    blocks.append({
                        "block_key": "feat_remainder",
                        "title": f"Additional {len(features) - max_display} Features",
                        "content": json.dumps(features[max_display:], indent=2),
                        "order_index": max_display
                    })
        except Exception:
            pass

    elif ext == ".kml" or "<Placemark" in raw_text:
        placemark_pattern = re.compile(r'(<Placemark[\s\S]*?<\/Placemark>)', re.IGNORECASE)
        parts = placemark_pattern.split(raw_text)
        if len(parts) > 1:
            idx = 0
            for p in parts:
                p_clean = p.strip()
                if "<Placemark" in p_clean:
                    name_match = re.search(r'<name>(.*?)<\/name>', p_clean, re.IGNORECASE)
                    pm_name = name_match.group(1).strip() if name_match else f"Placemark {idx + 1}"
                    blocks.append({
                        "block_key": f"pm_{idx + 1}",
                        "title": f"Placemark: {pm_name}",
                        "content": p_clean,
                        "order_index": idx
                    })
                    idx += 1

    if not blocks:
        blocks.append({
            "block_key": "gis_main",
            "title": f"Geospatial Dataset: {filename}",
            "content": raw_text,
            "order_index": 0
        })

    return raw_text, blocks


def _parse_engineering_data(filepath: str, filename: str, ext: str) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Parses Industrial Automation & Project Controls:
    - Rockwell RSLogix5000 / Studio 5000 (.l5x, .l5k): Parses PLC Tags, Routines, and Ladder Logic Rungs.
    - Primavera P6 Project Schedules (.xer): Parses WBS, Tasks/Activities, and Calendar tables.
    - MATLAB / Simulink (.m): Parses functions, algorithm sections, and script headers.
    """
    blocks = []
    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            raw_text = f.read()
    except Exception as e:
        content = f"// Error reading engineering file {filename}: {str(e)}"
        return content, [{"block_key": "eng_error", "title": "Error", "content": content, "order_index": 0}]

    # 1. Rockwell Studio 5000 L5X XML (.l5x)
    if ext == ".l5x" or "<RSLogix5000Content" in raw_text:
        # Extract PLC Controller & Tags block
        tag_match = re.findall(r'<Tag\s+Name="([^"]+)"', raw_text)
        if tag_match:
            tag_summary = "\n".join([f"- Tag: {t}" for t in tag_match[:25]])
            blocks.append({
                "block_key": "plc_tags",
                "title": f"PLC Controller Tags ({len(tag_match)} total)",
                "content": tag_summary,
                "order_index": 0
            })

        # Extract Ladder Logic Rungs
        rung_pattern = re.compile(r'(<Rung\s+Number="(\d+)"[^>]*>[\s\S]*?<\/Rung>)', re.IGNORECASE)
        splits = rung_pattern.split(raw_text)
        if len(splits) > 1:
            idx = 1
            for r_i in range(1, len(splits), 3):
                rung_block = splits[r_i].strip()
                r_num = splits[r_i + 1] if r_i + 1 < len(splits) else str(idx)
                blocks.append({
                    "block_key": f"rung_{r_num}",
                    "title": f"Ladder Rung {r_num}",
                    "content": rung_block,
                    "order_index": idx
                })
                idx += 1

    # 2. Primavera P6 Schedule (.xer)
    elif ext == ".xer" or "%T" in raw_text:
        table_pattern = re.compile(r'(%T\s+[^\n]+)', re.MULTILINE)
        splits = table_pattern.split(raw_text)
        if len(splits) > 1:
            idx = 0
            for t_i in range(1, len(splits), 2):
                t_hdr = splits[t_i].strip()
                t_name = t_hdr.replace("%T", "").strip()
                t_body = splits[t_i + 1].strip() if t_i + 1 < len(splits) else ""
                full_table = f"{t_hdr}\n{t_body}".strip()

                friendly_table_names = {
                    "TASK": "Project Activities & Tasks (TASK)",
                    "PROJWBS": "Work Breakdown Structure (PROJWBS)",
                    "CALENDAR": "Project Calendars & Shifts (CALENDAR)",
                    "PROJECT": "Project Master Definition (PROJECT)",
                    "TASKRSRC": "Resource Assignments (TASKRSRC)"
                }
                title = friendly_table_names.get(t_name.upper(), f"P6 Table: {t_name}")

                blocks.append({
                    "block_key": f"table_{t_name.lower()}",
                    "title": title,
                    "content": full_table,
                    "order_index": idx
                })
                idx += 1

    # 3. MATLAB / Scilab / Octave (.m)
    elif ext in (".m", ".slx"):
        func_pattern = re.compile(r'^(function\s+[^\n]+)', re.MULTILINE)
        splits = func_pattern.split(raw_text)
        if len(splits) > 1:
            idx = 0
            for f_i in range(1, len(splits), 2):
                f_decl = splits[f_i].strip()
                f_name_match = re.search(r'function\s+(?:\[?[^\]=]+\]?=\s*)?([a-zA-Z0-9_]+)', f_decl)
                f_name = f_name_match.group(1) if f_name_match else f"Routine {idx + 1}"
                f_body = splits[f_i + 1].strip() if f_i + 1 < len(splits) else ""
                blocks.append({
                    "block_key": f"mat_fn_{idx + 1}",
                    "title": f"Algorithm Function: {f_name}()",
                    "content": f"{f_decl}\n{f_body}".strip(),
                    "order_index": idx
                })
                idx += 1

    if not blocks:
        blocks.append({
            "block_key": "eng_main",
            "title": f"Engineering Project: {filename}",
            "content": raw_text,
            "order_index": 0
        })

    return raw_text, blocks


def _parse_diagram(filepath: str, filename: str, ext: str) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Parses vector drawings & diagrams (.svg, .vsdx).
    For SVG: Decomposes by root layers / group elements (`<g id="...">` or `<g label="...">`).
    """
    blocks = []
    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            raw_text = f.read()
    except Exception as e:
        content = f"// Error reading diagram {filename}: {str(e)}"
        return content, [{"block_key": "diag_error", "title": "Error", "content": content, "order_index": 0}]

    if ext == ".svg":
        # Always preserve the complete valid SVG document as the primary block
        # so Canvas SvgViewer can render the complete graphic including <svg>, <defs>, and viewports.
        blocks.append({
            "block_key": "diag_main",
            "title": f"Vector Graphic: {filename}",
            "content": raw_text,
            "order_index": 0
        })

        # Also extract major named layers/groups for surgical editing & inspection
        g_pattern = re.compile(r'(<g\s+[^>]*id="([^"]+)"[^>]*>[\s\S]*?<\/g>)', re.IGNORECASE)
        matches = list(g_pattern.finditer(raw_text))
        if matches:
            idx = 1
            for m in matches[:15]:
                g_full = m.group(1).strip()
                g_id = m.group(2).strip()
                # Avoid polluting the outline with internal font glyph IDs
                if "glyph" in g_id.lower() and idx > 3:
                    continue
                blocks.append({
                    "block_key": f"layer_{g_id.lower()}",
                    "title": f"SVG Group: {g_id}",
                    "content": g_full,
                    "order_index": idx
                })
                idx += 1

    if not blocks:
        blocks.append({
            "block_key": "diag_main",
            "title": f"Vector Diagram: {filename}",
            "content": raw_text,
            "order_index": 0
        })

    return raw_text, blocks


def _parse_code_file(filepath: str, filename: str, language: str) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Parses code scripts (.py, .js, .ts, .html, .css, .json, .sql, .sh, .go, .rs, .java, etc.)
    into functions, classes, components, or modular sections for surgical inspection and patching.
    """
    blocks = []
    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            raw_text = f.read()
    except Exception as e:
        content = f"// Error reading code file {filename}: {str(e)}"
        return content, [{"block_key": "code_error", "title": "Error", "content": content, "order_index": 0}]

    # Python decomposition: def / class
    if language == "python":
        fn_pattern = re.compile(r'^(def\s+[a-zA-Z0-9_]+\s*\(|class\s+[a-zA-Z0-9_]+)', re.MULTILINE)
        splits = fn_pattern.split(raw_text)
        if len(splits) > 1:
            idx = 0
            preamble = splits[0].strip()
            if preamble:
                blocks.append({
                    "block_key": "imports_header",
                    "title": "Module Imports & Constants",
                    "content": preamble,
                    "order_index": idx
                })
                idx += 1

            for s_i in range(1, len(splits), 2):
                hdr = splits[s_i].strip()
                symbol_match = re.search(r'(?:def|class)\s+([a-zA-Z0-9_]+)', hdr)
                symbol_name = symbol_match.group(1) if symbol_match else f"Block {idx + 1}"
                body = splits[s_i + 1].strip() if s_i + 1 < len(splits) else ""
                full_block = f"{hdr}{body}".strip()
                blocks.append({
                    "block_key": f"sym_{symbol_name.lower()}",
                    "title": f"{'Class' if 'class ' in hdr else 'Function'}: {symbol_name}",
                    "content": full_block,
                    "order_index": idx
                })
                idx += 1

    # JavaScript / TypeScript decomposition: function, class, export default
    elif language in ("javascript", "typescript"):
        fn_pattern = re.compile(r'^(export\s+default\s+function|export\s+function|function\s+[a-zA-Z0-9_]+|class\s+[a-zA-Z0-9_]+)', re.MULTILINE)
        splits = fn_pattern.split(raw_text)
        if len(splits) > 1:
            idx = 0
            preamble = splits[0].strip()
            if preamble:
                blocks.append({
                    "block_key": "imports_header",
                    "title": "Imports & Declarations",
                    "content": preamble,
                    "order_index": idx
                })
                idx += 1

            for s_i in range(1, len(splits), 2):
                hdr = splits[s_i].strip()
                name_match = re.search(r'(?:function|class)\s+([a-zA-Z0-9_]+)', hdr)
                symbol_name = name_match.group(1) if name_match else f"Component {idx + 1}"
                body = splits[s_i + 1].strip() if s_i + 1 < len(splits) else ""
                blocks.append({
                    "block_key": f"fn_{symbol_name.lower()}",
                    "title": f"Export: {symbol_name}",
                    "content": f"{hdr}{body}".strip(),
                    "order_index": idx
                })
                idx += 1

    if not blocks:
        blocks.append({
            "block_key": "main_code",
            "title": f"Source Code: {filename}",
            "content": raw_text,
            "order_index": 0
        })

    return raw_text, blocks


