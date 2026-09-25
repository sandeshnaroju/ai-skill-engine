"""
backend/artifacts/importer/pcb.py
Parser for electronic circuit and PCB design files (.pcb.json, .kicad_pcb, .gbr, .gerber, .drl).
Extracts board configuration, components/BOM, traces, nets, vias, and silkscreen into modular artifact blocks.
"""
import json
import re
from typing import Tuple, List, Dict, Any


def _parse_pcb_file(filepath: str, filename: str, ext: str) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Parses PCB files into full JSON content and modular artifact blocks.
    Returns: (full_content, blocks)
    """
    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            raw_text = f.read()
    except Exception as e:
        raw_text = f'{{"error": "Failed to read PCB file: {str(e)}"}}'

    blocks: List[Dict[str, Any]] = []

    # Case A: Circuit JSON (.pcb.json or .json)
    if ext in (".json", ".pcb.json") or raw_text.strip().startswith("{"):
        try:
            data = json.loads(raw_text)
            full_content = json.dumps(data, indent=2)

            # 1. Board Specs Block
            board_info = data.get("board", {})
            rules_info = data.get("rules", {})
            blocks.append({
                "block_key": "board_specs",
                "title": f"Board Specs ({board_info.get('width', 50)}x{board_info.get('height', 35)}mm, {board_info.get('layers', 2)}-Layer)",
                "content": json.dumps({"board": board_info, "rules": rules_info}, indent=2),
                "order_index": 0
            })

            # 2. Components & Footprints Block
            components = data.get("components", [])
            blocks.append({
                "block_key": "components",
                "title": f"Component Placement ({len(components)} parts)",
                "content": json.dumps({"components": components}, indent=2),
                "order_index": 1
            })

            # 3. Traces & Routing Block
            traces = data.get("traces", [])
            vias = data.get("vias", [])
            blocks.append({
                "block_key": "routing",
                "title": f"Copper Routing ({len(traces)} traces, {len(vias)} vias)",
                "content": json.dumps({"traces": traces, "vias": vias, "zones": data.get("zones", [])}, indent=2),
                "order_index": 2
            })

            # 4. Schematic Block (if present)
            if "schematic" in data:
                blocks.append({
                    "block_key": "schematic",
                    "title": "Circuit Schematic Netlist",
                    "content": json.dumps({"schematic": data["schematic"]}, indent=2),
                    "order_index": 3
                })

            return full_content, blocks
        except Exception:
            pass

    # Case B: KiCad PCB (.kicad_pcb S-Expression)
    if "(kicad_pcb" in raw_text or ext == ".kicad_pcb":
        full_content = raw_text
        blocks.append({
            "block_key": "kicad_layout",
            "title": f"KiCad PCB Layout ({filename})",
            "content": raw_text,
            "order_index": 0
        })
        return full_content, blocks

    # Case C: Gerber / Drill / Raw Text
    full_content = raw_text
    blocks.append({
        "block_key": "pcb_raw_source",
        "title": f"PCB Source ({filename})",
        "content": raw_text[:50000],
        "order_index": 0
    })
    return full_content, blocks
