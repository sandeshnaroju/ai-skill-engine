"""
backend/artifacts/compiler/eda.py
Standard EDA document exporter.
Converts Canvas Circuit JSON format into standard EDA schematic & PCB JSON structures.
Compatible with standard EDA online and desktop editors.
"""
import json
import uuid
from typing import Dict, Any, List


def export_to_eda_pcb(circuit: Dict[str, Any]) -> Dict[str, Any]:
    """
    Converts Circuit JSON to standard EDA PCB format.
    EDA PCB format uses shapes array with item types:
    TRACK, PAD, VIA, COPPERAREA, TEXT, HOLE, ARC, CIRCLE, RECT, etc.
    """
    board = circuit.get("board", {})
    rules = circuit.get("rules", {})
    components = circuit.get("components", [])
    traces = circuit.get("traces", [])
    vias = circuit.get("vias", [])
    zones = circuit.get("zones", [])
    silkscreen = circuit.get("silkscreen", [])

    width_mm = float(board.get("width", 50.0))
    height_mm = float(board.get("height", 35.0))
    # EDA canvas uses 10 mil = 1 unit or direct pixel scale (10 mil ~ 0.254mm, or 1mm ~ 3.937 units)
    SCALE = 3.93701  # mm to EDA units (10 mils per unit)

    shapes: List[str] = []

    # 1. Board Outline (Layer 10 is BoardOutline / Edge.Cuts)
    w_u = width_mm * SCALE
    h_u = height_mm * SCALE
    shapes.append(f"TRACK~1~10~none~gnd~0 0 {w_u:.2f} 0 {w_u:.2f} {h_u:.2f} 0 {h_u:.2f} 0 0~gge1~0")

    # Layer mapping:
    # 1 = TopLayer (F.Cu), 2 = BottomLayer (B.Cu), 3 = TopSilk (F.SilkS), 4 = BottomSilk (B.SilkS),
    # 5 = TopPaste, 6 = BottomPaste, 7 = TopSolderMask, 8 = BottomSolderMask, 10 = BoardOutline
    LAYER_MAP = {
        "F.Cu": 1,
        "top": 1,
        "B.Cu": 2,
        "bottom": 2,
        "F.SilkS": 3,
        "B.SilkS": 4,
        "F.Paste": 5,
        "B.Paste": 6,
        "F.Mask": 7,
        "B.Mask": 8,
        "Edge.Cuts": 10,
    }

    # 2. Components & Footprint Pads
    for c_idx, comp in enumerate(components):
        ref = comp.get("ref", f"U{c_idx+1}")
        val = comp.get("value", "")
        pkg = comp.get("package", "SMD")
        c_pos = comp.get("position", {})
        cx = float(c_pos.get("x", 10.0)) * SCALE
        cy = float(c_pos.get("y", 10.0)) * SCALE
        rot = float(c_pos.get("rotation", 0))
        c_layer = LAYER_MAP.get(comp.get("layer", "F.Cu"), 1)
        c_id = f"gge_comp_{c_idx+1}"

        # Silkscreen Designator Text for component
        shapes.append(f"TEXT~N~{cx:.2f}~{cy - 10:.2f}~5~{rot}~{ref}~{ref}~center~3~{c_id}_ref~1~~1")

        # Pads
        pads = comp.get("pads", [])
        for p_idx, pad in enumerate(pads):
            p_num = str(pad.get("num", p_idx + 1))
            p_net = pad.get("net", "")
            px = float(pad.get("x", cx / SCALE)) * SCALE
            py = float(pad.get("y", cy / SCALE)) * SCALE
            pw = float(pad.get("w", 1.2)) * SCALE
            ph = float(pad.get("h", 1.2)) * SCALE
            p_type = pad.get("type", "smd")
            shape_type = "RECT" if p_type == "smd" else "ELLIPSE"
            drill = float(pad.get("drill", 0.8)) * SCALE if p_type == "tht" else 0
            pad_layer = c_layer if p_type == "smd" else 11  # 11 = Multi-layer

            pad_str = f"PAD~{shape_type}~{px:.2f}~{py:.2f}~{pw:.2f}~{ph:.2f}~{pad_layer}~{p_net}~{p_num}~{drill:.2f}~~0~{c_id}_p{p_idx+1}~0~{cx:.2f}~{cy:.2f}~0"
            shapes.append(pad_str)

    # 3. Copper Traces
    for t_idx, trace in enumerate(traces):
        net = trace.get("net", "")
        layer = LAYER_MAP.get(trace.get("layer", "F.Cu"), 1)
        width = float(trace.get("width", 0.3)) * SCALE
        segments = trace.get("segments", [])
        if len(segments) >= 2:
            pts = " ".join([f"{float(pt[0])*SCALE:.2f} {float(pt[1])*SCALE:.2f}" for pt in segments])
            shapes.append(f"TRACK~{width:.2f}~{layer}~{net}~{net}~{pts}~gge_tr_{t_idx+1}~0")

    # 4. Vias
    for v_idx, via in enumerate(vias):
        vx = float(via.get("x", 0)) * SCALE
        vy = float(via.get("y", 0)) * SCALE
        v_drill = float(via.get("drill", 0.3)) * SCALE
        v_dia = float(via.get("diameter", 0.6)) * SCALE
        v_net = via.get("net", "GND")
        shapes.append(f"VIA~{vx:.2f}~{vy:.2f}~{v_dia:.2f}~{v_net}~{v_drill:.2f}~gge_via_{v_idx+1}~0")

    # 5. Silkscreen Text
    for s_idx, silk in enumerate(silkscreen):
        sx = float(silk.get("x", 0)) * SCALE
        sy = float(silk.get("y", 0)) * SCALE
        stext = silk.get("text", "")
        srot = float(silk.get("rotation", 0))
        slayer = LAYER_MAP.get(silk.get("layer", "F.SilkS"), 3)
        ssize = float(silk.get("size", 1.5)) * SCALE
        shapes.append(f"TEXT~N~{sx:.2f}~{sy:.2f}~{ssize:.2f}~{srot}~{stext}~{stext}~center~{slayer}~gge_silk_{s_idx+1}~1~~1")

    # 6. Copper Pours / Zones
    for z_idx, zone in enumerate(zones):
        z_net = zone.get("net", "GND")
        z_layer = LAYER_MAP.get(zone.get("layer", "B.Cu"), 2)
        pour_pts = f"0 0 {w_u:.2f} 0 {w_u:.2f} {h_u:.2f} 0 {h_u:.2f} 0 0"
        shapes.append(f"COPPERAREA~10~{z_layer}~{z_net}~solid~{pour_pts}~gge_pour_{z_idx+1}~0.254~thermal~0")

    eda_doc = {
        "head": {
            "docType": "3",  # 3 = PCB document
            "editorVersion": "6.5.40",
            "c_para": {
                "package": "EDA PCB",
                "importFlag": 0,
                "originX": "0",
                "originY": "0"
            },
            "hasIdFlag": True,
            "uuid": str(uuid.uuid4())
        },
        "canvas": f"CAV~{w_u:.2f}~{h_u:.2f}~#000000~#FFFFFF~10~visible~10~mil~1~45~0 0~#3B82F6~0",
        "shape": shapes,
        "layers": [
            "1~TopLayer~#FF0000~true~true~true~",
            "2~BottomLayer~#0000FF~true~true~true~",
            "3~TopSilkLayer~#FFFF00~true~true~true~",
            "4~BottomSilkLayer~#66CCFF~true~true~true~",
            "5~TopPasteMaskLayer~#808080~true~false~true~",
            "6~BottomPasteMaskLayer~#800000~true~false~true~",
            "7~TopSolderMaskLayer~#800080~true~false~true~",
            "8~BottomSolderMaskLayer~#AA00FF~true~false~true~",
            "10~BoardOutline~#FF00FF~true~true~true~",
            "11~Multi-Layer~#C0C0C0~true~true~true~"
        ],
        "colors": {
            "solder_mask": board.get("solder_mask_color", "green"),
            "silkscreen": board.get("silkscreen_color", "white")
        }
    }
    return eda_doc


def export_to_eda_schematic(circuit: Dict[str, Any]) -> Dict[str, Any]:
    """Converts schematic section of Circuit JSON into standard EDA Schematic document format."""
    schem = circuit.get("schematic", {})
    symbols = schem.get("symbols", [])
    wires = schem.get("wires", [])

    SCALE = 10.0  # schematic grid scale

    shapes: List[str] = []

    # Map wires
    for w_idx, wire in enumerate(wires):
        net = wire.get("net", "")
        shapes.append(f"WIRE~1~#008800~{net}~10 10 50 10~gge_w_{w_idx+1}")

    # Map symbols
    for s_idx, sym in enumerate(symbols):
        ref = sym.get("ref", f"U{s_idx+1}")
        name = sym.get("name", "")
        sx = float(sym.get("x", 10)) * SCALE
        sy = float(sym.get("y", 10)) * SCALE
        pins = sym.get("pins", [])
        shapes.append(f"LIB~{sx:.1f}~{sy:.1f}~{ref}~{name}~{ref}~gge_sym_{s_idx+1}")
        for p_i, pin in enumerate(pins):
            p_name = pin if isinstance(pin, str) else pin.get("name", str(p_i+1))
            shapes.append(f"PIN~1~{sx:.1f}~{sy + (p_i*15):.1f}~10~0~{p_name}~{p_i+1}~gge_p_{s_idx+1}_{p_i+1}")

    return {
        "head": {
            "docType": "1",  # 1 = Schematic document
            "editorVersion": "6.5.40",
            "hasIdFlag": True,
            "uuid": str(uuid.uuid4())
        },
        "canvas": "CAV~1100~850~#FFFFFF~#CCCCCC~10~visible~10~inch~1~90~0 0~#008800~0",
        "shape": shapes
    }
