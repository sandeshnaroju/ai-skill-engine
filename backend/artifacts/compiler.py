"""
backend/engine/artifact_compiler.py
Compiles Artifacts into native binary and text files:
- .docx via python-docx
- .xlsx via openpyxl
- .pptx via python-pptx
- .pdf  via reportlab or fpdf2
- Plain text / code (.py, .js, .svg, .json, .csv)
"""
import io
import re
import json
from typing import Tuple

from models import SessionArtifact
from .manager import assemble_full_content


def _hex_to_rgb(hex_str: str) -> Tuple[int, int, int]:
    """Helper to convert #hex or #rgb to RGB tuple."""
    if not hex_str:
        return (51, 65, 85)
    hex_clean = hex_str.strip().lstrip('#')
    if len(hex_clean) == 3:
        hex_clean = "".join([c*2 for c in hex_clean])
    if len(hex_clean) == 6:
        try:
            return (int(hex_clean[0:2], 16), int(hex_clean[2:4], 16), int(hex_clean[4:6], 16))
        except ValueError:
            pass
    return (51, 65, 85)


def _tokenize_inline_formatting(text: str) -> List[dict]:
    """
    Parses inline markdown and HTML tags into tokens.
    Handles: <span style="color:...">, <font color="...">, **bold**, *italic*, `code`, and clean text.
    """
    if not text:
        return []

    # Clean unrenderable / layout HTML tags
    clean = re.sub(r'</?(?:div|p|br|mark|section|article)[^>]*>', '', text)

    # Token patterns
    pattern = re.compile(
        r'(<span\s+style=[\'"][^\'"]*color:\s*([^;\'"\s]+)[^\'"]*[\'"]>(.*?)</span>)|'
        r'(<font\s+color=[\'"]([^\'"]+)[\'"]>(.*?)</font>)|'
        r'(<b>|<strong>)(.*?)(</b>|</strong>)|'
        r'(<i>|<em>)(.*?)(</i>|</em>)|'
        r'(\*\*(.*?)\*\*)|'
        r'(__([^_]+)__)|'
        r'(\*(.*?)\*)|'
        r'(_([^_]+)_)|'
        r'(`([^`]+)`)'
    )

    tokens = []
    last_idx = 0

    for match in pattern.finditer(clean):
        start, end = match.span()
        if start > last_idx:
            tokens.append({"type": "text", "text": clean[last_idx:start]})

        span_full, span_color, span_txt, font_full, font_color, font_txt, \
        b_open, b_txt, b_close, i_open, i_txt, i_close, \
        bold_ast, bold_ast_txt, bold_under, bold_under_txt, \
        it_ast, it_ast_txt, it_under, it_under_txt, \
        code_full, code_txt = match.groups()

        if span_full:
            tokens.append({"type": "colored", "color": span_color, "text": span_txt})
        elif font_full:
            tokens.append({"type": "colored", "color": font_color, "text": font_txt})
        elif b_txt or bold_ast_txt or bold_under_txt:
            txt = b_txt or bold_ast_txt or bold_under_txt
            tokens.append({"type": "bold", "text": txt})
        elif i_txt or it_ast_txt or it_under_txt:
            txt = i_txt or it_ast_txt or it_under_txt
            tokens.append({"type": "italic", "text": txt})
        elif code_txt:
            tokens.append({"type": "code", "text": code_txt})

        last_idx = end

    if last_idx < len(clean):
        tokens.append({"type": "text", "text": clean[last_idx:]})

    return tokens


def _strip_html(text: str) -> str:
    """Strip all HTML tags and decode common entities for plain text fallback."""
    if not text:
        return ""
    clean = re.sub(r'<[^<]+?>', '', text)
    clean = clean.replace('&nbsp;', ' ').replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
    return clean.strip()


def compile_to_docx(artifact: SessionArtifact) -> io.BytesIO:
    """Compile Markdown/Document artifact into native Microsoft Word (.docx) with real tables and styled typography."""
    import docx
    from docx.shared import Inches, Pt, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
    from docx.oxml import parse_xml, OxmlElement
    from docx.oxml.ns import nsdecls, qn

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

    def apply_inline_tokens_to_paragraph(p, text_content):
        tokens = _tokenize_inline_formatting(text_content)
        if not tokens:
            return
        for t in tokens:
            t_type = t.get("type", "text")
            t_text = _strip_html(t.get("text", ""))
            if not t_text:
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
            # Filter out divider row (e.g. |---|---|)
            clean_rows = []
            for row in table_rows:
                if all(re.match(r'^:?-+:?$', c.strip()) for c in row if c.strip()):
                    continue
                clean_rows.append(row)

            if clean_rows:
                cols_count = max(len(r) for r in clean_rows)
                tbl = doc.add_table(rows=len(clean_rows), cols=cols_count)
                tbl.alignment = WD_TABLE_ALIGNMENT.CENTER

                # Apply subtle table borders via XML
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

                # Add bottom spacing after table
                spacer_p = doc.add_paragraph()
                spacer_p.paragraph_format.space_after = Pt(8)

            table_rows = []

        for line in lines:
            raw_line = line
            line_str = line.strip()

            # Handle Code Blocks
            if line_str.startswith("```"):
                if in_code_block:
                    # End code block
                    in_code_block = False
                    code_text = "\n".join(code_block_lines)
                    cp = doc.add_paragraph()
                    cp.paragraph_format.space_before = Pt(6)
                    cp.paragraph_format.space_after = Pt(8)
                    cp.paragraph_format.left_indent = Inches(0.2)
                    run = cp.add_run(code_text)
                    run.font.name = "Consolas"
                    run.font.size = Pt(9.5)
                    run.font.color.rgb = RGBColor(30, 41, 59)
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
                # Split cell values
                cells = [c.strip() for c in line_str.strip("|").split("|")]
                table_rows.append(cells)
                continue
            else:
                flush_table()

            if not line_str:
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


def compile_to_pdf(artifact: SessionArtifact) -> io.BytesIO:
    """Compile Markdown/Document into high-quality PDF with native ReportLab tables and styled typography."""
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table as RLTable, TableStyle, Preformatted
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

    def convert_markdown_inline_to_reportlab_xml(text_content):
        """Convert markdown and HTML color spans into ReportLab formatted XML tags."""
        if not text_content:
            return ""
        tokens = _tokenize_inline_formatting(text_content)
        xml_runs = []
        for t in tokens:
            t_type = t.get("type", "text")
            t_txt = _strip_html(t.get("text", ""))
            if not t_txt:
                continue
            # Escape XML entities
            safe = t_txt.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            if t_type == "bold":
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

                # Available width for letter size minus margins (612 - 96 = 516 pt)
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
                    p_code = Preformatted(code_text, styles['Code'])
                    story.append(p_code)
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

            if line_str.startswith("# "):
                story.append(Paragraph(_strip_html(line_str[2:].strip()), h1_style))
            elif line_str.startswith("## ") or line_str.startswith("### "):
                story.append(Paragraph(_strip_html(line_str.lstrip('#').strip()), h2_style))
            elif line_str.startswith("- ") or line_str.startswith("* "):
                bullet_xml = f"&bull; {convert_markdown_inline_to_reportlab_xml(line_str[2:].strip())}"
                story.append(Paragraph(bullet_xml, bullet_style))
            elif re.match(r'^\d+\.\s+', line_str):
                num_prefix = re.match(r'^(\d+\.)\s+', line_str).group(1)
                text_val = re.sub(r'^\d+\.\s+', '', line_str)
                num_xml = f"{num_prefix} {convert_markdown_inline_to_reportlab_xml(text_val)}"
                story.append(Paragraph(num_xml, bullet_style))
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
