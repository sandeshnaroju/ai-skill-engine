"""
backend/artifacts/compiler/pcb.py
Production export generator for electronic circuits and PCB designs:
- Gerber RS-274X layer files + Excellon drill archive (.zip) for JLCPCB, PCBWay, and OSH Park
- Native KiCad 7/8 board file (.kicad_pcb)
- SMT Bill of Materials (.csv)
- SMT Centroid Pick-and-Place list (.csv)
"""
import io
import json
import zipfile
from typing import Tuple, Dict, Any, List


def parse_circuit_data(content: str) -> Dict[str, Any]:
    """Safely parse Circuit JSON content."""
    fallback = {
        "board": {"width": 50.0, "height": 35.0, "layers": 2, "corner_radius": 2.0},
        "components": [],
        "traces": [],
        "vias": [],
        "silkscreen": []
    }
    if not content:
        return fallback
    try:
        data = json.loads(content)
        return {**fallback, **data, "board": {**fallback["board"], **(data.get("board") or {})}}
    except Exception:
        return fallback


def generate_gerber_rs274x_header() -> str:
    """Standard RS-274X Gerber header with mm units and leading zero suppression."""
    return (
        "%FSLAX34Y34*%\n"
        "%MOMM*%\n"
        "%LPD*%\n"
        "%ADD10C,0.254*%\n"
        "%ADD11R,1.000X1.400*%\n"
        "%ADD12C,0.600*%\n"
        "%ADD13C,0.150*%\n"
    )


def compile_to_gerber_zip(content: str, base_name: str = "board") -> bytes:
    """
    Generates a full JLCPCB / PCBWay compliant Gerber & Drill ZIP archive.
    """
    data = parse_circuit_data(content)
    board = data.get("board", {})
    w = float(board.get("width", 50.0))
    h = float(board.get("height", 35.0))
    components = data.get("components", [])
    traces = data.get("traces", [])
    vias = data.get("vias", [])
    silkscreen = data.get("silkscreen", [])

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        # 1. Board Outline (Edge.Cuts -> .gko / .gm1)
        gko_lines = [
            generate_gerber_rs274x_header(),
            "G04 Layer: Edge.Cuts / Board Outline*",
            "D10*",
            f"X0Y0D02*",
            f"X{int(w*10000)}Y0D01*",
            f"X{int(w*10000)}Y{int(h*10000)}D01*",
            f"X0Y{int(h*10000)}D01*",
            f"X0Y0D01*",
            "M02*"
        ]
        zf.writestr(f"{base_name}-Edge_Cuts.gko", "\n".join(gko_lines))

        # 2. Top Copper (F.Cu -> .gtl)
        gtl_lines = [
            generate_gerber_rs274x_header(),
            "G04 Layer: F.Cu / Top Copper*",
            "D10*"
        ]
        for t in traces:
            if t.get("layer") != "B.Cu":
                segs = t.get("segments", [])
                for idx, pt in enumerate(segs):
                    op = "D02*" if idx == 0 else "D01*"
                    gtl_lines.append(f"X{int(pt[0]*10000)}Y{int(pt[1]*10000)}{op}")

        # Top Pads flash
        gtl_lines.append("D11*")
        for c in components:
            if c.get("layer", "F.Cu") == "F.Cu":
                for p in c.get("pads", []):
                    px = p.get("x", c.get("position", {}).get("x", 0))
                    py = p.get("y", c.get("position", {}).get("y", 0))
                    gtl_lines.append(f"X{int(px*10000)}Y{int(py*10000)}D03*")

        gtl_lines.append("M02*")
        zf.writestr(f"{base_name}-F_Cu.gtl", "\n".join(gtl_lines))

        # 3. Bottom Copper (B.Cu -> .gbl)
        gbl_lines = [
            generate_gerber_rs274x_header(),
            "G04 Layer: B.Cu / Bottom Copper*",
            "D10*"
        ]
        for t in traces:
            if t.get("layer") == "B.Cu":
                segs = t.get("segments", [])
                for idx, pt in enumerate(segs):
                    op = "D02*" if idx == 0 else "D01*"
                    gbl_lines.append(f"X{int(pt[0]*10000)}Y{int(pt[1]*10000)}{op}")
        gbl_lines.append("M02*")
        zf.writestr(f"{base_name}-B_Cu.gbl", "\n".join(gbl_lines))

        # 4. Top Silkscreen (F.SilkS -> .gto)
        gto_lines = [
            generate_gerber_rs274x_header(),
            "G04 Layer: F.SilkS / Top Silkscreen*",
            "D13*"
        ]
        for c in components:
            pos = c.get("position", {})
            cx, cy = pos.get("x", 0), pos.get("y", 0)
            cw = c.get("width", 4.0) / 2
            ch = c.get("height", 4.0) / 2
            gto_lines.append(f"X{int((cx-cw)*10000)}Y{int((cy-ch)*10000)}D02*")
            gto_lines.append(f"X{int((cx+cw)*10000)}Y{int((cy-ch)*10000)}D01*")
            gto_lines.append(f"X{int((cx+cw)*10000)}Y{int((cy+ch)*10000)}D01*")
            gto_lines.append(f"X{int((cx-cw)*10000)}Y{int((cy+ch)*10000)}D01*")
            gto_lines.append(f"X{int((cx-cw)*10000)}Y{int((cy-ch)*10000)}D01*")
        gto_lines.append("M02*")
        zf.writestr(f"{base_name}-F_SilkS.gto", "\n".join(gto_lines))

        # 5. Top Solder Mask (F.Mask -> .gts)
        gts_lines = [
            generate_gerber_rs274x_header(),
            "G04 Layer: F.Mask / Top Solder Mask*",
            "D11*"
        ]
        for c in components:
            for p in c.get("pads", []):
                px = p.get("x", c.get("position", {}).get("x", 0))
                py = p.get("y", c.get("position", {}).get("y", 0))
                gts_lines.append(f"X{int(px*10000)}Y{int(py*10000)}D03*")
        gts_lines.append("M02*")
        zf.writestr(f"{base_name}-F_Mask.gts", "\n".join(gts_lines))

        # 5b. Top Solder Paste / SMT Stencil (F.Paste -> .gtp)
        gtp_lines = [
            generate_gerber_rs274x_header(),
            "G04 Layer: F.Paste / Top Solder Paste (SMT Stencil)*",
            "D11*"
        ]
        for c in components:
            if c.get("layer", "F.Cu") == "F.Cu":
                for p in c.get("pads", []):
                    if p.get("type", "smd") == "smd":
                        px = p.get("x", c.get("position", {}).get("x", 0))
                        py = p.get("y", c.get("position", {}).get("y", 0))
                        gtp_lines.append(f"X{int(px*10000)}Y{int(py*10000)}D03*")
        gtp_lines.append("M02*")
        zf.writestr(f"{base_name}-F_Paste.gtp", "\n".join(gtp_lines))

        # 6. Excellon NC Drill File (.drl)
        drl_lines = [
            "M48",
            "METRIC,TZ",
            "FMAT,2",
            "T1C0.300",
            "%",
            "T1"
        ]
        for v in vias:
            drl_lines.append(f"X{int(v.get('x', 0)*1000)}Y{int(v.get('y', 0)*1000)}")
        drl_lines.append("M30")
        zf.writestr(f"{base_name}-Drill.drl", "\n".join(drl_lines))

        # 7. Bill of Materials (.csv)
        bom_csv = compile_to_bom_csv(content)
        zf.writestr(f"{base_name}-BOM.csv", bom_csv)

        # 8. Centroid Pick & Place (.csv)
        cpl_csv = compile_to_centroid_csv(content)
        zf.writestr(f"{base_name}-CPL.csv", cpl_csv)

    zip_buffer.seek(0)
    return zip_buffer.getvalue()


def compile_to_kicad_pcb(content: str) -> str:
    """Converts Circuit JSON to a native KiCad 7/8 .kicad_pcb S-Expression file."""
    data = parse_circuit_data(content)
    board = data.get("board", {})
    w = float(board.get("width", 50.0))
    h = float(board.get("height", 35.0))
    components = data.get("components", [])
    traces = data.get("traces", [])
    vias = data.get("vias", [])

    lines = [
        '(kicad_pcb (version 20221018) (generator "AI Skill Engine")',
        '  (general',
        f'    (thickness {board.get("thickness", 1.6)})',
        '  )',
        '  (layers',
        '    (0 "F.Cu" signal)',
        '    (31 "B.Cu" signal)',
        '    (36 "B.SilkS" user "B.Silkscreen")',
        '    (37 "F.SilkS" user "F.Silkscreen")',
        '    (38 "B.Mask" user)',
        '    (39 "F.Mask" user)',
        '    (44 "Edge.Cuts" user)',
        '  )',
        '  (setup',
        '    (pad_to_mask_clearance 0.05)',
        '    (pcbplotparams',
        '      (layerselection 0x00010fc_ffffffff)',
        '      (plotframeref false)',
        '    )',
        '  )'
    ]

    # Board Outline (Edge.Cuts)
    lines.append(f'  (gr_line (start 0 0) (end {w} 0) (layer "Edge.Cuts") (width 0.15))')
    lines.append(f'  (gr_line (start {w} 0) (end {w} {h}) (layer "Edge.Cuts") (width 0.15))')
    lines.append(f'  (gr_line (start {w} {h}) (end 0 {h}) (layer "Edge.Cuts") (width 0.15))')
    lines.append(f'  (gr_line (start 0 {h}) (end 0 0) (layer "Edge.Cuts") (width 0.15))')

    # Components / Footprints
    for c in components:
        ref = c.get("ref", "U1")
        val = c.get("value", "Part")
        pkg = c.get("package", "SMD")
        pos = c.get("position", {})
        px, py = pos.get("x", 0), pos.get("y", 0)
        rot = pos.get("rotation", 0)
        layer = c.get("layer", "F.Cu")

        lines.append(f'  (footprint "{pkg}" (layer "{layer}") (at {px} {py} {rot})')
        lines.append(f'    (fp_text reference "{ref}" (at 0 -2.5) (layer "F.SilkS") (effects (font (size 1 1) (thickness 0.15))))')
        lines.append(f'    (fp_text value "{val}" (at 0 2.5) (layer "F.Fab") (effects (font (size 1 1) (thickness 0.15))))')

        for pad in c.get("pads", []):
            pnum = pad.get("num", "1")
            pname = pad.get("name", "")
            pw = pad.get("w", 1.0)
            ph = pad.get("h", 1.4)
            p_rel_x = pad.get("x", px) - px
            p_rel_y = pad.get("y", py) - py
            ptype = "smd" if pad.get("type") == "smd" else "thru_hole"
            lines.append(f'    (pad "{pnum}" {ptype} rect (at {p_rel_x} {p_rel_y}) (size {pw} {ph}) (layers "{layer}" "F.Paste" "F.Mask"))')
        lines.append('  )')

    # Traces (Segments)
    for t in traces:
        layer = t.get("layer", "F.Cu")
        width = t.get("width", 0.3)
        segs = t.get("segments", [])
        for i in range(len(segs) - 1):
            p1, p2 = segs[i], segs[i + 1]
            lines.append(f'  (segment (start {p1[0]} {p1[1]}) (end {p2[0]} {p2[1]}) (width {width}) (layer "{layer}") (net 0))')

    # Vias
    for v in vias:
        vx, vy = v.get("x", 0), v.get("y", 0)
        dia = v.get("diameter", 0.6)
        drill = v.get("drill", 0.3)
        lines.append(f'  (via (at {vx} {vy}) (size {dia}) (drill {drill}) (layers "F.Cu" "B.Cu"))')

    lines.append(')')
    return "\n".join(lines)


def compile_to_bom_csv(content: str) -> str:
    """Generates standard SMT Bill of Materials (BOM) CSV."""
    data = parse_circuit_data(content)
    components = data.get("components", [])

    rows = ["Designator,Value,Package,Quantity,Description,LCSC Part Number"]
    # Group components by value & package
    grouped: Dict[str, Dict[str, Any]] = {}
    for c in components:
        key = f"{c.get('value', '')}_{c.get('package', '')}"
        if key not in grouped:
            grouped[key] = {
                "designators": [],
                "value": c.get("value", ""),
                "package": c.get("package", ""),
                "description": c.get("description", "Component"),
                "lcsc_part": c.get("lcsc_part", "")
            }
        grouped[key]["designators"].append(c.get("ref", ""))

    for item in grouped.values():
        refs_str = " ".join(item["designators"])
        rows.append(f'"{refs_str}","{item["value"]}","{item["package"]}",{len(item["designators"])},"{item["description"]}","{item["lcsc_part"]}"')

    return "\n".join(rows)


def compile_to_centroid_csv(content: str) -> str:
    """Generates SMT Pick-and-Place Centroid (CPL) CSV."""
    data = parse_circuit_data(content)
    components = data.get("components", [])

    rows = ["Designator,Val,Package,Mid X,Mid Y,Rotation,Layer"]
    for c in components:
        ref = c.get("ref", "U1")
        val = c.get("value", "")
        pkg = c.get("package", "SMD")
        pos = c.get("position", {})
        mx = pos.get("x", 0)
        my = pos.get("y", 0)
        rot = pos.get("rotation", 0)
        layer = "Top" if c.get("layer", "F.Cu") == "F.Cu" else "Bottom"
        rows.append(f'"{ref}","{val}","{pkg}",{mx}mm,{my}mm,{rot},{layer}')

    return "\n".join(rows)
