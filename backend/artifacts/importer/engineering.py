"""
backend/artifacts/importer/engineering.py
Parsers for Engineering, Industrial Automation, GIS, and Vector Diagram files:
- Geospatial datasets (.geojson, .kml, .kmz, .shp)
- Industrial automation and project schedules (.l5x, .l5k, .xer, .s7p, .m, .slx)
- Vector graphics & diagrams (.svg, .vsdx)
"""
import re
import json
from typing import Tuple, List, Dict, Any


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
        tag_match = re.findall(r'<Tag\s+Name="([^"]+)"', raw_text)
        if tag_match:
            tag_summary = "\n".join([f"- Tag: {t}" for t in tag_match[:25]])
            blocks.append({
                "block_key": "plc_tags",
                "title": f"PLC Controller Tags ({len(tag_match)} total)",
                "content": tag_summary,
                "order_index": 0
            })

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


import os
import shutil
import subprocess
import tempfile
import zipfile
import xml.etree.ElementTree as ET


import base64


def _convert_embedded_emf_to_svg(raw_markup: str) -> str:
    """
    Browsers cannot render data:image/emf or data:image/wmf images embedded in SVGs.
    Converts data:image/emf base64 payloads to standard data:image/svg+xml;base64 payloads
    using emf2svg-conv (from emf2svg package).
    """
    if "data:image/emf" not in raw_markup and "data:image/wmf" not in raw_markup:
        return raw_markup

    conv_bin = shutil.which("emf2svg-conv") or "/usr/bin/emf2svg-conv"
    if not os.path.exists(conv_bin) and not shutil.which("emf2svg-conv"):
        return raw_markup

    def _replace_emf(match):
        b64_data = match.group(1)
        try:
            raw_bytes = base64.b64decode(b64_data)
            with tempfile.NamedTemporaryFile(suffix=".emf", delete=False) as f_in, tempfile.NamedTemporaryFile(suffix=".svg", delete=False) as f_out:
                f_in.write(raw_bytes)
                f_in.flush()
                in_path, out_path = f_in.name, f_out.name

            cmd = [conv_bin, "-p", "-i", in_path, "-o", out_path]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)
            if res.returncode == 0 and os.path.exists(out_path):
                with open(out_path, "rb") as sf:
                    svg_bytes = sf.read()
                if os.path.exists(in_path):
                    os.unlink(in_path)
                if os.path.exists(out_path):
                    os.unlink(out_path)
                if svg_bytes and b"<svg" in svg_bytes:
                    new_b64 = base64.b64encode(svg_bytes).decode("ascii")
                    return f"data:image/svg+xml;base64,{new_b64}"
            if os.path.exists(in_path):
                os.unlink(in_path)
            if os.path.exists(out_path):
                os.unlink(out_path)
        except Exception:
            pass
        return match.group(0)

    # Convert both data:image/emf and data:image/wmf
    cleaned = re.sub(r'data:image/(?:emf|wmf);base64,([A-Za-z0-9+/=]+)', _replace_emf, raw_markup)
    return cleaned


def _convert_visio_to_svg(filepath: str, ext: str) -> str:
    """
    Converts a Visio document (.vsd or .vsdx) to an SVG string.
    Tries vsd2xhtml (from libvisio-tools), then soffice (LibreOffice),
    and for .vsdx, falls back to direct XML extraction.
    """
    # Method 1: vsd2xhtml (libvisio-tools)
    vsd2xhtml_bin = shutil.which("vsd2xhtml") or "/usr/bin/vsd2xhtml" or "/usr/local/bin/vsd2xhtml"
    if os.path.exists(vsd2xhtml_bin) or shutil.which("vsd2xhtml"):
        try:
            cmd = [vsd2xhtml_bin, filepath]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=30)
            if res.returncode == 0 and ("<svg" in res.stdout or "<svg:svg" in res.stdout):
                # Clean up <svg:...> namespace prefixes produced by vsd2xhtml
                cleaned_stdout = re.sub(r'</?svg:', lambda m: '</' if m.group(0).startswith('</') else '<', res.stdout)
                # Convert any Windows Metafile (EMF/WMF) embedded stencils/shapes into web-renderable SVG data URIs
                cleaned_stdout = _convert_embedded_emf_to_svg(cleaned_stdout)
                # Extract all svg blocks or the main svg block from the output
                svg_matches = re.findall(r"(<svg[\s\S]*?<\/svg>)", cleaned_stdout, re.IGNORECASE)
                if svg_matches:
                    return "\n".join(svg_matches)
                return cleaned_stdout
        except Exception:
            pass

    # Method 2: LibreOffice (soffice) headless conversion
    soffice_bin = shutil.which("soffice") or shutil.which("libreoffice") or "/usr/local/bin/soffice" or "/usr/bin/soffice"
    if soffice_bin and (os.path.exists(soffice_bin) or shutil.which("soffice") or shutil.which("libreoffice")):
        try:
            with tempfile.TemporaryDirectory() as tmp_dir:
                res = subprocess.run(
                    [soffice_bin, "--headless", "--convert-to", "svg", filepath, "--outdir", tmp_dir],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    timeout=45
                )
                if res.returncode == 0:
                    svg_files = [os.path.join(tmp_dir, f) for f in os.listdir(tmp_dir) if f.lower().endswith(".svg")]
                    if svg_files:
                        with open(svg_files[0], "r", encoding="utf-8", errors="replace") as sf:
                            return sf.read()
        except Exception:
            pass

    # Method 3: For .vsdx, check if it's a zip and extract drawing/shape XMLs or embedded media
    if ext == ".vsdx":
        try:
            with zipfile.ZipFile(filepath, "r") as z:
                # Check for any embedded svg files
                svg_names = [n for n in z.namelist() if n.lower().endswith(".svg")]
                if svg_names:
                    with z.open(svg_names[0]) as sf:
                        return sf.read().decode("utf-8", errors="replace")
                
                # Check for pages and construct basic SVG preview
                page_files = [n for n in z.namelist() if "visio/pages/page" in n.lower() and n.endswith(".xml")]
                if page_files:
                    # Construct an SVG representation with text from shapes
                    svg_elements = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 800" width="100%" height="100%">']
                    svg_elements.append('<style>text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 14px; fill: #e2e8f0; } rect { fill: #1e293b; stroke: #38bdf8; stroke-width: 2; rx: 6; }</style>')
                    svg_elements.append('<rect width="100%" height="100%" fill="#0f172a" />')
                    
                    y = 50
                    for p_file in page_files[:3]:
                        try:
                            root = ET.fromstring(z.read(p_file))
                            ns = {"v": root.tag.split("}")[0].strip("{")} if "}" in root.tag else {}
                            texts = []
                            for elem in root.iter():
                                if elem.tag.endswith("Text") and elem.text:
                                    texts.append(elem.text.strip())
                                elif elem.text and elem.text.strip():
                                    if len(elem.text.strip()) > 2 and not elem.tag.endswith("Shape"):
                                        texts.append(elem.text.strip())
                            
                            svg_elements.append(f'<g id="page_{os.path.basename(p_file).replace(".xml", "")}">')
                            svg_elements.append(f'<text x="40" y="{y}" font-size="18" font-weight="bold" fill="#38bdf8">Page: {os.path.basename(p_file)}</text>')
                            y += 35
                            for t in texts[:15]:
                                svg_elements.append(f'<g transform="translate(40, {y})"><rect x="0" y="0" width="300" height="40" /><text x="15" y="25">{t[:40]}</text></g>')
                                y += 50
                                if y > 720:
                                    break
                            svg_elements.append('</g>')
                        except Exception:
                            continue
                    svg_elements.append('</svg>')
                    return "\n".join(svg_elements)
        except Exception:
            pass

    return ""


def _parse_diagram(filepath: str, filename: str, ext: str) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Parses vector drawings & diagrams (.svg, .vsdx, .vsd).
    For .vsd and .vsdx: converts to SVG markup, then extracts blocks by groups/pages.
    For SVG: Decomposes by root layers / group elements (`<g id="...">` or `<g label="...">`).
    """
    blocks = []
    raw_text = ""

    if ext in (".vsd", ".vsdx"):
        svg_content = _convert_visio_to_svg(filepath, ext)
        if svg_content and "<svg" in svg_content.lower():
            raw_text = svg_content
        else:
            raw_text = f"// Visio Diagram: {filename}\n// Vector conversion in progress or libvisio is parsing document."
    else:
        try:
            with open(filepath, "r", encoding="utf-8", errors="replace") as f:
                raw_text = f.read()
        except Exception as e:
            content = f"// Error reading diagram {filename}: {str(e)}"
            return content, [{"block_key": "diag_error", "title": "Error", "content": content, "order_index": 0}]

    if "<svg" in raw_text.lower():
        title_prefix = "Visio Diagram" if ext in (".vsd", ".vsdx") else "Vector Graphic"
        blocks.append({
            "block_key": "diag_main",
            "title": f"{title_prefix}: {filename}",
            "content": raw_text,
            "order_index": 0
        })

        g_pattern = re.compile(r'(<g\s+[^>]*id="([^"]+)"[^>]*>[\s\S]*?<\/g>)', re.IGNORECASE)
        matches = list(g_pattern.finditer(raw_text))
        if matches:
            idx = 1
            for m in matches[:15]:
                g_full = m.group(1).strip()
                g_id = m.group(2).strip()
                if "glyph" in g_id.lower() and idx > 3:
                    continue
                blocks.append({
                    "block_key": f"layer_{g_id.lower()}",
                    "title": f"Diagram Layer: {g_id}",
                    "content": g_full,
                    "order_index": idx
                })
                idx += 1

    if not blocks:
        blocks.append({
            "block_key": "diag_main",
            "title": f"Diagram: {filename}",
            "content": raw_text,
            "order_index": 0
        })

    return raw_text, blocks
