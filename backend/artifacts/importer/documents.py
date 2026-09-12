"""
backend/artifacts/importer/documents.py
Parsers for text-based document formats:
- Word documents (.docx, .doc) via python-docx
- Portable Document Format (.pdf) via pymupdf (fitz) or pdfplumber
- HTML documents (.html, .htm)
"""
import re
import base64
from typing import Tuple, List, Dict, Any, Optional


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
    - Decomposes multi-section reports into logical outline sections.
    - Cleans up CID / bullet artifacts ((cid:127) -> •).
    - Falls back to high-resolution page rendering for purely scanned / image-based PDFs.
    """
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
            t = re.sub(r'\(cid:\d+\)', '•', t)

            is_heading = False
            heading_title = ""
            if item["type"] == "text":
                first_line = t.splitlines()[0].strip()
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
