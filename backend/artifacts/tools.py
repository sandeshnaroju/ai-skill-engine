"""
backend/artifacts/tools.py
Built-in tool execution handlers for the artifact_editor skill.
Dispatched by the Skill Engine / Tool Executor.
"""
import os
import re
import json
import time
from models import SessionArtifact, ArtifactBlock
from .manager import (
    create_artifact,
    update_full_artifact,
    edit_block,
    rollback_block_to_version,
    mint_embed_token,
    serialize_artifact_summary,
)
from .search import keyword_search_artifact, semantic_search_artifact
from .importer import import_file_to_artifact_data


def run_open_or_update_artifact(db, args: dict, tenant, session_id: str) -> dict:
    start_time = time.time()
    tenant_id = tenant.id if tenant else "default"
    title = args.get("title") or "Untitled Document"
    filename = args.get("filename") or "document.md"
    artifact_type = args.get("artifact_type")
    content = args.get("content", "")
    language = args.get("language")
    media_url = args.get("media_url")

    # Detect artifact_type if missing
    if not artifact_type:
        fn = filename.lower()
        if fn.endswith((".docx", ".doc")):
            artifact_type = "document"
        elif fn.endswith((".xlsx", ".xls", ".csv")):
            artifact_type = "spreadsheet"
        elif fn.endswith((".pptx", ".ppt")):
            artifact_type = "presentation"
        elif fn.endswith(".pdf"):
            artifact_type = "pdf"
        elif fn.endswith(".svg"):
            artifact_type = "svg"
        elif fn.endswith((".mp3", ".wav", ".ogg")):
            artifact_type = "audio"
        elif fn.endswith((".mp4", ".webm", ".mov")):
            artifact_type = "video"
        elif fn.endswith((".dwg", ".dxf")):
            artifact_type = "cad_2d"
        elif fn.endswith((".step", ".stp", ".iges", ".igs", ".ifc", ".stl", ".obj", ".glb", ".gltf")):
            artifact_type = "cad_3d"
        elif fn.endswith((".geojson", ".kml", ".kmz", ".shp")):
            artifact_type = "gis"
        elif fn.endswith((".vsdx",)):
            artifact_type = "diagram"
        elif fn.endswith((".l5x", ".l5k", ".s7p", ".xer", ".m", ".slx")):
            artifact_type = "engineering_data"
        elif fn.endswith((".py", ".js", ".jsx", ".ts", ".tsx", ".html", ".css", ".json", ".sql", ".sh")):
            artifact_type = "code"
        else:
            artifact_type = "document"

    # Check if artifact already exists in this session
    filter_clauses = [
        SessionArtifact.tenant_id == tenant_id,
        (SessionArtifact.filename == filename) | (SessionArtifact.title == title)
    ]
    if session_id:
        filter_clauses.append(SessionArtifact.session_id == session_id)

    existing = db.query(SessionArtifact).filter(*filter_clauses).first()

    if existing:
        if content:
            artifact = update_full_artifact(
                db=db,
                artifact_id=existing.id,
                content=content,
                title=title,
                author="assistant",
                summary="Updated full document content"
            )
        else:
            artifact = existing
    else:
        artifact = create_artifact(
            db=db,
            session_id=session_id,
            tenant_id=tenant_id,
            title=title,
            filename=filename,
            artifact_type=artifact_type,
            content=content,
            language=language,
            media_url=media_url
        )

    summary = serialize_artifact_summary(artifact)
    token = mint_embed_token(artifact.id, tenant_id)
    embed_url = f"/embed/canvas?token={token}"

    res_data = {
        "id": artifact.id,
        "artifact_id": artifact.id,
        "title": artifact.title,
        "filename": artifact.filename,
        "artifact_type": artifact.artifact_type,
        "current_version": artifact.current_version,
        "blocks": summary["outline"],
        "embed_url": embed_url,
        "token": token
    }

    return {
        "stdout": f"Artifact '{artifact.title}' ({artifact.filename}) is open in Canvas.\nEmbed URL: {embed_url}\nTotal blocks: {len(summary['outline'])}\n\nOutline:\n" +
                  "\n".join([f"- [{b['block_key']}] {b['title']}" for b in summary["outline"]]),
        "stderr": "",
        "exit_code": 0,
        "execution_time_ms": int((time.time() - start_time) * 1000),
        "sandbox_type": "artifact_editor",
        "artifact_data": res_data
    }


def run_artifact_search(db, args: dict) -> dict:
    start_time = time.time()
    artifact_id = args.get("artifact_id")
    query = args.get("query", "")
    max_results = int(args.get("max_results", 5))

    if not artifact_id or not query:
        return {"stdout": "", "stderr": "artifact_id and query are required", "exit_code": 1, "sandbox_type": "artifact_editor"}

    matches = keyword_search_artifact(db, artifact_id, query, max_results)
    if not matches:
        return {
            "stdout": f"No matches found in artifact {artifact_id} for query '{query}'.",
            "stderr": "",
            "exit_code": 0,
            "execution_time_ms": int((time.time() - start_time) * 1000),
            "sandbox_type": "artifact_editor"
        }

    lines = [f"Found {len(matches)} matching locations:"]
    for m in matches:
        lines.append(f"\n- Block: '{m['title']}' (key: {m['block_key']}) line {m['line_number']}:\n  Matched: \"{m['matched_text']}\"\n  Context:\n{m['context_snippet']}")

    return {
        "stdout": "\n".join(lines),
        "stderr": "",
        "exit_code": 0,
        "execution_time_ms": int((time.time() - start_time) * 1000),
        "sandbox_type": "artifact_editor",
        "matches": matches
    }


def run_artifact_semantic_search(db, args: dict) -> dict:
    start_time = time.time()
    artifact_id = args.get("artifact_id")
    concept_query = args.get("concept_query", "")
    max_results = int(args.get("max_results", 3))

    if not artifact_id or not concept_query:
        return {"stdout": "", "stderr": "artifact_id and concept_query are required", "exit_code": 1, "sandbox_type": "artifact_editor"}

    results = semantic_search_artifact(db, artifact_id, concept_query, max_results)
    if not results:
        return {
            "stdout": f"No semantically relevant blocks found for concept '{concept_query}'.",
            "stderr": "",
            "exit_code": 0,
            "execution_time_ms": int((time.time() - start_time) * 1000),
            "sandbox_type": "artifact_editor"
        }

    lines = [f"Top relevant blocks for concept '{concept_query}':"]
    for r in results:
        lines.append(f"\n- [{r['block_key']}] \"{r['title']}\" (Score: {r['score']}):\n  Preview: {r['preview']}")

    return {
        "stdout": "\n".join(lines),
        "stderr": "",
        "exit_code": 0,
        "execution_time_ms": int((time.time() - start_time) * 1000),
        "sandbox_type": "artifact_editor",
        "results": results
    }


def _build_artifact_data(db, artifact_id: str) -> dict:
    artifact = db.query(SessionArtifact).filter(SessionArtifact.id == artifact_id).first()
    if not artifact:
        return None
    token = mint_embed_token(artifact.id, artifact.tenant_id)
    return {
        "id": artifact.id,
        "artifact_id": artifact.id,
        "title": artifact.title,
        "filename": artifact.filename,
        "artifact_type": artifact.artifact_type,
        "current_version": artifact.current_version,
        "token": token,
        "embed_url": f"/embed/canvas?token={token}"
    }


def run_edit_artifact_section(db, args: dict, author: str = "assistant", session_id: str = None) -> dict:
    start_time = time.time()
    artifact_id = args.get("artifact_id")
    block_key = args.get("block_key")
    new_content = args.get("new_content") if args.get("new_content") is not None else args.get("content", "")
    edit_summary = args.get("edit_summary") or args.get("summary") or "Section updated"

    if not artifact_id and session_id:
        latest = db.query(SessionArtifact).filter(SessionArtifact.session_id == session_id).order_by(SessionArtifact.updated_at.desc()).first()
        if latest:
            artifact_id = latest.id

    if not artifact_id or not block_key:
        return {"stdout": "", "stderr": "artifact_id and block_key are required", "exit_code": 1, "sandbox_type": "artifact_editor"}

    try:
        block, commit = edit_block(db, artifact_id, block_key, new_content, edit_summary, author=author)
        return {
            "stdout": f"Successfully updated block '{block.title}' ({block_key}) to version {block.version}.\nSummary: {edit_summary}",
            "stderr": "",
            "exit_code": 0,
            "execution_time_ms": int((time.time() - start_time) * 1000),
            "sandbox_type": "artifact_editor",
            "block_key": block_key,
            "version": block.version,
            "artifact_data": _build_artifact_data(db, artifact_id)
        }
    except Exception as e:
        return {
            "stdout": "",
            "stderr": f"Error updating artifact section: {str(e)}",
            "exit_code": 1,
            "execution_time_ms": int((time.time() - start_time) * 1000),
            "sandbox_type": "artifact_editor"
        }


def run_patch_artifact(db, args: dict, author: str = "assistant", session_id: str = None) -> dict:
    start_time = time.time()
    artifact_id = args.get("artifact_id")
    block_key = args.get("block_key")
    target_snippet = args.get("target_snippet") or args.get("target_text") or ""
    replacement_snippet = args.get("replacement_snippet") if args.get("replacement_snippet") is not None else args.get("replacement_text", "")
    edit_summary = args.get("edit_summary") or args.get("summary") or "Patched code/text snippet"

    if not artifact_id and session_id:
        latest = db.query(SessionArtifact).filter(SessionArtifact.session_id == session_id).order_by(SessionArtifact.updated_at.desc()).first()
        if latest:
            artifact_id = latest.id

    if not artifact_id or not target_snippet:
        return {"stdout": "", "stderr": "artifact_id and target_text (or target_snippet) are required", "exit_code": 1, "sandbox_type": "artifact_editor"}

    block = None
    if block_key:
        block = db.query(ArtifactBlock).filter(
            ArtifactBlock.artifact_id == artifact_id,
            ArtifactBlock.block_key == block_key
        ).first()

    # If block not found or target_snippet not in block, search all blocks in this artifact
    if not block or target_snippet not in block.content:
        all_blocks = db.query(ArtifactBlock).filter(ArtifactBlock.artifact_id == artifact_id).all()
        for cand_block in all_blocks:
            if target_snippet in cand_block.content:
                block = cand_block
                block_key = cand_block.block_key
                break

    if not block:
        return {
            "stdout": "",
            "stderr": f"Target snippet not found in any block of artifact {artifact_id}. Please check wording.",
            "exit_code": 1,
            "sandbox_type": "artifact_editor"
        }

    new_content = block.content.replace(target_snippet, replacement_snippet, 1)
    try:
        updated_block, commit = edit_block(db, artifact_id, block_key, new_content, edit_summary, author=author)
        return {
            "stdout": f"Successfully patched block '{updated_block.title}' ({block_key}) to version {updated_block.version}.\nSummary: {edit_summary}",
            "stderr": "",
            "exit_code": 0,
            "execution_time_ms": int((time.time() - start_time) * 1000),
            "sandbox_type": "artifact_editor",
            "block_key": block_key,
            "version": updated_block.version,
            "artifact_data": _build_artifact_data(db, artifact_id)
        }
    except Exception as e:
        return {
            "stdout": "",
            "stderr": f"Error applying patch: {str(e)}",
            "exit_code": 1,
            "execution_time_ms": int((time.time() - start_time) * 1000),
            "sandbox_type": "artifact_editor"
        }


def run_rollback_artifact_block(db, args: dict, author: str = "assistant", session_id: str = None) -> dict:
    start_time = time.time()
    artifact_id = args.get("artifact_id")
    block_key = args.get("block_key")
    target_version = args.get("target_version")

    if not artifact_id and session_id:
        latest = db.query(SessionArtifact).filter(SessionArtifact.session_id == session_id).order_by(SessionArtifact.updated_at.desc()).first()
        if latest:
            artifact_id = latest.id

    if not artifact_id or not block_key or target_version is None:
        return {"stdout": "", "stderr": "artifact_id, block_key, and target_version are required", "exit_code": 1, "sandbox_type": "artifact_editor"}

    try:
        target_v = int(target_version)
        updated_block = rollback_block_to_version(db, artifact_id, block_key, target_v, author=author)
        return {
            "stdout": f"Successfully rolled back block '{updated_block.title}' ({block_key}) to state from version {target_v}. New version is {updated_block.version}.",
            "stderr": "",
            "exit_code": 0,
            "execution_time_ms": int((time.time() - start_time) * 1000),
            "sandbox_type": "artifact_editor",
            "block_key": block_key,
            "version": updated_block.version,
            "artifact_data": _build_artifact_data(db, artifact_id)
        }
    except Exception as e:
        return {
            "stdout": "",
            "stderr": f"Error rolling back block: {str(e)}",
            "exit_code": 1,
            "execution_time_ms": int((time.time() - start_time) * 1000),
            "sandbox_type": "artifact_editor"
        }


def run_open_uploaded_file_as_artifact(db, args: dict, tenant, session_id: str) -> dict:
    """
    Locates an uploaded user file in the sandbox uploads directory, parses it via
    the importer module into structured content & sections, and registers it as an
    active SessionArtifact with live Canvas embed tokens and SSE synchronization.
    """
    start_time = time.time()
    tenant_name = tenant.name if tenant else "default"
    tenant_id = tenant.id if tenant else "default"

    raw_filename = (args.get("filename") or "").strip()
    file_path_arg = (args.get("file_path") or "").strip()
    title = (args.get("title") or "").strip() or None
    artifact_type = (args.get("artifact_type") or "").strip() or None

    if not raw_filename and not file_path_arg:
        return {
            "stdout": "",
            "stderr": "Either 'filename' or 'file_path' must be provided to open an uploaded file.",
            "exit_code": 1,
            "sandbox_type": "artifact_editor"
        }

    # Determine base root directories for sandbox files
    # Support both host repository layout and container layout (/app/sandbox or /sandbox)
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    repo_root = os.path.dirname(backend_dir)
    possible_sandbox_roots = [
        os.path.join(repo_root, "sandbox"),
        os.path.join(backend_dir, "sandbox"),
        "/app/sandbox",
        "/sandbox",
        os.path.abspath("sandbox")
    ]
    # Pick root that actually contains 'uploads' or 'outputs'
    sandbox_root = next(
        (p for p in possible_sandbox_roots if os.path.isdir(os.path.join(p, "uploads")) or os.path.isdir(os.path.join(p, "outputs"))),
        next((p for p in possible_sandbox_roots if os.path.isdir(p)), os.path.join(repo_root, "sandbox"))
    )

    uploads_base = os.path.join(sandbox_root, "uploads")
    outputs_base = os.path.join(sandbox_root, "outputs")
    tenant_upload_dir = os.path.join(uploads_base, tenant_name)
    tenant_output_dir = os.path.join(outputs_base, tenant_name)

    resolved_path = None

    # 1. If explicit file_path was given and exists directly
    if file_path_arg:
        candidates = [
            file_path_arg,
            os.path.join(repo_root, file_path_arg.lstrip("/")),
            os.path.join(uploads_base, file_path_arg.lstrip("/")),
            os.path.join(outputs_base, file_path_arg.lstrip("/")),
            os.path.join(tenant_upload_dir, os.path.basename(file_path_arg)),
            os.path.join(tenant_output_dir, os.path.basename(file_path_arg))
        ]
        for c in candidates:
            if os.path.isfile(c):
                resolved_path = os.path.abspath(c)
                break

    # 2. Extract clean target names (original filename, stripped UUIDs, and basename)
    target_name = raw_filename or os.path.basename(file_path_arg)
    target_clean = target_name.lower().strip()
    
    # Strip leading hex/uuid patterns (e.g. 'f6355d38100e40a38b603167f2a35ab7_..._pid.dxf' -> 'pid.dxf')
    stripped_name = target_clean
    while re.match(r'^[a-f0-9]{32}_', stripped_name) or re.match(r'^[a-f0-9\-]{36}_', stripped_name):
        stripped_name = re.sub(r'^[a-f0-9]{32}_|^[a-f0-9\-]{36}_', '', stripped_name)

    # 3. Search locally in uploads and outputs directories (including subdirectories like Default Workspace)
    search_dirs = [tenant_upload_dir, tenant_output_dir, uploads_base, outputs_base]
    if not resolved_path:
        for s_dir in search_dirs:
            if not os.path.isdir(s_dir):
                continue
            for root, _, files in os.walk(s_dir):
                for f in files:
                    clean_f = f.lower()
                    if (
                        clean_f == target_clean
                        or clean_f == stripped_name
                        or clean_f.endswith(f"_{target_clean}")
                        or clean_f.endswith(f"_{stripped_name}")
                        or (target_clean in clean_f and len(target_clean) > 8)
                        or (stripped_name in clean_f and len(stripped_name) > 8)
                    ):
                        resolved_path = os.path.abspath(os.path.join(root, f))
                        break
                if resolved_path:
                    break
            if resolved_path:
                break

    # 4. If not found locally, query StorageBackend (Azure Blob Storage, S3, etc.)
    if not resolved_path:
        try:
            from storage import get_storage_backend
            storage_backend = get_storage_backend(db, tenant_id=tenant_id)
            if storage_backend.__class__.__name__ != "LocalStorage":
                # Try downloading by raw_filename, target_clean, and stripped_name
                try_names = [raw_filename, target_clean, stripped_name]
                os.makedirs(tenant_upload_dir, exist_ok=True)
                for name_to_try in try_names:
                    if not name_to_try:
                        continue
                    downloaded_bytes = storage_backend.download(name_to_try, tenant_name=tenant_name)
                    if downloaded_bytes:
                        save_filename = os.path.basename(name_to_try)
                        dest_path = os.path.join(tenant_upload_dir, save_filename)
                        with open(dest_path, "wb") as f_out:
                            f_out.write(downloaded_bytes)
                        resolved_path = os.path.abspath(dest_path)
                        break
        except Exception as storage_err:
            pass

    if not resolved_path or not os.path.isfile(resolved_path):
        return {
            "stdout": "",
            "stderr": f"Uploaded file '{raw_filename or file_path_arg}' could not be found in tenant storage.",
            "exit_code": 1,
            "sandbox_type": "artifact_editor"
        }

    try:
        imported = import_file_to_artifact_data(resolved_path, title=title, explicit_type=artifact_type)
    except Exception as e:
        return {
            "stdout": "",
            "stderr": f"Failed to parse and import uploaded file: {str(e)}",
            "exit_code": 1,
            "sandbox_type": "artifact_editor"
        }

    art_title = imported["title"]
    art_filename = imported["filename"]
    art_type = imported["artifact_type"]
    art_content = imported["content"]
    art_language = imported.get("language")
    art_media_url = imported.get("media_url")
    art_blocks = imported.get("blocks") or []

    # Check if this artifact already exists in the current session
    filter_clauses = [
        SessionArtifact.tenant_id == tenant_id,
        (SessionArtifact.filename == art_filename) | (SessionArtifact.title == art_title)
    ]
    if session_id:
        filter_clauses.append(SessionArtifact.session_id == session_id)

    existing = db.query(SessionArtifact).filter(*filter_clauses).first()

    if existing:
        artifact = update_full_artifact(
            db=db,
            artifact_id=existing.id,
            content=art_content,
            title=art_title,
            author="assistant",
            summary=f"Imported updated file: {art_filename}",
            blocks=art_blocks if art_blocks else None
        )
    else:
        artifact = create_artifact(
            db=db,
            session_id=session_id,
            tenant_id=tenant_id,
            title=art_title,
            filename=art_filename,
            artifact_type=art_type,
            content=art_content,
            language=art_language,
            media_url=art_media_url,
            blocks=art_blocks if art_blocks else None
        )

    summary = serialize_artifact_summary(artifact)
    token = mint_embed_token(artifact.id, tenant_id)
    embed_url = f"/embed/canvas?token={token}"

    res_data = {
        "id": artifact.id,
        "artifact_id": artifact.id,
        "title": artifact.title,
        "filename": artifact.filename,
        "artifact_type": artifact.artifact_type,
        "current_version": artifact.current_version,
        "blocks": summary["outline"],
        "embed_url": embed_url,
        "token": token
    }

    outline_lines = [f"- [{b['block_key']}] {b['title']}" for b in summary["outline"][:12]]
    if len(summary["outline"]) > 12:
        outline_lines.append(f"... and {len(summary['outline']) - 12} more sections")

    return {
        "stdout": (
            f"Successfully opened uploaded file '{artifact.title}' ({artifact.filename}) in the Canvas Artifact Editor!\n"
            f"Type: {artifact.artifact_type.upper()}\n"
            f"Total Sections/Blocks: {len(summary['outline'])}\n"
            f"Embed URL: {embed_url}\n\n"
            f"Sections Outline:\n" + "\n".join(outline_lines)
        ),
        "stderr": "",
        "exit_code": 0,
        "execution_time_ms": int((time.time() - start_time) * 1000),
        "sandbox_type": "artifact_editor",
        "artifact_data": res_data
    }
