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
        blocks.append({
            "block_key": "diag_main",
            "title": f"Vector Graphic: {filename}",
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
