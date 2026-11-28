"""
backend/artifacts/importer/pointcloud.py
Parser for Point Clouds & Reality Capture files (.ply, .las, .laz).
Uses laspy + lazrs + numpy for .las/.laz (with pure-Python struct fallback for uncompressed .las)
and header inspection for .ply (streamed directly to Three.js PLYLoader via media_url).
"""
import json
import math
import os
import struct
from typing import Any, Dict, List, Tuple

MAX_RENDER_POINTS = 250_000

ASPRS_CLASSES = {
    0: "Created / Never Classified",
    1: "Unclassified",
    2: "Ground",
    3: "Low Vegetation",
    4: "Medium Vegetation",
    5: "High Vegetation",
    6: "Building",
    7: "Low Point (Noise)",
    8: "Model Key-point",
    9: "Water",
    10: "Rail",
    11: "Road Surface",
    12: "Overlap Points",
    13: "Wire - Guard",
    14: "Wire - Conductor",
    15: "Transmission Tower",
    16: "Wire-structure Connector",
    17: "Bridge Deck",
    18: "High Noise",
}


def _parse_ply_header(filepath: str, display_filename: str) -> Dict[str, Any]:
    vertex_count = 0
    face_count = 0
    ply_format = "ascii"
    properties: List[str] = []
    has_color = False
    has_normals = False

    with open(filepath, "rb") as f:
        for _ in range(120):
            line_bytes = f.readline()
            if not line_bytes:
                break
            line = line_bytes.decode("ascii", errors="ignore").strip()
            if line == "end_header":
                break
            parts = line.split()
            if not parts:
                continue
            if parts[0] == "format" and len(parts) >= 2:
                ply_format = parts[1]
            elif parts[0] == "element" and len(parts) >= 3:
                if parts[1] == "vertex":
                    try:
                        vertex_count = int(parts[2])
                    except ValueError:
                        pass
                elif parts[1] == "face":
                    try:
                        face_count = int(parts[2])
                    except ValueError:
                        pass
            elif parts[0] == "property" and len(parts) >= 3:
                prop_name = parts[-1].lower()
                properties.append(prop_name)
                if prop_name in ("red", "green", "blue", "r", "g", "b"):
                    has_color = True
                if prop_name in ("nx", "ny", "nz"):
                    has_normals = True

    return {
        "format": "point_cloud",
        "sourceExt": ".ply",
        "filename": display_filename,
        "plyFormat": ply_format,
        "totalPoints": vertex_count,
        "renderedPoints": vertex_count,
        "faceCount": face_count,
        "hasColor": has_color,
        "hasNormals": has_normals,
        "properties": properties,
    }


def _parse_las_struct_fallback(filepath: str, display_filename: str) -> Dict[str, Any]:
    """Pure-Python struct parser for uncompressed .las (PDRF 0-3) when laspy is unavailable."""
    with open(filepath, "rb") as f:
        header = f.read(227)
        if len(header) < 227 or header[:4] != b"LASF":
            raise ValueError("Invalid LAS file header (missing LASF signature).")

        ver_major, ver_minor = struct.unpack_from("<BB", header, 24)
        offset_to_points, = struct.unpack_from("<I", header, 96)
        pdrf, = struct.unpack_from("<B", header, 104)
        record_len, = struct.unpack_from("<H", header, 105)
        legacy_count, = struct.unpack_from("<I", header, 107)
        sx, sy, sz, ox, oy, oz = struct.unpack_from("<dddddd", header, 131)
        max_x, min_x, max_y, min_y, max_z, min_z = struct.unpack_from("<dddddd", header, 179)

        total_points = legacy_count
        if total_points == 0 and ver_major == 1 and ver_minor >= 4:
            f.seek(247)
            ext_count_bytes = f.read(8)
            if len(ext_count_bytes) == 8:
                total_points, = struct.unpack("<Q", ext_count_bytes)

        stride = max(1, math.ceil(total_points / MAX_RENDER_POINTS)) if total_points > MAX_RENDER_POINTS else 1
        has_rgb = pdrf in (2, 3, 5, 7, 8, 10)
        rgb_offset = 20 if pdrf == 2 else (28 if pdrf in (3, 5) else None)

        positions: List[float] = []
        colors: List[int] = []
        intensities: List[float] = []
        classifications: List[int] = []
        class_counts: Dict[str, int] = {}

        f.seek(offset_to_points)
        max_intensity = 1.0
        raw_intensities: List[int] = []

        for idx in range(total_points):
            rec = f.read(record_len)
            if len(rec) < record_len:
                break
            if idx % stride != 0:
                continue
            ix, iy, iz, intensity = struct.unpack_from("<iiiH", rec, 0)
            cls_byte = rec[15] & 0x1F if len(rec) > 15 else 0
            x = round(ix * sx + ox, 4)
            y = round(iy * sy + oy, 4)
            z = round(iz * sz + oz, 4)
            positions.extend((x, y, z))
            raw_intensities.append(intensity)
            if intensity > max_intensity:
                max_intensity = float(intensity)
            classifications.append(cls_byte)
            k = str(cls_byte)
            class_counts[k] = class_counts.get(k, 0) + 1

            if has_rgb and rgb_offset is not None and len(rec) >= rgb_offset + 6:
                r16, g16, b16 = struct.unpack_from("<HHH", rec, rgb_offset)
                scale_c = 256 if (r16 > 255 or g16 > 255 or b16 > 255) else 1
                colors.extend((r16 // scale_c, g16 // scale_c, b16 // scale_c))

        intensities = [round(v / max_intensity, 4) for v in raw_intensities]

    return {
        "format": "point_cloud",
        "sourceExt": ".las",
        "filename": display_filename,
        "lasVersion": f"{ver_major}.{ver_minor}",
        "pointFormat": pdrf,
        "totalPoints": total_points,
        "renderedPoints": len(positions) // 3,
        "hasColor": has_rgb and len(colors) == len(positions),
        "bounds": {
            "minX": min_x,
            "maxX": max_x,
            "minY": min_y,
            "maxY": max_y,
            "minZ": min_z,
            "maxZ": max_z,
        },
        "classificationCounts": class_counts,
        "positions": positions,
        "colors": colors if has_rgb else [],
        "intensities": intensities,
        "classifications": classifications,
    }


def _parse_las_with_laspy(filepath: str, display_filename: str, ext: str) -> Dict[str, Any]:
    import laspy
    import numpy as np

    with laspy.open(filepath) as reader:
        header = reader.header
        total_points = int(header.point_count)
        las_version = f"{header.version.major}.{header.version.minor}"
        pdrf = int(header.point_format.id)
        mins = [float(v) for v in header.mins]
        maxs = [float(v) for v in header.maxs]

        las = reader.read()

    stride = max(1, math.ceil(total_points / MAX_RENDER_POINTS)) if total_points > MAX_RENDER_POINTS else 1

    xs = np.asarray(las.x[::stride], dtype=np.float64)
    ys = np.asarray(las.y[::stride], dtype=np.float64)
    zs = np.asarray(las.z[::stride], dtype=np.float64)

    coords = np.column_stack((np.round(xs, 4), np.round(ys, 4), np.round(zs, 4)))
    positions = coords.ravel().tolist()

    # Colors (16-bit in LAS -> 8-bit 0..255)
    colors: List[int] = []
    has_color = hasattr(las, "red") and hasattr(las, "green") and hasattr(las, "blue")
    if has_color:
        r = np.asarray(las.red[::stride], dtype=np.uint32)
        g = np.asarray(las.green[::stride], dtype=np.uint32)
        b = np.asarray(las.blue[::stride], dtype=np.uint32)
        if r.size and (r.max() > 255 or g.max() > 255 or b.max() > 255):
            r = r >> 8
            g = g >> 8
            b = b >> 8
        colors = np.column_stack((np.clip(r, 0, 255), np.clip(g, 0, 255), np.clip(b, 0, 255))).ravel().tolist()

    # Intensity (0..1)
    intensities: List[float] = []
    if hasattr(las, "intensity"):
        inten = np.asarray(las.intensity[::stride], dtype=np.float32)
        max_i = float(inten.max()) if inten.size and inten.max() > 0 else 1.0
        intensities = np.round(inten / max_i, 4).tolist()

    # ASPRS Classifications
    classifications: List[int] = []
    class_counts: Dict[str, int] = {}
    if hasattr(las, "classification"):
        cls_arr = np.asarray(las.classification[::stride], dtype=np.uint8)
        classifications = cls_arr.tolist()
        uniq, cnts = np.unique(cls_arr, return_counts=True)
        for u, c in zip(uniq.tolist(), cnts.tolist()):
            class_counts[str(u)] = int(c)

    return {
        "format": "point_cloud",
        "sourceExt": ext,
        "filename": display_filename,
        "lasVersion": las_version,
        "pointFormat": pdrf,
        "totalPoints": total_points,
        "renderedPoints": len(positions) // 3,
        "hasColor": has_color and len(colors) == len(positions),
        "bounds": {
            "minX": mins[0],
            "maxX": maxs[0],
            "minY": mins[1],
            "maxY": maxs[1],
            "minZ": mins[2],
            "maxZ": maxs[2],
        },
        "classificationCounts": class_counts,
        "positions": positions,
        "colors": colors,
        "intensities": intensities,
        "classifications": classifications,
    }


def parse_point_cloud(
    filepath: str, display_filename: str, raw_filename: str, ext: str
) -> Tuple[str, str, List[Dict[str, Any]]]:
    """
    Parses .ply, .las, or .laz files into (content_json, media_url, blocks).
    """
    media_url = f"/api/v1/files/download/{raw_filename}"

    if ext == ".ply":
        payload = _parse_ply_header(filepath, display_filename)
    else:
        try:
            payload = _parse_las_with_laspy(filepath, display_filename, ext)
        except ImportError:
            if ext == ".laz":
                raise RuntimeError("LAZ decompression requires 'laspy' and 'lazrs' packages.")
            payload = _parse_las_struct_fallback(filepath, display_filename)

    json_content = json.dumps(payload, ensure_ascii=False)

    blocks = [{
        "block_key": "point_cloud_main",
        "title": f"Point Cloud: {display_filename} ({payload.get('totalPoints', 0):,} pts)",
        "content": json_content,
        "order_index": 0,
    }]

    return json_content, media_url, blocks
