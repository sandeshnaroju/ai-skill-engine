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


def _extract_run_images(run, doc) -> Tuple[List[str], List[str]]:
    """
    Extract embedded raster images from a python-docx run.
    Returns (foreground_img_tags, behind_doc_data_uris).
    """
    if doc is None or not hasattr(run, "_element"):
        return [], []
    fg_imgs: List[str] = []
    bg_uris: List[str] = []
    try:
        r_ns = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
        a_ns = "http://schemas.openxmlformats.org/drawingml/2006/main"
        wp_ns = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
        v_ns = "urn:schemas-microsoft-com:vml"
        related_parts = getattr(doc.part, "related_parts", {})

        # Inspect each drawing/pict element separately so behindDoc="1" can be routed to page background
        drawing_nodes = run._element.findall(f".//{{{wp_ns}}}anchor") + run._element.findall(f".//{{{wp_ns}}}inline")
        handled_rids = set()

        for node in drawing_nodes:
            is_behind = node.tag.endswith("anchor") and node.get("behindDoc") == "1"
            width_px = None
            ext = node.find(f"{{{wp_ns}}}extent")
            if ext is not None:
                cx = ext.get("cx")
                if cx and cx.isdigit():
                    width_px = max(16, min(900, round(int(cx) / 9525)))

            for blip in node.findall(f".//{{{a_ns}}}blip"):
                rid = blip.get(f"{{{r_ns}}}embed")
                if not rid:
                    continue
                handled_rids.add(rid)
                part = related_parts.get(rid)
                if not part or not getattr(part, "blob", None):
                    continue
                mime = getattr(part, "content_type", None) or "image/png"
                if not mime.startswith("image/"):
                    continue
                b64 = base64.b64encode(part.blob).decode("ascii")
                data_uri = f"data:{mime};base64,{b64}"
                if is_behind:
                    bg_uris.append(data_uri)
                else:
                    w_style = f"width: {width_px}px; " if width_px else ""
                    fg_imgs.append(
                        f'<img src="{data_uri}" alt="Embedded image" '
                        f'style="{w_style}max-width: 100%; height: auto; border-radius: 4px; vertical-align: middle;" />'
                    )

        # Fallback for any blip or v:imagedata not inside wp:anchor/wp:inline
        extra_rids = []
        for blip in run._element.findall(f".//{{{a_ns}}}blip"):
            rid = blip.get(f"{{{r_ns}}}embed")
            if rid and rid not in handled_rids:
                extra_rids.append(rid)
        for v_img in run._element.findall(f".//{{{v_ns}}}imagedata"):
            rid = v_img.get(f"{{{r_ns}}}id")
            if rid and rid not in handled_rids:
                extra_rids.append(rid)

        for rid in extra_rids:
            part = related_parts.get(rid)
            if not part or not getattr(part, "blob", None):
                continue
            mime = getattr(part, "content_type", None) or "image/png"
            if not mime.startswith("image/"):
                continue
            b64 = base64.b64encode(part.blob).decode("ascii")
            fg_imgs.append(
                f'<img src="data:{mime};base64,{b64}" alt="Embedded image" '
                f'style="max-width: 100%; height: auto; border-radius: 4px; vertical-align: middle;" />'
            )
    except Exception:
        pass
    return fg_imgs, bg_uris


def _normalize_docx_font(raw_font: Optional[str]):
    """
    Normalize Word / pdf2docx PostScript font names into (css_font_family, inferred_bold, inferred_italic).
    e.g. 'TimesNewRomanPS-BoldMT' -> ("'Times New Roman', Times, Georgia, serif", True, False)
    """
    if not raw_font:
        return None, False, False
    name = raw_font.replace('"', "").replace("'", "").strip()
    if not name:
        return None, False, False

    low = name.lower()
    inferred_bold = any(k in low for k in ("bold", "black", "heavy", "semibold", "demibold", "-bd"))
    inferred_italic = any(k in low for k in ("italic", "oblique", "-it"))

    # Strip common PostScript / subset prefixes & weight suffixes
    base = re.sub(r'^[A-Z]{6}\+', '', name)
    base_low = base.lower()

    if "times" in base_low or "nimbusrom" in base_low:
        css = "'Times New Roman', Times, Georgia, serif"
    elif "georgia" in base_low:
        css = "Georgia, 'Times New Roman', serif"
    elif "garamond" in base_low or "palatino" in base_low or "cambria" in base_low:
        css = f"'{re.sub(r'[-,](Bold|Italic|Oblique|Regular|MT|PS).*$', '', base, flags=re.I)}', Georgia, serif"
    elif "courier" in base_low or "consolas" in base_low or "mono" in base_low or "menlo" in base_low:
        css = "'Courier New', Consolas, monospace"
    elif "helvetica" in base_low or "arial" in base_low or "nimbus" in base_low:
        css = "Arial, Helvetica, sans-serif"
    elif "calibri" in base_low:
        css = "Calibri, 'Segoe UI', Arial, sans-serif"
    elif "segoe" in base_low or "tahoma" in base_low or "verdana" in base_low:
        clean = re.sub(r'[-,](Bold|Italic|Oblique|Regular|MT|PS).*$', '', base, flags=re.I).strip()
        css = f"'{clean}', Arial, sans-serif"
    else:
        clean = re.sub(r'(PS)?[-,]?(Bold|Italic|Oblique|Regular|Medium|Light|Semibold|MT)+$', '', base, flags=re.I).strip(" -_,")
        css = f"'{clean or base}', sans-serif"

    return css, inferred_bold, inferred_italic


def _format_docx_runs(para, doc=None, in_html_context: bool = False) -> str:
    """Extracts text and inline images while preserving bold, italic, underline, strike, font size, font family, and colors."""
    if not getattr(para, "runs", None):
        return para.text.strip()
    w_ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"

    # Resolve paragraph-level style defaults
    para_font = getattr(getattr(para, "style", None), "font", None)
    para_bold = getattr(para_font, "bold", None)
    para_italic = getattr(para_font, "italic", None)
    para_size = getattr(para_font, "size", None)
    para_font_name = getattr(para_font, "name", None)

    parts = []
    for run in para.runs:
        fg_imgs, _ = _extract_run_images(run, doc)
        if fg_imgs:
            parts.extend(fg_imgs)

        t = run.text
        if not t:
            continue
        lspace = " " if t.startswith(" ") and len(t.strip()) > 0 else ""
        rspace = " " if t.endswith(" ") and len(t.strip()) > 0 else ""
        core = t.strip()
        if not core:
            parts.append(t)
            continue

        run_style_font = getattr(getattr(run, "style", None), "font", None)
        font = run.font

        # Resolve bold/italic through run -> run.style -> para.style
        is_bold = run.bold if run.bold is not None else (
            getattr(run_style_font, "bold", None) if getattr(run_style_font, "bold", None) is not None else para_bold
        )
        is_italic = run.italic if run.italic is not None else (
            getattr(run_style_font, "italic", None) if getattr(run_style_font, "italic", None) is not None else para_italic
        )

        # Resolve font name through run.font.name -> w:rFonts -> run.style -> para.style
        raw_font_name = font.name
        if not raw_font_name:
            try:
                rpr = run._element.find(f"{{{w_ns}}}rPr")
                if rpr is not None:
                    rfonts = rpr.find(f"{{{w_ns}}}rFonts")
                    if rfonts is not None:
                        raw_font_name = (
                            rfonts.get(f"{{{w_ns}}}ascii")
                            or rfonts.get(f"{{{w_ns}}}hAnsi")
                            or rfonts.get(f"{{{w_ns}}}cs")
                        )
            except Exception:
                pass
        if not raw_font_name:
            raw_font_name = getattr(run_style_font, "name", None) or para_font_name

        css_font, name_bold, name_italic = _normalize_docx_font(raw_font_name)
        if is_bold is None and name_bold:
            is_bold = True
        if is_italic is None and name_italic:
            is_italic = True

        run_styles = []
        try:
            if font.color and font.color.rgb is not None:
                hex_c = str(font.color.rgb).lstrip("#")
                if len(hex_c) == 6 and hex_c.upper() != "000000":
                    run_styles.append(f"color: #{hex_c}")

            eff_size = font.size or getattr(run_style_font, "size", None) or para_size
            if eff_size is not None:
                pt_val = round(eff_size.pt, 1)
                if 6 <= pt_val <= 72 and abs(pt_val - 11.0) > 0.5:
                    run_styles.append(f"font-size: {pt_val:g}pt")

            if css_font:
                run_styles.append(f"font-family: {css_font}")

            rpr = run._element.find(f"{{{w_ns}}}rPr")
            if rpr is not None:
                shd = rpr.find(f"{{{w_ns}}}shd")
                if shd is not None:
                    fill = (shd.get(f"{{{w_ns}}}fill") or "").strip()
                    if len(fill) == 6 and fill.lower() not in ("auto", "ffffff", "000000"):
                        run_styles.append(f"background-color: #{fill}")
        except Exception:
            pass

        has_underline = bool(getattr(run, "underline", False))
        has_strike = bool(getattr(run.font, "strike", False))

        if run_styles or in_html_context:
            # Keep a single flat <span> (no nested closing tags that could confuse inline regex splitters)
            if is_bold:
                run_styles.append("font-weight: 700")
            if is_italic:
                run_styles.append("font-style: italic")
            decorations = []
            if has_underline:
                decorations.append("underline")
            if has_strike:
                decorations.append("line-through")
            if decorations:
                run_styles.append(f"text-decoration: {' '.join(decorations)}")
            if run_styles:
                formatted = f'<span style="{"; ".join(run_styles)};">{core}</span>'
            else:
                formatted = core
        else:
            formatted = core
            if is_bold and is_italic:
                formatted = f"***{formatted}***"
            elif is_bold:
                formatted = f"**{formatted}**"
            elif is_italic:
                formatted = f"*{formatted}*"
            if has_underline:
                formatted = f"<u>{formatted}</u>"
            if has_strike:
                formatted = f"<del>{formatted}</del>"

        parts.append(f"{lspace}{formatted}{rspace}")
    res = "".join(parts).strip()
    return res if res else para.text.strip()


def _format_docx_table(table, doc=None) -> str:
    """Formats docx table with cell alignments, shading, column widths, rowspan/colspan, borderless layout detection, and inline images."""
    if not table.rows:
        return ""
    w_ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"

    # Detect whether table is a borderless layout table (common in pdf2docx)
    is_borderless = False
    try:
        tblPr = table._tbl.tblPr
        if tblPr is not None:
            tblBorders = tblPr.find(f"{{{w_ns}}}tblBorders")
            if tblBorders is not None:
                border_vals = [
                    (b.get(f"{{{w_ns}}}val") or "none").lower()
                    for b in tblBorders
                ]
                if border_vals and all(v in ("none", "nil") for v in border_vals):
                    is_borderless = True
            else:
                is_borderless = True
    except Exception:
        pass

    # Compute total grid width for proportional column widths
    grid_widths = []
    try:
        tblGrid = table._tbl.find(f"{{{w_ns}}}tblGrid")
        if tblGrid is not None:
            for gc in tblGrid.findall(f"{{{w_ns}}}gridCol"):
                w_attr = gc.get(f"{{{w_ns}}}w")
                if w_attr and w_attr.isdigit():
                    grid_widths.append(int(w_attr))
    except Exception:
        pass
    total_grid_w = sum(grid_widths) if grid_widths else 0

    def _cell_meta(cell):
        tcPr = cell._tc.tcPr if hasattr(cell, "_tc") and cell._tc is not None else None
        styles = []
        colspan = 1
        v_merge = None
        if tcPr is not None:
            shd = tcPr.find(f"{{{w_ns}}}shd")
            if shd is not None:
                fill = (shd.get(f"{{{w_ns}}}fill") or "").strip()
                if len(fill) == 6 and fill.lower() != "auto":
                    styles.append(f"background-color: #{fill}")
            gs = tcPr.find(f"{{{w_ns}}}gridSpan")
            if gs is not None:
                val = gs.get(f"{{{w_ns}}}val")
                if val and val.isdigit() and int(val) > 1:
                    colspan = int(val)
            vm = tcPr.find(f"{{{w_ns}}}vMerge")
            if vm is not None:
                v_merge = vm.get(f"{{{w_ns}}}val") or "continue"
            va = tcPr.find(f"{{{w_ns}}}vAlign")
            if va is not None:
                v_val = va.get(f"{{{w_ns}}}val")
                if v_val in ("top", "center", "bottom"):
                    styles.append(f"vertical-align: {'middle' if v_val == 'center' else v_val}")
            if total_grid_w > 0:
                tcW = tcPr.find(f"{{{w_ns}}}tcW")
                if tcW is not None and (tcW.get(f"{{{w_ns}}}type") or "dxa") == "dxa":
                    w_val = tcW.get(f"{{{w_ns}}}w")
                    if w_val and w_val.isdigit():
                        pct = round((int(w_val) / total_grid_w) * 100, 1)
                        if 2 <= pct <= 99:
                            styles.append(f"width: {pct}%")

        cell_align = None
        for p in cell.paragraphs:
            a = _get_docx_para_alignment(p)
            if a:
                cell_align = a
                break
        if cell_align:
            styles.append(f"text-align: {cell_align}")
        return styles, colspan, v_merge

    has_rich = is_borderless
    if not has_rich:
        for row in table.rows:
            for cell in row.cells:
                styles, colspan, v_merge = _cell_meta(cell)
                if styles or colspan > 1 or v_merge is not None:
                    has_rich = True
                    break
                for p in cell.paragraphs:
                    if any(_extract_run_images(r, doc)[0] for r in getattr(p, "runs", [])):
                        has_rich = True
                        break
            if has_rich:
                break

    if has_rich:
        # Build a deduplicated row/cell matrix to compute vertical rowspans accurately
        num_rows = len(table.rows)
        row_entries = []
        for r_idx, row in enumerate(table.rows):
            entries = []
            seen_tcs = set()
            col_cursor = 0
            for cell in row.cells:
                tc_id = id(cell._tc)
                if tc_id in seen_tcs:
                    continue
                seen_tcs.add(tc_id)
                styles, colspan, v_merge = _cell_meta(cell)
                entries.append({
                    "cell": cell,
                    "col": col_cursor,
                    "styles": styles,
                    "colspan": colspan,
                    "v_merge": v_merge,
                    "rowspan": 1,
                    "skip": False,
                })
                col_cursor += colspan
            row_entries.append(entries)

        # Compute rowspan for vMerge="restart" cells
        for r_idx in range(num_rows):
            for entry in row_entries[r_idx]:
                if entry["v_merge"] == "restart":
                    span = 1
                    for nr in range(r_idx + 1, num_rows):
                        match = next((e for e in row_entries[nr] if e["col"] == entry["col"]), None)
                        if match and match["v_merge"] == "continue":
                            match["skip"] = True
                            span += 1
                        else:
                            break
                    entry["rowspan"] = span
                elif entry["v_merge"] == "continue":
                    entry["skip"] = True

        # Only treat row 0 as <thead> if table is not borderless or row 0 has shading
        row0_has_shd = any(
            any(s.startswith("background-color:") for s in e["styles"])
            for e in row_entries[0]
        )
        use_thead = (not is_borderless) or row0_has_shd
        table_cls = "doc-render-table doc-layout-table" if is_borderless else "doc-render-table"

        html_rows = []
        for r_idx, entries in enumerate(row_entries):
            tag = "th" if (r_idx == 0 and use_thead) else "td"
            cell_htmls = []
            for e in entries:
                if e["skip"]:
                    continue
                para_htmls = []
                for p in e["cell"].paragraphs:
                    txt = _format_docx_runs(p, doc, in_html_context=True)
                    if txt:
                        para_htmls.append(txt)
                cell_text = "<br/>".join(para_htmls).strip()
                attrs = []
                if e["colspan"] > 1:
                    attrs.append(f'colspan="{e["colspan"]}"')
                if e["rowspan"] > 1:
                    attrs.append(f'rowspan="{e["rowspan"]}"')
                if e["styles"]:
                    attrs.append(f'style="{"; ".join(e["styles"])};"')
                attr_str = (" " + " ".join(attrs)) if attrs else ""
                cell_htmls.append(f"    <{tag}{attr_str}>{cell_text or '&nbsp;'}</{tag}>")
            if r_idx == 0 and use_thead:
                html_rows.append("  <thead><tr>\n" + "\n".join(cell_htmls) + "\n  </tr></thead>")
            else:
                html_rows.append("  <tr>\n" + "\n".join(cell_htmls) + "\n  </tr>")
        return f'<table class="{table_cls}">\n' + "\n".join(html_rows) + "\n</table>"
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
    """Extracts Word document paragraphs, headings, embedded images, textboxes, lists, and rich tables in natural order."""
    try:
        import docx
        from docx.text.paragraph import Paragraph
        from docx.table import Table
        doc = docx.Document(filepath)
    except Exception as e:
        return f"# {title}\n\n*Error reading docx: {str(e)}*", []

    w_ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    blocks = []
    current_block_lines = []
    current_block_title = "Document Overview"
    current_block_key = "sec_intro"
    current_block_bg = None
    sec_idx = 0

    # Check document-level <w:background w:color="..."/>
    doc_bg_color = None
    try:
        bg_el = doc.element.find(f"{{{w_ns}}}background")
        if bg_el is not None:
            bg_c = (bg_el.get(f"{{{w_ns}}}color") or "").strip()
            if len(bg_c) == 6 and bg_c.lower() not in ("auto", "ffffff"):
                doc_bg_color = f"#{bg_c}"
    except Exception:
        pass

    def commit_block():
        nonlocal current_block_lines, current_block_title, current_block_key, current_block_bg, sec_idx
        if current_block_lines:
            text = "\n\n".join(current_block_lines).strip()
            if text:
                bg_styles = []
                if current_block_bg:
                    bg_styles.append(f"background-image: url('{current_block_bg}')")
                    bg_styles.append("background-size: cover")
                    bg_styles.append("background-position: center")
                    bg_styles.append("background-repeat: no-repeat")
                elif doc_bg_color:
                    bg_styles.append(f"background-color: {doc_bg_color}")
                if bg_styles:
                    bg_styles.extend(["padding: 24px 28px", "border-radius: 8px"])
                    text = f'<div class="doc-page-bg" style="{"; ".join(bg_styles)};">\n\n{text}\n\n</div>'
                blocks.append({
                    "block_key": current_block_key,
                    "title": current_block_title,
                    "content": text,
                    "order_index": sec_idx
                })
                sec_idx += 1
            current_block_lines = []
            current_block_bg = None

    def process_paragraph(para):
        nonlocal current_block_title, current_block_key, current_block_bg
        # Collect any behindDoc="1" page background image on this paragraph
        para_bg_uri = None
        for r in getattr(para, "runs", []):
            _, bg_uris = _extract_run_images(r, doc)
            if bg_uris:
                para_bg_uri = bg_uris[0]
                break

        # Check for explicit page break
        has_page_break = any(
            br.get(f"{{{w_ns}}}type") == "page"
            for br in para._p.findall(f".//{{{w_ns}}}br")
        )
        if has_page_break:
            current_block_lines.append("---")

        if para_bg_uri and not current_block_bg:
            current_block_bg = para_bg_uri

        align = _get_docx_para_alignment(para)
        style_name = (para.style.name or "").lower()

        styles = []
        if align:
            styles.append(f"text-align: {align}")

        # Check for list numbering (w:numPr)
        is_list_item = False
        try:
            pPr = para._p.pPr
            if pPr is not None:
                if pPr.find(f"{{{w_ns}}}numPr") is not None:
                    is_list_item = True
                shd = pPr.find(f"{{{w_ns}}}shd")
                if shd is not None:
                    fill = (shd.get(f"{{{w_ns}}}fill") or "").strip()
                    if len(fill) == 6 and fill.lower() not in ("auto", "ffffff"):
                        styles.append(f"background-color: #{fill}; padding: 6px 10px; border-radius: 4px")
                pBdr = pPr.find(f"{{{w_ns}}}pBdr")
                if pBdr is not None:
                    bot = pBdr.find(f"{{{w_ns}}}bottom")
                    if bot is not None and bot.get(f"{{{w_ns}}}val") not in (None, "none", "nil"):
                        b_col = bot.get(f"{{{w_ns}}}color") or "cbd5e1"
                        if b_col == "auto":
                            b_col = "cbd5e1"
                        styles.append(f"border-bottom: 1px solid #{b_col}; padding-bottom: 4px")
        except Exception:
            pass

        # Extract line spacing (line height), left indent, and paragraph margins
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
            if pf.left_indent is not None and int(pf.left_indent) > 0 and not is_list_item:
                styles.append(f"margin-left: {round(int(pf.left_indent) / 12700, 1)}pt")
        except Exception:
            pass

        style_attr = f' style="{"; ".join(styles)};"' if styles else ""
        # Use HTML <strong>/<em> whenever paragraph itself is wrapped in an HTML tag
        will_use_html = bool(styles) and not (is_list_item or "list bullet" in style_name or "list number" in style_name)
        formatted_text = _format_docx_runs(para, doc, in_html_context=will_use_html)
        plain_text = para.text.strip()
        if not formatted_text and not plain_text:
            if not para_bg_uri:
                gap_line = '<p><br></p>'
                current_block_lines.append(gap_line)
            return

        if "heading 1" in style_name or style_name == "title":
            commit_block()
            current_block_title = plain_text or "Section"
            current_block_key = f"sec_{sec_idx + 1}"
            line = f'<h1{style_attr}>{formatted_text}</h1>' if styles else f"# {formatted_text}"
        elif "heading 2" in style_name:
            commit_block()
            current_block_title = plain_text or "Subsection"
            current_block_key = f"sec_{sec_idx + 1}"
            line = f'<h2{style_attr}>{formatted_text}</h2>' if styles else f"## {formatted_text}"
        elif "heading 3" in style_name:
            line = f'<h3{style_attr}>{formatted_text}</h3>' if styles else f"### {formatted_text}"
        elif "heading 4" in style_name:
            line = f'<h4{style_attr}>{formatted_text}</h4>' if styles else f"#### {formatted_text}"
        elif "heading 5" in style_name:
            line = f'<h5{style_attr}>{formatted_text}</h5>' if styles else f"##### {formatted_text}"
        elif "heading 6" in style_name:
            line = f'<h6{style_attr}>{formatted_text}</h6>' if styles else f"###### {formatted_text}"
        elif is_list_item or "list bullet" in style_name:
            line = f"- {formatted_text}"
        elif "list number" in style_name:
            line = f"1. {formatted_text}"
        else:
            line = f'<p{style_attr}>{formatted_text}</p>' if styles else formatted_text

        current_block_lines.append(line)

        # Also extract any floating/inline textboxes (w:txbxContent) nested inside this paragraph
        for txbx in para._p.findall(f".//{{{w_ns}}}txbxContent"):
            for tb_child in txbx:
                if tb_child.tag.endswith("p"):
                    process_paragraph(Paragraph(tb_child, doc))
                elif tb_child.tag.endswith("tbl"):
                    tbl_str = _format_docx_table(Table(tb_child, doc), doc)
                    if tbl_str:
                        current_block_lines.append(tbl_str)

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
            process_paragraph(elem)
        elif elem_type == 'tbl':
            tbl_str = _format_docx_table(elem, doc)
            if tbl_str:
                current_block_lines.append(tbl_str)

    commit_block()
    full_content = "\n\n".join(b["content"] for b in blocks).strip()
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
