"""
backend/artifacts/importer/cad.py
Parsers for Computer-Aided Design (CAD) files:
- 2D CAD Drawings (.dxf, .dwg)
- 3D Solids & Meshes (.step, .stp, .stl, .obj, .iges, .igs, .ifc, .glb, .gltf)
"""
import re
from typing import Tuple, List, Dict, Any


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
        # Truncate at the first EOF marker — some DXF generators embed a second
        # copy of the drawing after EOF (e.g. thumbnail previews, redundant exports).
        # Keeping only the first canonical DXF body prevents duplicate section blocks
        # and avoids doubling entity counts in the viewer.
        eof_match = re.search(r'\n0\s*\n\s*EOF\s*(\n|$)', raw_text)
        if eof_match:
            raw_text = raw_text[:eof_match.end()].rstrip()

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

            # Track seen section names to deduplicate block keys
            seen_section_keys: dict = {}

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

                # Deduplicate block keys: if the same section appears again suffix with _2, _3 …
                base_key = f"sec_{sec_name.lower()}"
                count = seen_section_keys.get(base_key, 0) + 1
                seen_section_keys[base_key] = count
                block_key = base_key if count == 1 else f"{base_key}_{count}"

                blocks.append({
                    "block_key": block_key,
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
