"""
backend/artifacts/importer/bcf.py
Parser for BIM Collaboration Format (.bcf / .bcfzip) archives (BCF 2.0, 2.1, 3.0).
Unpacks XML markups, viewpoints (.bcfv), comments, and base64 snapshots into a
normalized JSON payload for the frontend BcfViewer.
"""
import base64
import json
import os
import posixpath
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple


MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024  # 5 MB safety cap per snapshot


def _strip_ns(tag: str) -> str:
    if "}" in tag:
        return tag.split("}", 1)[1]
    return tag


def _find_child(elem: Optional[ET.Element], name: str) -> Optional[ET.Element]:
    if elem is None:
        return None
    target = name.lower()
    for child in elem:
        if _strip_ns(child.tag).lower() == target:
            return child
    return None


def _find_children(elem: Optional[ET.Element], name: str) -> List[ET.Element]:
    if elem is None:
        return []
    target = name.lower()
    return [c for c in elem if _strip_ns(c.tag).lower() == target]


def _child_text(elem: Optional[ET.Element], name: str, default: str = "") -> str:
    child = _find_child(elem, name)
    if child is not None and child.text:
        return child.text.strip()
    return default


def _attr_ci(elem: Optional[ET.Element], name: str, default: str = "") -> str:
    if elem is None:
        return default
    target = name.lower()
    for k, v in elem.attrib.items():
        if k.lower() == target:
            return (v or "").strip()
    return default


def _parse_xyz(elem: Optional[ET.Element]) -> Optional[Dict[str, float]]:
    if elem is None:
        return None
    try:
        x = float(_child_text(elem, "X", "0"))
        y = float(_child_text(elem, "Y", "0"))
        z = float(_child_text(elem, "Z", "0"))
        return {"x": x, "y": y, "z": z}
    except (TypeError, ValueError):
        return None


def _parse_float(val: str) -> Optional[float]:
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def _parse_int(val: str) -> Optional[int]:
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def _read_zip_xml(zf: zipfile.ZipFile, member_name: str) -> Optional[ET.Element]:
    try:
        raw = zf.read(member_name)
        return ET.fromstring(raw)
    except Exception:
        return None


def _read_snapshot_data_url(zf: zipfile.ZipFile, member_name: str) -> Optional[str]:
    try:
        info = zf.getinfo(member_name)
        if info.file_size > MAX_SNAPSHOT_BYTES:
            return None
        raw = zf.read(member_name)
        ext = os.path.splitext(member_name)[1].lower().lstrip(".")
        mime = "image/jpeg" if ext in ("jpg", "jpeg") else ("image/webp" if ext == "webp" else "image/png")
        b64 = base64.b64encode(raw).decode("ascii")
        return f"data:{mime};base64,{b64}"
    except Exception:
        return None


def _parse_viewpoint_xml(root: Optional[ET.Element]) -> Dict[str, Any]:
    if root is None:
        return {}

    vp_data: Dict[str, Any] = {
        "guid": _attr_ci(root, "Guid"),
        "cameraType": None,
        "camera": None,
        "selection": [],
        "exceptions": [],
        "defaultVisibility": True,
        "coloring": [],
        "clippingPlanesCount": 0,
        "linesCount": 0,
    }

    persp = _find_child(root, "PerspectiveCamera")
    ortho = _find_child(root, "OrthogonalCamera")
    cam_elem = persp if persp is not None else ortho
    if cam_elem is not None:
        vp_data["cameraType"] = "perspective" if persp is not None else "orthogonal"
        cam_obj: Dict[str, Any] = {
            "viewPoint": _parse_xyz(_find_child(cam_elem, "CameraViewPoint")),
            "direction": _parse_xyz(_find_child(cam_elem, "CameraDirection")),
            "upVector": _parse_xyz(_find_child(cam_elem, "CameraUpVector")),
        }
        if persp is not None:
            cam_obj["fieldOfView"] = _parse_float(_child_text(cam_elem, "FieldOfView"))
        else:
            cam_obj["viewToWorldScale"] = _parse_float(_child_text(cam_elem, "ViewToWorldScale"))
        aspect = _parse_float(_child_text(cam_elem, "AspectRatio"))
        if aspect is not None:
            cam_obj["aspectRatio"] = aspect
        vp_data["camera"] = cam_obj

    comps = _find_child(root, "Components")
    if comps is not None:
        sel_elem = _find_child(comps, "Selection")
        if sel_elem is not None:
            for c in _find_children(sel_elem, "Component"):
                vp_data["selection"].append({
                    "ifcGuid": _attr_ci(c, "IfcGuid"),
                    "originatingSystem": _child_text(c, "OriginatingSystem"),
                    "authoringToolId": _child_text(c, "AuthoringToolId"),
                })

        vis_elem = _find_child(comps, "Visibility")
        if vis_elem is not None:
            dv = _attr_ci(vis_elem, "DefaultVisibility", "true").lower()
            vp_data["defaultVisibility"] = dv != "false"
            exc_elem = _find_child(vis_elem, "Exceptions")
            if exc_elem is not None:
                for c in _find_children(exc_elem, "Component"):
                    vp_data["exceptions"].append({
                        "ifcGuid": _attr_ci(c, "IfcGuid"),
                        "originatingSystem": _child_text(c, "OriginatingSystem"),
                        "authoringToolId": _child_text(c, "AuthoringToolId"),
                    })

        col_elem = _find_child(comps, "Coloring")
        if col_elem is not None:
            for c_group in _find_children(col_elem, "Color"):
                hex_col = _attr_ci(c_group, "Color")
                ifc_guids = []
                for comp in _find_children(c_group, "Component") + _find_children(_find_child(c_group, "Components"), "Component"):
                    g = _attr_ci(comp, "IfcGuid")
                    if g:
                        ifc_guids.append(g)
                if hex_col or ifc_guids:
                    vp_data["coloring"].append({
                        "color": hex_col,
                        "ifcGuids": ifc_guids,
                    })

    clip_elem = _find_child(root, "ClippingPlanes")
    if clip_elem is not None:
        vp_data["clippingPlanesCount"] = len(_find_children(clip_elem, "ClippingPlane"))

    lines_elem = _find_child(root, "Lines")
    if lines_elem is not None:
        vp_data["linesCount"] = len(_find_children(lines_elem, "Line"))

    return vp_data


def _is_overdue(due_date_str: str, status: str) -> bool:
    if not due_date_str:
        return False
    st = (status or "").lower()
    if any(k in st for k in ("closed", "resolved", "done", "complete")):
        return False
    try:
        clean = due_date_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(clean)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt < datetime.now(timezone.utc)
    except Exception:
        return False


def parse_bcf_archive(filepath: str, display_filename: str) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Unpacks a .bcf / .bcfzip archive and returns (json_content, blocks).
    """
    if not zipfile.is_zipfile(filepath):
        raise ValueError(f"'{display_filename}' is not a valid BCF ZIP archive.")

    with zipfile.ZipFile(filepath, "r") as zf:
        # Case-insensitive lookup map for archive members
        names = [n for n in zf.namelist() if not n.endswith("/")]
        ci_map: Dict[str, str] = {n.lower(): n for n in names}

        # 1. Version
        version_id = "2.1"
        ver_key = next((k for k in ci_map if k.endswith("bcf.version")), None)
        if ver_key:
            ver_root = _read_zip_xml(zf, ci_map[ver_key])
            if ver_root is not None:
                version_id = _attr_ci(ver_root, "VersionId") or _child_text(ver_root, "DetailedVersion") or "2.1"

        # 2. Project info
        project_info: Dict[str, Any] = {
            "projectId": "",
            "name": os.path.splitext(display_filename)[0],
        }
        proj_key = next((k for k in ci_map if k.endswith("project.bcfp")), None)
        if proj_key:
            proj_root = _read_zip_xml(zf, ci_map[proj_key])
            if proj_root is not None:
                proj_elem = _find_child(proj_root, "Project") or proj_root
                pid = _attr_ci(proj_elem, "ProjectId")
                pname = _child_text(proj_elem, "Name")
                if pid:
                    project_info["projectId"] = pid
                if pname:
                    project_info["name"] = pname

        # 3. Discover topic markups
        markup_keys = sorted([k for k in ci_map if posixpath.basename(k) == "markup.bcf"])
        topics: List[Dict[str, Any]] = []

        for idx_num, mk_lower in enumerate(markup_keys, start=1):
            mk_real = ci_map[mk_lower]
            topic_dir_lower = posixpath.dirname(mk_lower)
            mk_root = _read_zip_xml(zf, mk_real)
            if mk_root is None:
                continue

            # Header files (IFC model references)
            header_files: List[Dict[str, Any]] = []
            header_elem = _find_child(mk_root, "Header")
            if header_elem is not None:
                files_parent = _find_child(header_elem, "Files") or header_elem
                for f_elem in _find_children(files_parent, "File"):
                    header_files.append({
                        "filename": _child_text(f_elem, "Filename"),
                        "date": _child_text(f_elem, "Date"),
                        "reference": _child_text(f_elem, "Reference"),
                        "ifcProject": _attr_ci(f_elem, "IfcProject"),
                        "ifcSpatialStructureElement": _attr_ci(f_elem, "IfcSpatialStructureElement"),
                        "isExternal": _attr_ci(f_elem, "isExternal", "true").lower() == "true",
                    })

            topic_elem = _find_child(mk_root, "Topic")
            if topic_elem is None:
                continue

            topic_guid = _attr_ci(topic_elem, "Guid") or posixpath.basename(topic_dir_lower) or f"topic-{idx_num}"
            topic_type = _attr_ci(topic_elem, "TopicType") or "Issue"
            topic_status = _attr_ci(topic_elem, "TopicStatus") or "Open"

            # Labels (BCF 2.1 <Labels>text</Labels> repeated, or BCF 3.0 <Labels><Label>text</Label></Labels>)
            labels: List[str] = []
            for lbl_elem in _find_children(topic_elem, "Labels"):
                nested = _find_children(lbl_elem, "Label")
                if nested:
                    for n_lbl in nested:
                        if n_lbl.text and n_lbl.text.strip():
                            labels.append(n_lbl.text.strip())
                elif lbl_elem.text and lbl_elem.text.strip():
                    labels.append(lbl_elem.text.strip())

            # ReferenceLinks
            ref_links: List[str] = []
            for rl_elem in _find_children(topic_elem, "ReferenceLink"):
                if rl_elem.text and rl_elem.text.strip():
                    ref_links.append(rl_elem.text.strip())
            rl_parent = _find_child(topic_elem, "ReferenceLinks")
            if rl_parent is not None:
                for rl_elem in _find_children(rl_parent, "ReferenceLink"):
                    if rl_elem.text and rl_elem.text.strip():
                        ref_links.append(rl_elem.text.strip())

            # Comments (either direct children of Markup or inside <Comments> in BCF 3.0)
            comment_elems = _find_children(mk_root, "Comment")
            comments_parent = _find_child(mk_root, "Comments")
            if comments_parent is not None:
                comment_elems.extend(_find_children(comments_parent, "Comment"))

            comments: List[Dict[str, Any]] = []
            for c_elem in comment_elems:
                vp_ref = _find_child(c_elem, "Viewpoint")
                comments.append({
                    "guid": _attr_ci(c_elem, "Guid"),
                    "date": _child_text(c_elem, "Date"),
                    "author": _child_text(c_elem, "Author"),
                    "comment": _child_text(c_elem, "Comment"),
                    "viewpointGuid": _attr_ci(vp_ref, "Guid") if vp_ref is not None else "",
                })
            comments.sort(key=lambda c: c.get("date") or "")

            # Viewpoints (BCF 3.0 <Topic><Viewpoints><ViewPoint Guid="..."> or BCF 2.1 <Markup><Viewpoints Guid="...">)
            vp_elems = _find_children(mk_root, "Viewpoints")
            topic_vps = _find_child(topic_elem, "Viewpoints")
            if topic_vps is not None:
                vp_elems = _find_children(topic_vps, "ViewPoint")
            elif vp_elems and _attr_ci(vp_elems[0], "Guid") == "" and _find_children(vp_elems[0], "ViewPoint"):
                nested_vps = _find_children(vp_elems[0], "ViewPoint")
                if nested_vps and (_attr_ci(nested_vps[0], "Guid") or _find_child(nested_vps[0], "Viewpoint") is not None):
                    vp_elems = nested_vps

            viewpoints: List[Dict[str, Any]] = []
            for vp_e in vp_elems:
                vp_guid = _attr_ci(vp_e, "Guid")
                vp_file = _child_text(vp_e, "Viewpoint")
                snap_file = _child_text(vp_e, "Snapshot")
                vp_index = _parse_int(_child_text(vp_e, "Index"))

                vp_parsed: Dict[str, Any] = {}
                if vp_file:
                    vp_path_lower = posixpath.normpath(posixpath.join(topic_dir_lower, vp_file.lower()))
                    if vp_path_lower in ci_map:
                        vp_parsed = _parse_viewpoint_xml(_read_zip_xml(zf, ci_map[vp_path_lower]))

                snap_data_url = None
                if snap_file:
                    snap_path_lower = posixpath.normpath(posixpath.join(topic_dir_lower, snap_file.lower()))
                    if snap_path_lower in ci_map:
                        snap_data_url = _read_snapshot_data_url(zf, ci_map[snap_path_lower])

                viewpoints.append({
                    "guid": vp_guid or vp_parsed.get("guid") or "",
                    "index": vp_index,
                    "viewpointFile": vp_file,
                    "snapshotFile": snap_file,
                    "snapshotDataUrl": snap_data_url,
                    "cameraType": vp_parsed.get("cameraType"),
                    "camera": vp_parsed.get("camera"),
                    "selection": vp_parsed.get("selection", []),
                    "exceptions": vp_parsed.get("exceptions", []),
                    "defaultVisibility": vp_parsed.get("defaultVisibility", True),
                    "coloring": vp_parsed.get("coloring", []),
                    "clippingPlanesCount": vp_parsed.get("clippingPlanesCount", 0),
                    "linesCount": vp_parsed.get("linesCount", 0),
                })

            # Fallback for BCF 2.0 archives without explicit <Viewpoints> entries
            if not viewpoints:
                fallback_vp_key = posixpath.normpath(posixpath.join(topic_dir_lower, "viewpoint.bcfv"))
                fallback_snap_key = next(
                    (
                        posixpath.normpath(posixpath.join(topic_dir_lower, s))
                        for s in ("snapshot.png", "snapshot.jpg", "snapshot.jpeg")
                        if posixpath.normpath(posixpath.join(topic_dir_lower, s)) in ci_map
                    ),
                    None,
                )
                if fallback_vp_key in ci_map or fallback_snap_key:
                    vp_parsed = _parse_viewpoint_xml(_read_zip_xml(zf, ci_map[fallback_vp_key])) if fallback_vp_key in ci_map else {}
                    snap_data_url = _read_snapshot_data_url(zf, ci_map[fallback_snap_key]) if fallback_snap_key else None
                    viewpoints.append({
                        "guid": vp_parsed.get("guid") or f"{topic_guid}-vp",
                        "index": 0,
                        "viewpointFile": "viewpoint.bcfv" if fallback_vp_key in ci_map else "",
                        "snapshotFile": posixpath.basename(fallback_snap_key) if fallback_snap_key else "",
                        "snapshotDataUrl": snap_data_url,
                        "cameraType": vp_parsed.get("cameraType"),
                        "camera": vp_parsed.get("camera"),
                        "selection": vp_parsed.get("selection", []),
                        "exceptions": vp_parsed.get("exceptions", []),
                        "defaultVisibility": vp_parsed.get("defaultVisibility", True),
                        "coloring": vp_parsed.get("coloring", []),
                        "clippingPlanesCount": vp_parsed.get("clippingPlanesCount", 0),
                        "linesCount": vp_parsed.get("linesCount", 0),
                    })

            due_date = _child_text(topic_elem, "DueDate")
            topics.append({
                "guid": topic_guid,
                "index": _parse_int(_child_text(topic_elem, "Index")) or idx_num,
                "title": _child_text(topic_elem, "Title") or f"Issue #{idx_num}",
                "topicType": topic_type,
                "topicStatus": topic_status,
                "priority": _child_text(topic_elem, "Priority") or "Normal",
                "assignedTo": _child_text(topic_elem, "AssignedTo"),
                "creationDate": _child_text(topic_elem, "CreationDate"),
                "creationAuthor": _child_text(topic_elem, "CreationAuthor"),
                "modifiedDate": _child_text(topic_elem, "ModifiedDate"),
                "modifiedAuthor": _child_text(topic_elem, "ModifiedAuthor"),
                "dueDate": due_date,
                "stage": _child_text(topic_elem, "Stage"),
                "description": _child_text(topic_elem, "Description"),
                "labels": labels,
                "referenceLinks": ref_links,
                "headerFiles": header_files,
                "comments": comments,
                "viewpoints": viewpoints,
                "isOverdue": _is_overdue(due_date, topic_status),
            })

        topics.sort(key=lambda t: (t.get("index") if t.get("index") is not None else 999999, t.get("creationDate") or ""))

    # 4. Compute summary KPIs
    by_status: Dict[str, int] = {}
    by_priority: Dict[str, int] = {}
    by_type: Dict[str, int] = {}
    by_assignee: Dict[str, int] = {}

    open_count = 0
    in_progress_count = 0
    closed_count = 0
    unassigned_count = 0
    overdue_count = 0
    total_comments = 0
    total_viewpoints = 0

    for t in topics:
        st = t["topicStatus"] or "Open"
        pr = t["priority"] or "Normal"
        tp = t["topicType"] or "Issue"
        asg = t["assignedTo"] or "Unassigned"

        by_status[st] = by_status.get(st, 0) + 1
        by_priority[pr] = by_priority.get(pr, 0) + 1
        by_type[tp] = by_type.get(tp, 0) + 1
        by_assignee[asg] = by_assignee.get(asg, 0) + 1

        st_l = st.lower()
        if any(k in st_l for k in ("closed", "resolved", "done", "complete")):
            closed_count += 1
        elif any(k in st_l for k in ("progress", "review", "active", "pending")):
            in_progress_count += 1
        else:
            open_count += 1

        if not t["assignedTo"]:
            unassigned_count += 1
        if t["isOverdue"]:
            overdue_count += 1
        total_comments += len(t["comments"])
        total_viewpoints += len(t["viewpoints"])

    payload = {
        "format": "bcf",
        "filename": display_filename,
        "version": version_id,
        "project": project_info,
        "stats": {
            "totalTopics": len(topics),
            "openCount": open_count,
            "inProgressCount": in_progress_count,
            "closedCount": closed_count,
            "unassignedCount": unassigned_count,
            "overdueCount": overdue_count,
            "totalComments": total_comments,
            "totalViewpoints": total_viewpoints,
            "byStatus": by_status,
            "byPriority": by_priority,
            "byType": by_type,
            "byAssignee": by_assignee,
        },
        "topics": topics,
    }

    json_content = json.dumps(payload, ensure_ascii=False)

    blocks: List[Dict[str, Any]] = [{
        "block_key": "bcf_main",
        "title": f"BCF Project: {project_info['name']} ({len(topics)} issues)",
        "content": json_content,
        "order_index": 0,
    }]

    return json_content, blocks
