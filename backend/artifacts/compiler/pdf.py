"""
backend/artifacts/compiler/pdf.py
Compiles Markdown / Document artifacts into high-quality PDF with native ReportLab
tables, code blocks, hyperlinks, images, and styled typography.
"""
import io
import re

from models import SessionArtifact
from .utils import _strip_html, _tokenize_inline_formatting, _fetch_image_bytes


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
