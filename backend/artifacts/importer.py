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
    if fn.endswith((".docx", ".doc", ".html", ".htm")):
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
    elif fn.endswith((".py", ".js", ".jsx", ".ts", ".tsx", ".css", ".json", ".sql", ".sh", ".yaml", ".yml", ".xml", ".go", ".rs", ".java", ".cpp", ".c", ".rb", ".php")):
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

def _get_docx_para_alignment(para) -> Optional[str]:
    """Returns 'center', 'right', 'justify', or None."""
    align = getattr(para, "alignment", None)
    if align is None and hasattr(para, "paragraph_format"):
        align = para.paragraph_format.alignment
    if align is None and getattr(para, "style", None) and hasattr(para.style, "paragraph_format"):
        align = para.style.paragraph_format.alignment
    if align is not None:
        try:
            val = int(align)
            if val == 1:
                return "center"
            elif val == 2:
                return "right"
            elif val == 3:
                return "justify"
            elif val == 0:
                return None
        except Exception:
            pass
        name = str(align).upper()
        if "CENTER" in name:
            return "center"
        if "RIGHT" in name:
            return "right"
        if "JUSTIFY" in name:
            return "justify"
    return None


def _format_docx_runs(para) -> str:
    """Extracts text while preserving bold, italic, code formatting across runs."""
    if not getattr(para, "runs", None):
        return para.text.strip()
    parts = []
    for run in para.runs:
        t = run.text
        if not t:
            continue
        lspace = " " if t.startswith(" ") and len(t.strip()) > 0 else ""
        rspace = " " if t.endswith(" ") and len(t.strip()) > 0 else ""
        core = t.strip()
        if not core:
            parts.append(t)
            continue
        if run.bold and run.italic:
            formatted = f"***{core}***"
        elif run.bold:
            formatted = f"**{core}**"
        elif run.italic:
            formatted = f"*{core}*"
        else:
            formatted = core
        parts.append(f"{lspace}{formatted}{rspace}")
    res = "".join(parts).strip()
    return res if res else para.text.strip()


def _format_docx_table(table) -> str:
    """Formats docx table with cell alignments and headers."""
    if not table.rows:
        return ""
    has_custom_align = False
    for row in table.rows:
        for cell in row.cells:
            for p in cell.paragraphs:
                if _get_docx_para_alignment(p):
                    has_custom_align = True
                    break
            if has_custom_align:
                break
        if has_custom_align:
            break

    if has_custom_align:
        html_rows = []
        is_first = True
        for row in table.rows:
            tag = "th" if is_first else "td"
            cell_htmls = []
            for cell in row.cells:
                cell_text = " ".join([_format_docx_runs(p) for p in cell.paragraphs if p.text.strip()]).strip()
                cell_align = None
                for p in cell.paragraphs:
                    a = _get_docx_para_alignment(p)
                    if a:
                        cell_align = a
                        break
                style_attr = f' style="text-align: {cell_align};"' if cell_align else ""
                cell_htmls.append(f"    <{tag}{style_attr}>{cell_text or '&nbsp;'}</{tag}>")
            html_rows.append("  <tr>\n" + "\n".join(cell_htmls) + "\n  </tr>")
            is_first = False
        return '<table class="doc-render-table">\n' + "\n".join(html_rows) + "\n</table>"
    else:
        table_md = []
        headers = [" ".join([p.text.strip() for p in cell.paragraphs if p.text.strip()]).replace("\n", " ") for cell in table.rows[0].cells]
        table_md.append("| " + " | ".join(headers) + " |")
        table_md.append("| " + " | ".join(["---"] * len(headers)) + " |")
        for row in table.rows[1:]:
            row_vals = [" ".join([p.text.strip() for p in cell.paragraphs if p.text.strip()]).replace("\n", " ") for cell in row.cells]
            table_md.append("| " + " | ".join(row_vals) + " |")
        return "\n".join(table_md)


def _parse_docx(filepath: str, title: str) -> Tuple[str, List[Dict[str, Any]]]:
    """Extracts Word document paragraphs, headings, and tables in natural order while preserving alignment."""
    try:
        import docx
        from docx.text.paragraph import Paragraph
        from docx.table import Table
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

    # Extract body elements in document order
    body_elements = []
    try:
        for child in doc.element.body:
            if child.tag.endswith('p'):
                body_elements.append(('p', Paragraph(child, doc)))
            elif child.tag.endswith('tbl'):
                body_elements.append(('tbl', Table(child, doc)))
    except Exception:
        body_elements = [('p', p) for p in doc.paragraphs] + [('tbl', t) for t in doc.tables]

    for elem_type, elem in body_elements:
        if elem_type == 'p':
            para = elem
            plain_text = para.text.strip()
            if not plain_text:
                # Preserve deliberate blank line / empty paragraph gap from Word
                gap_line = '<p><br></p>'
                current_block_lines.append(gap_line)
                md_lines.append(gap_line)
                continue

            align = _get_docx_para_alignment(para)
            formatted_text = _format_docx_runs(para)
            style_name = (para.style.name or "").lower()

            styles = []
            if align:
                styles.append(f"text-align: {align}")

            # Extract line spacing (line height) and paragraph margins
            try:
                pf = para.paragraph_format
                if pf.line_spacing is not None:
                    if isinstance(pf.line_spacing, (float, int)) and pf.line_spacing <= 4.0:
                        styles.append(f"line-height: {pf.line_spacing}")
                    elif isinstance(pf.line_spacing, int) and pf.line_spacing > 4.0:
                        styles.append(f"line-height: {round(pf.line_spacing / 12700, 1)}pt")
                if pf.space_after is not None and int(pf.space_after) > 0:
                    styles.append(f"margin-bottom: {round(int(pf.space_after) / 12700, 1)}pt")
                if pf.space_before is not None and int(pf.space_before) > 0:
                    styles.append(f"margin-top: {round(int(pf.space_before) / 12700, 1)}pt")
            except Exception:
                pass

            style_attr = f' style="{"; ".join(styles)};"' if styles else ""

            if "heading 1" in style_name or style_name == "title":
                commit_block()
                current_block_title = plain_text
                current_block_key = f"sec_{sec_idx + 1}"
                line = f'<h1{style_attr}>{formatted_text}</h1>' if styles else f"# {formatted_text}"
                current_block_lines.append(line)
                md_lines.append(line)
            elif "heading 2" in style_name:
                commit_block()
                current_block_title = plain_text
                current_block_key = f"sec_{sec_idx + 1}"
                line = f'<h2{style_attr}>{formatted_text}</h2>' if styles else f"## {formatted_text}"
                current_block_lines.append(line)
                md_lines.append(line)
            elif "heading 3" in style_name:
                line = f'<h3{style_attr}>{formatted_text}</h3>' if styles else f"### {formatted_text}"
                current_block_lines.append(line)
                md_lines.append(line)
            elif "heading 4" in style_name:
                line = f'<h4{style_attr}>{formatted_text}</h4>' if styles else f"#### {formatted_text}"
                current_block_lines.append(line)
                md_lines.append(line)
            elif "heading 5" in style_name:
                line = f'<h5{style_attr}>{formatted_text}</h5>' if styles else f"##### {formatted_text}"
                current_block_lines.append(line)
                md_lines.append(line)
            elif "heading 6" in style_name:
                line = f'<h6{style_attr}>{formatted_text}</h6>' if styles else f"###### {formatted_text}"
                current_block_lines.append(line)
                md_lines.append(line)
            else:
                line = f'<p{style_attr}>{formatted_text}</p>' if styles else formatted_text
                current_block_lines.append(line)
                md_lines.append(line)

        elif elem_type == 'tbl':
            tbl_str = _format_docx_table(elem)
            if tbl_str:
                current_block_lines.append(tbl_str)
                md_lines.append(tbl_str)

    commit_block()
    full_content = "\n\n".join(md_lines).strip()
    return full_content, blocks


def _parse_html_doc(raw_html: str, title: str) -> Tuple[str, List[Dict[str, Any]]]:
    """Extracts HTML document into structured sections while preserving all styling & alignment."""
    import re
    blocks = []
    body_match = re.search(r"<body[^>]*>(.*?)</body>", raw_html, re.DOTALL | re.IGNORECASE)
    content = body_match.group(1).strip() if body_match else raw_html.strip()
    
    pattern = re.compile(r"(<h[12][^>]*>.*?</h[12]>)", re.IGNORECASE | re.DOTALL)
    parts = pattern.split(content)
    
    if len(parts) > 2:
        sec_idx = 0
        current_title = "Overview"
        current_part = []
        for p in parts:
            p_strip = p.strip()
            if not p_strip:
                continue
            h_match = re.match(r"<h[12][^>]*>(.*?)</h[12]>", p_strip, re.IGNORECASE | re.DOTALL)
            if h_match:
                if current_part:
                    sec_content = "\n\n".join(current_part).strip()
                    if sec_content:
                        blocks.append({
                            "block_key": f"sec_{sec_idx}",
                            "title": current_title,
                            "content": sec_content,
                            "order_index": sec_idx
                        })
                        sec_idx += 1
                current_title = re.sub(r"<[^>]+>", "", h_match.group(1)).strip() or f"Section {sec_idx + 1}"
                current_part = [p_strip]
            else:
                current_part.append(p_strip)
        if current_part:
            sec_content = "\n\n".join(current_part).strip()
            if sec_content:
                blocks.append({
                    "block_key": f"sec_{sec_idx}",
                    "title": current_title,
                    "content": sec_content,
                    "order_index": sec_idx
                })
    else:
        blocks = [{
            "block_key": "sec_main",
            "title": title or "Document Content",
            "content": content,
            "order_index": 0
        }]
    return content, blocks


def _parse_pdf(filepath: str, title: str) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Extracts PDF documents into structured, beautifully formatted Markdown sections.
    - Preserves tables as clean Markdown tables using table bounding-box detection.
    - Decomposes multi-section reports into logical outline sections (e.g. Executive Summary, Milestones, Next Steps).
    - Cleans up CID / bullet artifacts ((cid:127) -> •).
    - Falls back to high-resolution page rendering for purely scanned / image-based PDFs.
    """
    import base64
    full_content_parts = []
    blocks = []

    doc = None
    plumber_pdf = None
    try:
        import fitz
        doc = fitz.open(filepath)
    except Exception:
        pass

    try:
        import pdfplumber
        plumber_pdf = pdfplumber.open(filepath)
    except Exception:
        pass

    # 1. Check if PDF has extractable text
    total_text_len = 0
    if doc:
        total_text_len = sum(len(page.get_text().strip()) for page in doc)
    elif plumber_pdf:
        total_text_len = sum(len((p.extract_text() or "").strip()) for p in plumber_pdf.pages)

    # 2. Purely scanned / image-based PDF fallback: render to crisp PNG images
    if total_text_len == 0:
        rendered_images = []
        if doc:
            for idx, page in enumerate(doc):
                pix = page.get_pixmap(dpi=150)
                png_bytes = pix.tobytes("png")
                b64_data = base64.b64encode(png_bytes).decode("ascii")
                rendered_images.append((idx + 1, f"data:image/png;base64,{b64_data}"))
        elif plumber_pdf:
            try:
                import pypdfium2 as pdfium
                pdf_doc = pdfium.PdfDocument(filepath)
                for idx in range(len(pdf_doc)):
                    image = pdf_doc[idx].render(scale=2).to_pil()
                    import io
                    buf = io.BytesIO()
                    image.save(buf, format="PNG")
                    b64_data = base64.b64encode(buf.getvalue()).decode("ascii")
                    rendered_images.append((idx + 1, f"data:image/png;base64,{b64_data}"))
            except Exception:
                pass

        if rendered_images:
            for page_num, img_src in rendered_images:
                block_title = f"Page {page_num}"
                page_md = f"## {block_title}\n\n![{block_title}]({img_src})"
                full_content_parts.append(page_md)
                blocks.append({
                    "block_key": f"page_{page_num}",
                    "title": block_title,
                    "content": page_md,
                    "order_index": page_num - 1
                })
        else:
            block_title = "Document Overview"
            page_md = f"# {title}\n\n*(Document loaded. Page content is graphical or scanned)*"
            full_content_parts.append(page_md)
            blocks.append({
                "block_key": "page_1",
                "title": block_title,
                "content": page_md,
                "order_index": 0
            })
        return "\n\n".join(full_content_parts).strip(), blocks

    # 3. PDF with text: extract tables and text blocks in vertical layout order
    sec_idx = 0
    page_count = len(doc) if doc else len(plumber_pdf.pages)

    for page_idx in range(page_count):
        fitz_page = doc[page_idx] if doc else None
        plumber_page = plumber_pdf.pages[page_idx] if plumber_pdf and page_idx < len(plumber_pdf.pages) else None

        # Extract markdown tables with bounding boxes
        tables_data = []
        if plumber_page:
            try:
                found_tables = plumber_page.find_tables()
                for ft in found_tables:
                    raw_t = ft.extract()
                    clean_t = []
                    for row in raw_t:
                        clean_row = [" ".join(str(c or "").split()) for c in row]
                        if any(clean_row):
                            clean_t.append(clean_row)
                    if clean_t and len(clean_t) >= 2:
                        headers = clean_t[0]
                        cols = len(headers)
                        t_md = ["| " + " | ".join(headers) + " |", "| " + " | ".join(["---"] * cols) + " |"]
                        for r in clean_t[1:]:
                            padded = r + [""] * (cols - len(r))
                            t_md.append("| " + " | ".join(padded[:cols]) + " |")
                        table_str = "\n".join(t_md)
                        tables_data.append({"bbox": ft.bbox, "md": table_str})
            except Exception:
                pass

        # Extract text blocks
        content_items = []
        if fitz_page:
            raw_blocks = fitz_page.get_text("blocks")
            page_width = fitz_page.rect.width
            for b in raw_blocks:
                if b[6] != 0:  # non-text block
                    continue
                bx0, by0, bx1, by1, btext = b[0], b[1], b[2], b[3], b[4].strip()
                if not btext:
                    continue

                # Check if block falls inside any table bbox
                in_table = False
                for td in tables_data:
                    tx0, ty0, tx1, ty1 = td["bbox"]
                    if not (by1 < ty0 or by0 > ty1):
                        in_table = True
                        break
                if not in_table:
                    block_align = None
                    mid_x = (bx0 + bx1) / 2.0
                    block_width = bx1 - bx0
                    if page_width > 0:
                        if abs(mid_x - (page_width / 2.0)) < 25 and block_width < page_width * 0.75:
                            block_align = "center"
                        elif bx0 > page_width * 0.55:
                            block_align = "right"
                    content_items.append({"y0": by0, "type": "text", "text": btext, "align": block_align})
        elif plumber_page:
            p_text = (plumber_page.extract_text() or "").strip()
            if p_text:
                content_items.append({"y0": 0, "type": "text", "text": p_text, "align": None})

        # Add tables at their vertical position y0
        for td in tables_data:
            content_items.append({"y0": td["bbox"][1], "type": "table", "text": td["md"], "align": None})

        content_items.sort(key=lambda x: x["y0"])

        # Group into logical sections based on headings
        current_sec = None
        for item in content_items:
            t = item["text"]
            # Clean CID and bullet artifacts ((cid:127) -> •)
            t = re.sub(r'\(cid:\d+\)', '•', t)

            is_heading = False
            heading_title = ""
            if item["type"] == "text":
                first_line = t.splitlines()[0].strip()
                # Numbered section (e.g. 1. Executive Summary, 2. Program Milestones)
                if re.match(r'^\d+\.\s+[A-Za-z]', first_line):
                    is_heading = True
                    heading_title = first_line
                elif len(t.splitlines()) == 1 and len(first_line) < 60 and not first_line.endswith('.') and not first_line.startswith(('•', '-', '*')):
                    is_heading = True
                    heading_title = first_line

            if item.get("align") and not is_heading and item["type"] == "text":
                lines = [l.strip() for l in t.splitlines() if l.strip()]
                joined_text = "<br />".join(lines)
                t = f'<p style="text-align: {item["align"]};">{joined_text}</p>'

            if is_heading:
                if current_sec and current_sec["lines"]:
                    sec_body = "\n\n".join(current_sec["lines"]).strip()
                    full_content_parts.append(sec_body)
                    blocks.append({
                        "block_key": f"sec_{sec_idx + 1}",
                        "title": current_sec["title"],
                        "content": sec_body,
                        "order_index": sec_idx
                    })
                    sec_idx += 1

                rest_lines = "\n".join(t.splitlines()[1:]).strip()
                current_sec = {
                    "title": heading_title,
                    "lines": [f"### {heading_title}"]
                }
                if rest_lines:
                    current_sec["lines"].append(rest_lines)
            else:
                if not current_sec:
                    page_title = f"Page {page_idx + 1}" if page_count > 1 else "Document Overview"
                    current_sec = {"title": page_title, "lines": []}
                current_sec["lines"].append(t)

        if current_sec and current_sec["lines"]:
            sec_body = "\n\n".join(current_sec["lines"]).strip()
            full_content_parts.append(sec_body)
            blocks.append({
                "block_key": f"sec_{sec_idx + 1}",
                "title": current_sec["title"],
                "content": sec_body,
                "order_index": sec_idx
            })
            sec_idx += 1

    if not blocks:
        blocks.append({
            "block_key": "doc_main",
            "title": title,
            "content": f"# {title}\n\n*(Document loaded)*",
            "order_index": 0
        })
        full_content_parts = [blocks[0]["content"]]

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


