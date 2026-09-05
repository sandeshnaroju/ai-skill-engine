"""
backend/artifacts/compiler.py
Compiles Artifacts into native binary and text files:
- .docx via python-docx (styled tables, headings, code blocks, hyperlinks, images, horizontal dividers)
- .xlsx via openpyxl
- .pptx via python-pptx
- .pdf  via reportlab (styled tables, headings, preformatted code cards, hyperlinks, images, horizontal dividers)
- Plain text / code (.py, .js, .svg, .json, .csv, .html)
"""
import io
import re
import json
import base64
import urllib.request
from typing import Tuple, List, Optional, Any, Dict

from models import SessionArtifact
from .manager import assemble_full_content


def _hex_to_rgb(hex_str: str) -> Tuple[int, int, int]:
    """Helper to convert #hex or #rgb to RGB tuple."""
    if not hex_str:
        return (51, 65, 85)
    hex_clean = hex_str.strip().lstrip('#')
    if len(hex_clean) == 3:
        hex_clean = "".join([c * 2 for c in hex_clean])
    if len(hex_clean) == 6:
        try:
            return (int(hex_clean[0:2], 16), int(hex_clean[2:4], 16), int(hex_clean[4:6], 16))
        except ValueError:
            pass
    return (51, 65, 85)


def _strip_html(text: str) -> str:
    """Strip HTML tags and decode common entities for plain text fallback."""
    if not text:
        return ""
    clean = re.sub(r'<[^<]+?>', '', text)
    clean = clean.replace('&nbsp;', ' ').replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
    return clean.strip()


def _fetch_image_bytes(url_or_data: str) -> Optional[bytes]:
    """Fetch image bytes from data URI or HTTP(S) URL with a safe timeout."""
    if not url_or_data:
        return None
    url_clean = url_or_data.strip()
    if url_clean.startswith("data:image/"):
        try:
            if "," in url_clean:
                _, encoded = url_clean.split(",", 1)
                return base64.b64decode(encoded)
        except Exception:
            return None
    elif url_clean.startswith("http://") or url_clean.startswith("https://"):
        try:
            req = urllib.request.Request(
                url_clean,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                return resp.read()
        except Exception:
            return None
    return None


def _tokenize_inline_formatting(text: str) -> List[dict]:
    """
    Parses inline markdown and HTML tags into tokens.
    Handles:
    - Markdown links [text](url) and <a href="...">text</a>
    - Colored spans <span style="color:..."> and <font color="...">
    - Bold (**bold**, <b>, <strong>)
    - Italic (*italic*, _italic_, <i>, <em>)
    - Inline code (`code`)
    - Plain text
    """
    if not text:
        return []

    # Clean unrenderable layout tags
    clean = re.sub(r'</?(?:div|p|br|mark|section|article)[^>]*>', '', text)

    pattern = re.compile(
        r'(?P<md_link>\[(?P<link_text>[^\]]+)\]\((?P<link_url>[^\)]+)\))|'
        r'(?P<html_link><a\s+[^>]*href=[\'"](?P<a_url>[^\'"]+)[\'"][^>]*>(?P<a_text>.*?)</a>)|'
        r'(?P<color_span><span\s+style=[\'"][^\'"]*color:\s*(?P<span_color>#[0-9a-fA-F]{3,6}|[a-zA-Z]+)[^\'"]*[\'"][^>]*>(?P<span_text>.*?)</span>)|'
        r'(?P<color_font><font\s+color=[\'"](?P<font_color>#[0-9a-fA-F]{3,6}|[a-zA-Z]+)[\'"][^>]*>(?P<font_text>.*?)</font>)|'
        r'(?P<bold_tag><b>|<strong>)(?P<bold_tag_text>.*?)(?:</b>|</strong>)|'
        r'(?P<italic_tag><i>|<em>)(?P<italic_tag_text>.*?)(?:</i>|</em>)|'
        r'(?:\*\*(?P<bold_md>[^\*]+)\*\*)|'
        r'(?:__(?P<bold_under>[^_]+)__)|'
        r'(?:\*(?P<it_md>[^\*]+)\*)|'
        r'(?:_(?P<it_under>[^_]+)_)|'
        r'(?:`(?P<code_txt>[^`]+)`)',
        re.IGNORECASE | re.DOTALL
    )

    tokens = []
    last_idx = 0

    for match in pattern.finditer(clean):
        start, end = match.span()
        if start > last_idx:
            tokens.append({"type": "text", "text": clean[last_idx:start]})

        d = match.groupdict()

        if d.get("link_text") and d.get("link_url"):
            tokens.append({"type": "link", "text": d["link_text"], "url": d["link_url"]})
        elif d.get("a_text") and d.get("a_url"):
            tokens.append({"type": "link", "text": d["a_text"], "url": d["a_url"]})
        elif d.get("span_text") and d.get("span_color"):
            tokens.append({"type": "colored", "color": d["span_color"], "text": d["span_text"]})
        elif d.get("font_text") and d.get("font_color"):
            tokens.append({"type": "colored", "color": d["font_color"], "text": d["font_text"]})
        elif d.get("bold_tag_text"):
            tokens.append({"type": "bold", "text": d["bold_tag_text"]})
        elif d.get("bold_md"):
            tokens.append({"type": "bold", "text": d["bold_md"]})
        elif d.get("bold_under"):
            tokens.append({"type": "bold", "text": d["bold_under"]})
        elif d.get("italic_tag_text"):
            tokens.append({"type": "italic", "text": d["italic_tag_text"]})
        elif d.get("it_md"):
            tokens.append({"type": "italic", "text": d["it_md"]})
        elif d.get("it_under"):
            tokens.append({"type": "italic", "text": d["it_under"]})
        elif d.get("code_txt"):
            tokens.append({"type": "code", "text": d["code_txt"]})

        last_idx = end

    if last_idx < len(clean):
        tokens.append({"type": "text", "text": clean[last_idx:]})

    return tokens


def compile_to_docx(artifact: SessionArtifact) -> io.BytesIO:
    """Compile Markdown/Document artifact into native Microsoft Word (.docx) with real tables, hyperlinks, code blocks, and styled typography."""
    import docx
    from docx.shared import Inches, Pt, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.enum.table import WD_TABLE_ALIGNMENT
    from docx.oxml import parse_xml
    from docx.oxml.ns import nsdecls

    doc = docx.Document()

    # Set 1-inch margins
    for section in doc.sections:
        section.top_margin = Inches(1.0)
        section.bottom_margin = Inches(1.0)
        section.left_margin = Inches(1.0)
        section.right_margin = Inches(1.0)

    # Document Title
    title_p = doc.add_paragraph()
    title_run = title_p.add_run(artifact.title)
    title_run.font.name = "Calibri"
    title_run.font.size = Pt(24)
    title_run.font.bold = True
    title_run.font.color.rgb = RGBColor(15, 23, 42)
    title_p.paragraph_format.space_after = Pt(16)

    def add_hyperlink(paragraph, url, text, color="2563EB"):
        """Add a real clickable external hyperlink to a python-docx paragraph."""
        try:
            part = paragraph.part
            r_id = part.relate_to(url, docx.opc.constants.RELATIONSHIP_TYPE.HYPERLINK, is_external=True)
            hyperlink = parse_xml(f'<w:hyperlink {nsdecls("w")} r:id="{r_id}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>')
            new_run = parse_xml(f'<w:r {nsdecls("w")}><w:rPr><w:color w:val="{color}"/><w:u w:val="single"/><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr><w:t>{_strip_html(text)}</w:t></w:r>')
            hyperlink.append(new_run)
            paragraph._p.append(hyperlink)
        except Exception:
            run = paragraph.add_run(_strip_html(text))
            run.font.name = "Calibri"
            run.font.color.rgb = RGBColor(37, 99, 235)
            run.font.underline = True

    def apply_inline_tokens_to_paragraph(p, text_content):
        tokens = _tokenize_inline_formatting(text_content)
        if not tokens:
            return
        for t in tokens:
            t_type = t.get("type", "text")
            t_text = _strip_html(t.get("text", ""))
            if not t_text:
                continue

            if t_type == "link":
                add_hyperlink(p, t.get("url", "#"), t_text)
                continue

            run = p.add_run(t_text)
            run.font.name = "Calibri"
            run.font.size = Pt(11)

            if t_type == "bold":
                run.bold = True
                run.font.color.rgb = RGBColor(15, 23, 42)
            elif t_type == "italic":
                run.italic = True
                run.font.color.rgb = RGBColor(51, 65, 85)
            elif t_type == "code":
                run.font.name = "Consolas"
                run.font.size = Pt(10)
                run.font.color.rgb = RGBColor(124, 58, 237)
            elif t_type == "colored":
                r, g, b = _hex_to_rgb(t.get("color", "#7c3aed"))
                run.font.color.rgb = RGBColor(r, g, b)
                run.bold = True
            else:
                run.font.color.rgb = RGBColor(51, 65, 85)

    def set_cell_shading(cell, color_hex):
        shading = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{color_hex.lstrip("#")}"/>')
        cell._tc.get_or_add_tcPr().append(shading)

    def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
        tcPr = cell._tc.get_or_add_tcPr()
        tcMar = parse_xml(f'<w:tcMar {nsdecls("w")}><w:top w:w="{top}" w:type="dxa"/><w:bottom w:w="{bottom}" w:type="dxa"/><w:left w:w="{left}" w:type="dxa"/><w:right w:w="{right}" w:type="dxa"/></w:tcMar>')
        tcPr.append(tcMar)

    def add_horizontal_rule():
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(8)
        p.paragraph_format.space_after = Pt(8)
        pPr = p._p.get_or_add_pPr()
        pBdr = parse_xml(f'<w:pBdr {nsdecls("w")}><w:bottom w:val="single" w:sz="6" w:space="1" w:color="CBD5E1"/></w:pBdr>')
        pPr.append(pBdr)

    def add_code_block_table(code_text):
        tbl = doc.add_table(rows=1, cols=1)
        tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
        tblPr = tbl._tbl.tblPr
        borders = parse_xml(f'<w:tblBorders {nsdecls("w")}><w:top w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/><w:left w:val="single" w:sz="12" w:space="0" w:color="6366F1"/><w:right w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/></w:tblBorders>')
        tblPr.append(borders)

        cell = tbl.cell(0, 0)
        set_cell_shading(cell, "F8FAFC")
        set_cell_margins(cell, top=120, bottom=120, left=180, right=180)
        p = cell.paragraphs[0]
        p.paragraph_format.space_after = Pt(0)
        run = p.add_run(code_text)
        run.font.name = "Consolas"
        run.font.size = Pt(9.5)
        run.font.color.rgb = RGBColor(30, 41, 59)

        spacer = doc.add_paragraph()
        spacer.paragraph_format.space_after = Pt(6)

    def add_image_to_document(url_or_data, alt_text=""):
        img_bytes = _fetch_image_bytes(url_or_data)
        if img_bytes:
            try:
                from PIL import Image as PILImage
                pil_img = PILImage.open(io.BytesIO(img_bytes))
                w, h = pil_img.size
                max_width_in = 5.5
                aspect = h / w if w > 0 else 0.75
                img_w_in = min(w / 96.0, max_width_in)
                if img_w_in < 1.0:
                    img_w_in = max_width_in
                img_h_in = img_w_in * aspect
                if img_h_in > 6.0:
                    img_h_in = 6.0
                    img_w_in = img_h_in / aspect

                p = doc.add_paragraph()
                p.paragraph_format.space_before = Pt(6)
                p.paragraph_format.space_after = Pt(3)
                run = p.add_run()
                run.add_picture(io.BytesIO(img_bytes), width=Inches(img_w_in))

                if alt_text:
                    caption_p = doc.add_paragraph()
                    caption_p.paragraph_format.space_after = Pt(8)
                    caption_run = caption_p.add_run(f"Figure: {_strip_html(alt_text)}")
                    caption_run.font.name = "Calibri"
                    caption_run.font.size = Pt(9)
                    caption_run.font.italic = True
                    caption_run.font.color.rgb = RGBColor(100, 116, 139)
                return
            except Exception:
                pass

        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(6)
        run = p.add_run(f"🖼 [Image: {_strip_html(alt_text or 'Image')}]")
        run.font.name = "Calibri"
        run.font.size = Pt(10)
        run.font.italic = True
        run.font.color.rgb = RGBColor(100, 116, 139)

    blocks = sorted(artifact.blocks, key=lambda b: b.order_index) if artifact.blocks else []
    for block in blocks:
        lines = block.content.splitlines()
        in_code_block = False
        code_block_lines = []
        table_rows = []

        def flush_table():
            nonlocal table_rows
            if not table_rows:
                return
            clean_rows = []
            for row in table_rows:
                if all(re.match(r'^:?-+:?$', c.strip()) for c in row if c.strip()):
                    continue
                clean_rows.append(row)

            if clean_rows:
                cols_count = max(len(r) for r in clean_rows)
                tbl = doc.add_table(rows=len(clean_rows), cols=cols_count)
                tbl.alignment = WD_TABLE_ALIGNMENT.CENTER

                tblPr = tbl._tbl.tblPr
                borders = parse_xml(f'<w:tblBorders {nsdecls("w")}><w:top w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="6" w:space="0" w:color="94A3B8"/><w:left w:val="none"/><w:right w:val="none"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/><w:insideV w:val="none"/></w:tblBorders>')
                tblPr.append(borders)

                for r_idx, row_data in enumerate(clean_rows):
                    is_header = (r_idx == 0)
                    for c_idx in range(cols_count):
                        cell_val = row_data[c_idx] if c_idx < len(row_data) else ""
                        cell = tbl.cell(r_idx, c_idx)
                        set_cell_margins(cell, top=120, bottom=120, left=180, right=180)

                        if is_header:
                            set_cell_shading(cell, "1E293B")
                            p = cell.paragraphs[0]
                            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                            run = p.add_run(_strip_html(cell_val))
                            run.font.name = "Calibri"
                            run.font.size = Pt(10)
                            run.font.bold = True
                            run.font.color.rgb = RGBColor(255, 255, 255)
                        else:
                            if r_idx % 2 == 1:
                                set_cell_shading(cell, "F8FAFC")
                            else:
                                set_cell_shading(cell, "FFFFFF")
                            p = cell.paragraphs[0]
                            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                            apply_inline_tokens_to_paragraph(p, cell_val)

                spacer_p = doc.add_paragraph()
                spacer_p.paragraph_format.space_after = Pt(8)

            table_rows = []

        for line in lines:
            raw_line = line
            line_str = line.strip()

            # Handle Code Blocks
            if line_str.startswith("```"):
                if in_code_block:
                    in_code_block = False
                    code_text = "\n".join(code_block_lines)
                    add_code_block_table(code_text)
                    code_block_lines = []
                else:
                    flush_table()
                    in_code_block = True
                    code_block_lines = []
                continue

            if in_code_block:
                code_block_lines.append(raw_line)
                continue

            # Handle Tables
            if line_str.startswith("|") and line_str.endswith("|"):
                cells = [c.strip() for c in line_str.strip("|").split("|")]
                table_rows.append(cells)
                continue
            else:
                flush_table()

            if not line_str:
                continue

            # Horizontal Rule (---, ***, ___, <hr>)
            if re.match(r'^(?:---|___|\*\*\*|\-{3,}|\*{3,}|_{3,}|<hr\s*/?>)$', line_str):
                add_horizontal_rule()
                continue

            # Markdown Image: ![alt](url)
            img_match = re.match(r'^!\[(.*?)\]\((.*?)\)$', line_str)
            if img_match:
                alt_txt, img_url = img_match.group(1), img_match.group(2)
                add_image_to_document(img_url, alt_txt)
                continue

            # HTML Image: <img ... src="..." ...>
            html_img_match = re.search(r'<img\s+[^>]*src=[\'"]([^\'"]+)[\'"][^>]*>', line_str)
            if html_img_match:
                img_url = html_img_match.group(1)
                alt_match = re.search(r'alt=[\'"]([^\'"]+)[\'"]', line_str)
                alt_txt = alt_match.group(1) if alt_match else ""
                add_image_to_document(img_url, alt_txt)
                continue

            # Headings
            if line_str.startswith("# "):
                h = doc.add_paragraph()
                h.paragraph_format.space_before = Pt(16)
                h.paragraph_format.space_after = Pt(6)
                run = h.add_run(_strip_html(line_str[2:].strip()))
                run.font.name = "Calibri"
                run.font.size = Pt(18)
                run.font.bold = True
                run.font.color.rgb = RGBColor(30, 41, 59)
            elif line_str.startswith("## "):
                h = doc.add_paragraph()
                h.paragraph_format.space_before = Pt(12)
                h.paragraph_format.space_after = Pt(4)
                run = h.add_run(_strip_html(line_str[3:].strip()))
                run.font.name = "Calibri"
                run.font.size = Pt(14)
                run.font.bold = True
                run.font.color.rgb = RGBColor(51, 65, 85)
            elif line_str.startswith("### "):
                h = doc.add_paragraph()
                h.paragraph_format.space_before = Pt(10)
                h.paragraph_format.space_after = Pt(3)
                run = h.add_run(_strip_html(line_str[4:].strip()))
                run.font.name = "Calibri"
                run.font.size = Pt(12)
                run.font.bold = True
                run.font.color.rgb = RGBColor(71, 85, 105)
            elif line_str.startswith("- ") or line_str.startswith("* "):
                p = doc.add_paragraph(style='List Bullet')
                p.paragraph_format.space_after = Pt(3)
                apply_inline_tokens_to_paragraph(p, line_str[2:].strip())
            elif re.match(r'^\d+\.\s+', line_str):
                text_val = re.sub(r'^\d+\.\s+', '', line_str)
                p = doc.add_paragraph(style='List Number')
                p.paragraph_format.space_after = Pt(3)
                apply_inline_tokens_to_paragraph(p, text_val)
            elif line_str.startswith(">"):
                p = doc.add_paragraph()
                p.paragraph_format.left_indent = Inches(0.25)
                p.paragraph_format.space_before = Pt(4)
                p.paragraph_format.space_after = Pt(6)
                clean_quote = re.sub(r'^>\s*(\[!NOTE\]|\[!TIP\]|\[!IMPORTANT\])?\s*', '', line_str)
                apply_inline_tokens_to_paragraph(p, clean_quote)
            else:
                p = doc.add_paragraph()
                p.paragraph_format.space_after = Pt(6)
                apply_inline_tokens_to_paragraph(p, line_str)

        flush_table()

    output = io.BytesIO()
    doc.save(output)
    output.seek(0)
    return output


def compile_to_xlsx(artifact: SessionArtifact) -> io.BytesIO:
    """Compile spreadsheet JSON/CSV blocks into native Microsoft Excel (.xlsx)."""
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

    wb = openpyxl.Workbook()
    wb.remove(wb.active)

    blocks = sorted(artifact.blocks, key=lambda b: b.order_index) if artifact.blocks else []

    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    data_font = Font(name="Calibri", size=10, color="1E293B")
    thin_border = Border(
        left=Side(style='thin', color='E2E8F0'),
        right=Side(style='thin', color='E2E8F0'),
        top=Side(style='thin', color='E2E8F0'),
        bottom=Side(style='thin', color='E2E8F0')
    )

    for idx, block in enumerate(blocks):
        sheet_title = (block.title or f"Sheet{idx + 1}")[:31]
        ws = wb.create_sheet(title=sheet_title)

        try:
            data = json.loads(block.content)
            if isinstance(data, list):
                for r_idx, row in enumerate(data, 1):
                    if isinstance(row, dict):
                        if r_idx == 1:
                            headers = list(row.keys())
                            for c_idx, h in enumerate(headers, 1):
                                cell = ws.cell(row=1, column=c_idx, value=h)
                                cell.font = header_font
                                cell.fill = header_fill
                                cell.alignment = Alignment(horizontal="center", vertical="center")
                                cell.border = thin_border
                        values = list(row.values())
                        for c_idx, val in enumerate(values, 1):
                            cell = ws.cell(row=r_idx + 1, column=c_idx, value=val)
                            cell.font = data_font
                            cell.border = thin_border
                    elif isinstance(row, list):
                        for c_idx, val in enumerate(row, 1):
                            cell = ws.cell(row=r_idx, column=c_idx, value=val)
                            if r_idx == 1:
                                cell.font = header_font
                                cell.fill = header_fill
                            else:
                                cell.font = data_font
                            cell.border = thin_border
            else:
                ws.append([block.content])
        except Exception:
            for line in block.content.splitlines():
                ws.append([c.strip() for c in line.split(",")])

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output


def compile_to_pptx(artifact: SessionArtifact) -> io.BytesIO:
    """Compile Slide JSON into native Microsoft PowerPoint (.pptx)."""
    from pptx import Presentation
    from pptx.util import Inches, Pt
    from pptx.dml.color import RGBColor

    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)

    blocks = sorted(artifact.blocks, key=lambda b: b.order_index) if artifact.blocks else []

    for idx, block in enumerate(blocks):
        try:
            slide_dict = json.loads(block.content)
        except Exception:
            slide_dict = {"title": block.title, "content": block.content}

        title_text = slide_dict.get("title", f"Slide {idx + 1}")
        subtitle_text = slide_dict.get("subtitle", "")
        layout_name = slide_dict.get("layout", "content")
        cards = slide_dict.get("cards", [])
        bullets = slide_dict.get("bullets", [])

        if idx == 0 and layout_name in ("title", "title_slide"):
            slide_layout = prs.slide_layouts[0]
            slide = prs.slides.add_slide(slide_layout)
            slide.shapes.title.text = title_text
            if slide.placeholders and len(slide.placeholders) > 1:
                slide.placeholders[1].text = subtitle_text or artifact.title
        else:
            slide_layout = prs.slide_layouts[6]
            slide = prs.slides.add_slide(slide_layout)

            tx_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.6), Inches(11.7), Inches(1.0))
            tf = tx_box.text_frame
            p = tf.paragraphs[0]
            p.text = title_text
            p.font.size = Pt(32)
            p.font.bold = True
            p.font.color.rgb = RGBColor(30, 41, 59)

            if cards:
                num_cards = min(len(cards), 4)
                card_width = (11.7 - (0.4 * (num_cards - 1))) / num_cards
                for c_idx, card in enumerate(cards[:num_cards]):
                    left = 0.8 + c_idx * (card_width + 0.4)
                    c_box = slide.shapes.add_textbox(Inches(left), Inches(2.0), Inches(card_width), Inches(4.5))
                    c_tf = c_box.text_frame
                    c_tf.word_wrap = True

                    cp1 = c_tf.paragraphs[0]
                    cp1.text = card.get("title", f"Point {c_idx+1}")
                    cp1.font.size = Pt(20)
                    cp1.font.bold = True
                    cp1.font.color.rgb = RGBColor(99, 102, 241)

                    cp2 = c_tf.add_paragraph()
                    cp2.text = card.get("desc", card.get("text", ""))
                    cp2.font.size = Pt(14)
                    cp2.font.color.rgb = RGBColor(100, 116, 139)
                    cp2.space_before = Pt(8)
            elif bullets:
                b_box = slide.shapes.add_textbox(Inches(1.0), Inches(2.0), Inches(11.0), Inches(4.8))
                b_tf = b_box.text_frame
                for b_idx, bullet in enumerate(bullets):
                    bp = b_tf.add_paragraph() if b_idx > 0 else b_tf.paragraphs[0]
                    bp.text = f"• {bullet}"
                    bp.font.size = Pt(18)
                    bp.space_after = Pt(10)
            else:
                t_box = slide.shapes.add_textbox(Inches(1.0), Inches(2.0), Inches(11.0), Inches(4.8))
                t_tf = t_box.text_frame
                t_tf.word_wrap = True
                t_p = t_tf.paragraphs[0]
                t_p.text = slide_dict.get("content", block.content)
                t_p.font.size = Pt(16)

        if slide_dict.get("speaker_notes"):
            notes_slide = slide.notes_slide
            notes_tf = notes_slide.notes_text_frame
            notes_tf.text = slide_dict["speaker_notes"]

    output = io.BytesIO()
    prs.save(output)
    output.seek(0)
    return output


def compile_to_pdf(artifact: SessionArtifact) -> io.BytesIO:
    """Compile Markdown/Document into high-quality PDF with native ReportLab tables, code blocks, hyperlinks, images, and styled typography."""
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table as RLTable, TableStyle, Preformatted, HRFlowable, Image as RLImage
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors

    output = io.BytesIO()
    doc = SimpleDocTemplate(output, pagesize=letter, rightMargin=48, leftMargin=48, topMargin=48, bottomMargin=48)
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=22,
        leading=26,
        textColor=colors.HexColor("#0F172A"),
        spaceAfter=14
    )
    h1_style = ParagraphStyle(
        'DocH1',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=15,
        leading=19,
        textColor=colors.HexColor("#1E293B"),
        spaceBefore=12,
        spaceAfter=5
    )
    h2_style = ParagraphStyle(
        'DocH2',
        parent=styles['Heading3'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=colors.HexColor("#334155"),
        spaceBefore=8,
        spaceAfter=4
    )
    body_style = ParagraphStyle(
        'DocBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=14,
        textColor=colors.HexColor("#334155"),
        spaceAfter=6
    )
    bullet_style = ParagraphStyle(
        'DocBullet',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=14,
        leftIndent=15,
        textColor=colors.HexColor("#334155"),
        spaceAfter=3
    )
    tbl_hdr_style = ParagraphStyle(
        'TblHdr',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#FFFFFF")
    )
    tbl_cell_style = ParagraphStyle(
        'TblCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#1E293B")
    )
    code_style = ParagraphStyle(
        'DocCodeStyle',
        parent=styles['Code'],
        fontName='Courier',
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#0F172A")
    )
    caption_style = ParagraphStyle(
        'ImgCaption',
        parent=styles['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=8,
        textColor=colors.HexColor("#64748B"),
        spaceAfter=6,
        spaceBefore=2
    )

    def convert_markdown_inline_to_reportlab_xml(text_content):
        """Convert markdown, links, and HTML color spans into ReportLab formatted XML tags."""
        if not text_content:
            return ""
        tokens = _tokenize_inline_formatting(text_content)
        xml_runs = []
        for t in tokens:
            t_type = t.get("type", "text")
            t_txt = _strip_html(t.get("text", ""))
            if not t_txt:
                continue
            safe = t_txt.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

            if t_type == "link":
                url = t.get("url", "#").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                xml_runs.append(f"<font color='#2563eb'><u><a href='{url}'>{safe}</a></u></font>")
            elif t_type == "bold":
                xml_runs.append(f"<b>{safe}</b>")
            elif t_type == "italic":
                xml_runs.append(f"<i>{safe}</i>")
            elif t_type == "code":
                xml_runs.append(f"<font color='#7c3aed' face='Courier'>{safe}</font>")
            elif t_type == "colored":
                c = t.get("color", "#7c3aed")
                xml_runs.append(f"<font color='{c}'><b>{safe}</b></font>")
            else:
                xml_runs.append(safe)
        return "".join(xml_runs)

    def add_pdf_image(url_or_data, alt_text=""):
        img_bytes = _fetch_image_bytes(url_or_data)
        if img_bytes:
            try:
                from PIL import Image as PILImage
                pil_img = PILImage.open(io.BytesIO(img_bytes))
                w, h = pil_img.size
                max_w = 480.0
                aspect = h / w if w > 0 else 0.75
                img_w = min(w, max_w)
                img_h = img_w * aspect
                if img_h > 450:
                    img_h = 450
                    img_w = img_h / aspect
                story.append(Spacer(1, 4))
                story.append(RLImage(io.BytesIO(img_bytes), width=img_w, height=img_h))
                if alt_text:
                    story.append(Paragraph(f"Figure: {_strip_html(alt_text)}", caption_style))
                else:
                    story.append(Spacer(1, 6))
                return
            except Exception:
                pass

        story.append(Paragraph(f"[Image: {_strip_html(alt_text or 'Image')}]", caption_style))

    story = [Paragraph(artifact.title, title_style), Spacer(1, 8)]

    blocks = sorted(artifact.blocks, key=lambda b: b.order_index) if artifact.blocks else []
    for block in blocks:
        lines = block.content.splitlines()
        in_code_block = False
        code_block_lines = []
        table_rows = []

        def flush_pdf_table():
            nonlocal table_rows
            if not table_rows:
                return
            clean_rows = []
            for row in table_rows:
                if all(re.match(r'^:?-+:?$', c.strip()) for c in row if c.strip()):
                    continue
                clean_rows.append(row)

            if clean_rows:
                cols_count = max(len(r) for r in clean_rows)
                flowable_matrix = []

                for r_idx, row_data in enumerate(clean_rows):
                    is_header = (r_idx == 0)
                    row_cells = []
                    for c_idx in range(cols_count):
                        cell_val = row_data[c_idx] if c_idx < len(row_data) else ""
                        if is_header:
                            row_cells.append(Paragraph(_strip_html(cell_val), tbl_hdr_style))
                        else:
                            row_cells.append(Paragraph(convert_markdown_inline_to_reportlab_xml(cell_val), tbl_cell_style))
                    flowable_matrix.append(row_cells)

                col_width = 516.0 / cols_count
                rl_tbl = RLTable(flowable_matrix, colWidths=[col_width] * cols_count)
                rl_tbl.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1E293B")),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor("#FFFFFF")),
                    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('TOPPADDING', (0, 0), (-1, -1), 5),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
                    ('LEFTPADDING', (0, 0), (-1, -1), 6),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
                    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor("#FFFFFF"), colors.HexColor("#F8FAFC")]),
                ]))
                story.append(rl_tbl)
                story.append(Spacer(1, 8))

            table_rows = []

        for line in lines:
            raw_line = line
            line_str = line.strip()

            if line_str.startswith("```"):
                if in_code_block:
                    in_code_block = False
                    code_text = "\n".join(code_block_lines)
                    p_code = Preformatted(code_text, code_style)
                    code_box = RLTable([[p_code]], colWidths=[516])
                    code_box.setStyle(TableStyle([
                        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
                        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
                        ('LINELEFT', (0, 0), (-1, -1), 2.5, colors.HexColor("#6366F1")),
                        ('TOPPADDING', (0, 0), (-1, -1), 6),
                        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                        ('LEFTPADDING', (0, 0), (-1, -1), 8),
                        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
                    ]))
                    story.append(code_box)
                    story.append(Spacer(1, 6))
                    code_block_lines = []
                else:
                    flush_pdf_table()
                    in_code_block = True
                    code_block_lines = []
                continue

            if in_code_block:
                code_block_lines.append(raw_line)
                continue

            if line_str.startswith("|") and line_str.endswith("|"):
                cells = [c.strip() for c in line_str.strip("|").split("|")]
                table_rows.append(cells)
                continue
            else:
                flush_pdf_table()

            if not line_str:
                continue

            # Horizontal Rule (---, ***, ___, <hr>)
            if re.match(r'^(?:---|___|\*\*\*|\-{3,}|\*{3,}|_{3,}|<hr\s*/?>)$', line_str):
                story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#CBD5E1"), spaceBefore=6, spaceAfter=8))
                continue

            # Markdown Image: ![alt](url)
            img_match = re.match(r'^!\[(.*?)\]\((.*?)\)$', line_str)
            if img_match:
                alt_txt, img_url = img_match.group(1), img_match.group(2)
                add_pdf_image(img_url, alt_txt)
                continue

            # HTML Image: <img ... src="..." ...>
            html_img_match = re.search(r'<img\s+[^>]*src=[\'"]([^\'"]+)[\'"][^>]*>', line_str)
            if html_img_match:
                img_url = html_img_match.group(1)
                alt_match = re.search(r'alt=[\'"]([^\'"]+)[\'"]', line_str)
                alt_txt = alt_match.group(1) if alt_match else ""
                add_pdf_image(img_url, alt_txt)
                continue

            if line_str.startswith("# "):
                story.append(Paragraph(_strip_html(line_str[2:].strip()), h1_style))
            elif line_str.startswith("## "):
                story.append(Paragraph(_strip_html(line_str[3:].strip()), h2_style))
            elif line_str.startswith("### "):
                story.append(Paragraph(_strip_html(line_str[4:].strip()), h2_style))
            elif line_str.startswith("- ") or line_str.startswith("* "):
                bullet_xml = f"&bull; {convert_markdown_inline_to_reportlab_xml(line_str[2:].strip())}"
                story.append(Paragraph(bullet_xml, bullet_style))
            elif re.match(r'^\d+\.\s+', line_str):
                num_prefix = re.match(r'^(\d+\.)\s+', line_str).group(1)
                text_val = re.sub(r'^\d+\.\s+', '', line_str)
                num_xml = f"{num_prefix} {convert_markdown_inline_to_reportlab_xml(text_val)}"
                story.append(Paragraph(num_xml, bullet_style))
            elif line_str.startswith(">"):
                clean_quote = re.sub(r'^>\s*(\[!NOTE\]|\[!TIP\]|\[!IMPORTANT\])?\s*', '', line_str)
                quote_xml = f"<i>{convert_markdown_inline_to_reportlab_xml(clean_quote)}</i>"
                quote_box = RLTable([[Paragraph(quote_xml, body_style)]], colWidths=[516])
                quote_box.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
                    ('LINELEFT', (0, 0), (-1, -1), 2.5, colors.HexColor("#6366F1")),
                    ('TOPPADDING', (0, 0), (-1, -1), 4),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                    ('LEFTPADDING', (0, 0), (-1, -1), 8),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 8),
                ]))
                story.append(quote_box)
                story.append(Spacer(1, 4))
            else:
                xml_p = convert_markdown_inline_to_reportlab_xml(line_str)
                story.append(Paragraph(xml_p, body_style))

        flush_pdf_table()

    doc.build(story)
    output.seek(0)
    return output


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

    out_name = f"{base_name}.{ext}" if not artifact.filename.endswith(f".{ext}") else artifact.filename
    return full_text.encode("utf-8"), mime, out_name
