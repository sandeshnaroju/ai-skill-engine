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


def compile_to_docx(artifact: SessionArtifact) -> io.BytesIO:
    """Compile Markdown/Document artifact into native Microsoft Word (.docx)."""
    import docx
    from docx.shared import Inches, Pt, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH

    doc = docx.Document()

    # Set document margins
    for section in doc.sections:
        section.top_margin = Inches(1.0)
        section.bottom_margin = Inches(1.0)
        section.left_margin = Inches(1.0)
        section.right_margin = Inches(1.0)

    # Document Title
    title_p = doc.add_paragraph()
    title_run = title_p.add_run(artifact.title)
    title_run.font.size = Pt(22)
    title_run.font.bold = True
    title_run.font.color.rgb = RGBColor(30, 41, 59)
    title_p.paragraph_format.space_after = Pt(14)

    # Process blocks
    blocks = sorted(artifact.blocks, key=lambda b: b.order_index) if artifact.blocks else []
    for block in blocks:
        lines = block.content.splitlines()
        for line in lines:
            line_str = line.strip()
            if not line_str:
                continue

            if line_str.startswith("# "):
                h = doc.add_heading(line_str[2:].strip(), level=1)
                h.paragraph_format.space_before = Pt(12)
                h.paragraph_format.space_after = Pt(6)
            elif line_str.startswith("## "):
                h = doc.add_heading(line_str[3:].strip(), level=2)
                h.paragraph_format.space_before = Pt(10)
                h.paragraph_format.space_after = Pt(4)
            elif line_str.startswith("### "):
                h = doc.add_heading(line_str[4:].strip(), level=3)
                h.paragraph_format.space_before = Pt(8)
                h.paragraph_format.space_after = Pt(4)
            elif line_str.startswith("- ") or line_str.startswith("* "):
                p = doc.add_paragraph(line_str[2:].strip(), style='List Bullet')
                p.paragraph_format.space_after = Pt(3)
            elif re.match(r'^\d+\.\s+', line_str):
                text_val = re.sub(r'^\d+\.\s+', '', line_str)
                p = doc.add_paragraph(text_val, style='List Number')
                p.paragraph_format.space_after = Pt(3)
            else:
                p = doc.add_paragraph()
                # Parse simple **bold**
                parts = re.split(r'(\*\*.*?\*\*)', line_str)
                for part in parts:
                    if part.startswith("**") and part.endswith("**"):
                        run = p.add_run(part[2:-2])
                        run.bold = True
                    else:
                        p.add_run(part)
                p.paragraph_format.space_after = Pt(6)

    output = io.BytesIO()
    doc.save(output)
    output.seek(0)
    return output


def compile_to_xlsx(artifact: SessionArtifact) -> io.BytesIO:
    """Compile Grid JSON or CSV into native Microsoft Excel (.xlsx)."""
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

    wb = openpyxl.Workbook()
    # Remove default sheet
    wb.remove(wb.active)

    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="3B82F6", end_color="3B82F6", fill_type="solid")
    thin_border = Border(
        left=Side(style='thin', color='E2E8F0'),
        right=Side(style='thin', color='E2E8F0'),
        top=Side(style='thin', color='E2E8F0'),
        bottom=Side(style='thin', color='E2E8F0')
    )

    blocks = sorted(artifact.blocks, key=lambda b: b.order_index) if artifact.blocks else []
    if not blocks:
        # Fallback empty sheet
        wb.create_sheet(title="Sheet 1")

    for idx, block in enumerate(blocks):
        sheet_title = block.title[:31].replace(":", "").replace("/", "") or f"Sheet {idx+1}"
        ws = wb.create_sheet(title=sheet_title)

        try:
            sheet_data = json.loads(block.content)
            columns = sheet_data.get("columns", [])
            rows = sheet_data.get("rows", [])

            # Write header row
            if columns:
                ws.append(columns)
                for col_idx in range(1, len(columns) + 1):
                    cell = ws.cell(row=1, column=col_idx)
                    cell.font = header_font
                    cell.fill = header_fill
                    cell.alignment = Alignment(horizontal="center", vertical="center")

            # Write data rows
            for row in rows:
                ws.append(row)

            # Apply borders and auto-fit column widths
            for row_cells in ws.iter_rows(min_row=1, max_row=ws.max_row, min_col=1, max_col=ws.max_column):
                for cell in row_cells:
                    cell.border = thin_border

            for col in ws.columns:
                max_len = max(len(str(cell.value or '')) for cell in col)
                col_letter = openpyxl.utils.get_column_letter(col[0].column)
                ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

        except Exception:
            # Fallback CSV parsing
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
    # 16:9 widescreen layout
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
            # Title slide layout
            slide_layout = prs.slide_layouts[0]
            slide = prs.slides.add_slide(slide_layout)
            slide.shapes.title.text = title_text
            if slide.placeholders and len(slide.placeholders) > 1:
                slide.placeholders[1].text = subtitle_text or artifact.title
        else:
            # Blank or content slide
            slide_layout = prs.slide_layouts[6]  # Blank
            slide = prs.slides.add_slide(slide_layout)

            # Slide Title
            tx_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.6), Inches(11.7), Inches(1.0))
            tf = tx_box.text_frame
            p = tf.paragraphs[0]
            p.text = title_text
            p.font.size = Pt(32)
            p.font.bold = True
            p.font.color.rgb = RGBColor(30, 41, 59)

            # Cards or Bullets
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
                # Text content
                t_box = slide.shapes.add_textbox(Inches(1.0), Inches(2.0), Inches(11.0), Inches(4.8))
                t_tf = t_box.text_frame
                t_tf.word_wrap = True
                t_p = t_tf.paragraphs[0]
                t_p.text = slide_dict.get("content", block.content)
                t_p.font.size = Pt(16)

        # Speaker notes if present
        if slide_dict.get("speaker_notes"):
            notes_slide = slide.notes_slide
            notes_tf = notes_slide.notes_text_frame
            notes_tf.text = slide_dict["speaker_notes"]

    output = io.BytesIO()
    prs.save(output)
    output.seek(0)
    return output


def compile_to_pdf(artifact: SessionArtifact) -> io.BytesIO:
    """Compile Markdown/Document into high-quality PDF via reportlab."""
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors

    output = io.BytesIO()
    doc = SimpleDocTemplate(output, pagesize=letter, rightMargin=54, leftMargin=54, topMargin=54, bottomMargin=54)
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontSize=22,
        leading=26,
        textColor=colors.HexColor("#1E293B"),
        spaceAfter=14
    )
    h1_style = ParagraphStyle(
        'DocH1',
        parent=styles['Heading2'],
        fontSize=16,
        leading=20,
        textColor=colors.HexColor("#334155"),
        spaceBefore=12,
        spaceAfter=6
    )
    body_style = ParagraphStyle(
        'DocBody',
        parent=styles['Normal'],
        fontSize=10,
        leading=15,
        textColor=colors.HexColor("#475569"),
        spaceAfter=8
    )

    story = [Paragraph(artifact.title, title_style), Spacer(1, 10)]

    blocks = sorted(artifact.blocks, key=lambda b: b.order_index) if artifact.blocks else []
    for block in blocks:
        lines = block.content.splitlines()
        for line in lines:
            line_str = line.strip()
            if not line_str:
                continue
            if line_str.startswith("#"):
                clean = re.sub(r'^#+\s*', '', line_str)
                story.append(Paragraph(clean, h1_style))
            else:
                # Escape XML entities for reportlab
                safe_line = line_str.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                story.append(Paragraph(safe_line, body_style))

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
