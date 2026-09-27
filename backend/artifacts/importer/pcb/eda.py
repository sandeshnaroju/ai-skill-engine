"""
backend/artifacts/importer/eda.py
Standard EDA document importer.
Parses EDA schematic & PCB JSON formats into Universal Canvas Circuit JSON format.
"""
import json
import re
from typing import Dict, Any, List


def parse_eda_file(filepath: str, raw_text: str) -> Dict[str, Any]:
    """
    Parses EDA JSON document into Canvas Circuit JSON blocks.
    """
    try:
        data = json.loads(raw_text)
    except Exception:
        data = {}

    head = data.get("head", {})
    shapes = data.get("shape", [])

    SCALE = 0.254  # 10 mil to mm (1 unit = 0.254 mm)

    components: List[Dict[str, Any]] = []
    traces: List[Dict[str, Any]] = []
    vias: List[Dict[str, Any]] = []
    silkscreen: List[Dict[str, Any]] = []
    board_width = 50.0
    board_height = 35.0

    for item in shapes:
        if not isinstance(item, str):
            continue
        parts = item.split("~")
        cmd = parts[0]

        if cmd == "TRACK":
            if len(parts) >= 6:
                try:
                    width = float(parts[1]) * SCALE
                    layer_num = parts[2]
                    net = parts[3]
                    layer_name = "Edge.Cuts" if layer_num == "10" else "B.Cu" if layer_num == "2" else "F.Cu"
                    coords_str = parts[5].strip().split()
                    coords = []
                    for i in range(0, len(coords_str), 2):
                        if i + 1 < len(coords_str):
                            coords.append([round(float(coords_str[i]) * SCALE, 2), round(float(coords_str[i+1]) * SCALE, 2)])

                    if layer_num == "10":
                        xs = [pt[0] for pt in coords]
                        ys = [pt[1] for pt in coords]
                        if xs and ys:
                            board_width = max(xs) - min(xs)
                            board_height = max(ys) - min(ys)
                    else:
                        traces.append({
                            "net": net if net != "none" else "NET_UNNAMED",
                            "layer": layer_name,
                            "width": round(width, 3),
                            "segments": coords
                        })
                except Exception:
                    pass

        elif cmd == "PAD":
            if len(parts) >= 10:
                try:
                    p_shape = parts[1]
                    px = round(float(parts[2]) * SCALE, 2)
                    py = round(float(parts[3]) * SCALE, 2)
                    pw = round(float(parts[4]) * SCALE, 2)
                    ph = round(float(parts[5]) * SCALE, 2)
                    p_net = parts[7]
                    p_num = parts[8]
                    p_drill = round(float(parts[9]) * SCALE, 2) if parts[9] else 0

                    pad_dict = {
                        "num": p_num,
                        "name": f"P{p_num}",
                        "type": "tht" if p_drill > 0 else "smd",
                        "x": px,
                        "y": py,
                        "w": pw,
                        "h": ph,
                        "net": p_net
                    }
                    if p_drill > 0:
                        pad_dict["drill"] = p_drill

                    if not components:
                        components.append({
                            "ref": "U1",
                            "value": "Imported Part",
                            "package": "SMD",
                            "position": {"x": px, "y": py, "rotation": 0},
                            "layer": "F.Cu",
                            "pads": [pad_dict]
                        })
                    else:
                        components[-1]["pads"].append(pad_dict)
                except Exception:
                    pass

        elif cmd == "VIA":
            if len(parts) >= 6:
                try:
                    vx = round(float(parts[1]) * SCALE, 2)
                    vy = round(float(parts[2]) * SCALE, 2)
                    vdia = round(float(parts[3]) * SCALE, 2)
                    vnet = parts[4]
                    vdrill = round(float(parts[5]) * SCALE, 2)
                    vias.append({
                        "net": vnet,
                        "x": vx,
                        "y": vy,
                        "drill": vdrill,
                        "diameter": vdia
                    })
                except Exception:
                    pass

        elif cmd == "TEXT":
            if len(parts) >= 8:
                try:
                    tx = round(float(parts[2]) * SCALE, 2)
                    ty = round(float(parts[3]) * SCALE, 2)
                    tsize = round(float(parts[4]) * SCALE, 2)
                    trot = float(parts[5])
                    tcontent = parts[6]
                    tlayer = parts[9] if len(parts) > 9 else "3"
                    layer_name = "B.SilkS" if tlayer == "4" else "F.SilkS"

                    if re.match(r'^[A-Z]+\d+$', tcontent):
                        components.append({
                            "ref": tcontent,
                            "value": "",
                            "package": "SMD",
                            "position": {"x": tx, "y": ty, "rotation": trot},
                            "layer": "F.Cu",
                            "pads": []
                        })
                    else:
                        silkscreen.append({
                            "layer": layer_name,
                            "text": tcontent,
                            "x": tx,
                            "y": ty,
                            "size": tsize,
                            "rotation": trot
                        })
                except Exception:
                    pass

    circuit_json = {
        "version": "1.0",
        "board": {
            "units": "mm",
            "width": max(board_width, 30.0),
            "height": max(board_height, 20.0),
            "layers": 2,
            "solder_mask_color": "green",
            "silkscreen_color": "white",
            "thickness": 1.6
        },
        "rules": {
            "min_trace_width": 0.254,
            "min_clearance": 0.20,
            "via_drill": 0.30,
            "via_diameter": 0.60
        },
        "components": components,
        "traces": traces,
        "vias": vias,
        "silkscreen": silkscreen
    }

    full_content = json.dumps(circuit_json, indent=2)

    blocks = [{
        "block_key": "main_pcb",
        "title": "Imported EDA PCB Layout",
        "content": full_content,
        "order_index": 0
    }]

    if components:
        blocks.append({
            "block_key": "sec_components",
            "title": f"BOM & Placements ({len(components)} parts)",
            "content": json.dumps(components, indent=2),
            "order_index": 1
        })
    if traces:
        blocks.append({
            "block_key": "sec_routing",
            "title": f"Copper Routing ({len(traces)} traces)",
            "content": json.dumps(traces, indent=2),
            "order_index": 2
        })

    return {
        "artifact_type": "pcb",
        "language": "json",
        "content": full_content,
        "blocks": blocks
    }
