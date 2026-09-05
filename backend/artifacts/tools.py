"""
backend/artifacts/tools.py
Built-in tool execution handlers for the artifact_editor skill.
Dispatched by the Skill Engine / Tool Executor.
"""
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
        elif fn.endswith((".py", ".js", ".jsx", ".ts", ".tsx", ".html", ".css", ".json", ".sql", ".sh")):
            artifact_type = "code"
        else:
            artifact_type = "document"

    # Check if artifact already exists in this session
    existing = db.query(SessionArtifact).filter(
        SessionArtifact.session_id == session_id,
        (SessionArtifact.filename == filename) | (SessionArtifact.title == title)
    ).first()

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
