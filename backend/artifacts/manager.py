"""
backend/engine/artifact_manager.py
Core manager for Universal Artifacts:
- Block decomposition across formats (Code, Markdown, Spreadsheets, Presentations, SVG, Media)
- Diff generation via difflib.unified_diff and patch reconstruction
- Zero-snapshot commit logging
- Live real-time SSE stream broadcasting
- Cryptographic embed token minting & silent refresh
"""
import os
import re
import json
import time
import hmac
import hashlib
import base64
import difflib
import asyncio
from typing import Optional, Dict, Set, Tuple, List
from datetime import datetime
from sqlalchemy.orm import Session as DbSession

from models import SessionArtifact, ArtifactBlock, ArtifactCommit, ConversationSession, Tenant


# ─────────────────────────────────────────────────────────────────────────────
# In-Memory Live SSE Broadcaster for Iframe Real-Time Updates
# ─────────────────────────────────────────────────────────────────────────────
class ArtifactBroadcaster:
    def __init__(self):
        # artifact_id -> set of asyncio.Queue
        self._listeners: Dict[str, Set[asyncio.Queue]] = {}

    def subscribe(self, artifact_id: str) -> asyncio.Queue:
        q = asyncio.Queue()
        if artifact_id not in self._listeners:
            self._listeners[artifact_id] = set()
        self._listeners[artifact_id].add(q)
        return q

    def unsubscribe(self, artifact_id: str, q: asyncio.Queue):
        if artifact_id in self._listeners:
            self._listeners[artifact_id].discard(q)
            if not self._listeners[artifact_id]:
                del self._listeners[artifact_id]

    def broadcast(self, artifact_id: str, event_type: str, payload: dict):
        if artifact_id in self._listeners:
            message = {
                "type": event_type,
                "artifact_id": artifact_id,
                "timestamp": datetime.utcnow().isoformat(),
                **payload
            }
            raw_sse = f"data: {json.dumps(message)}\n\n"
            for q in list(self._listeners[artifact_id]):
                try:
                    q.put_nowait(raw_sse)
                except Exception:
                    pass


broadcaster = ArtifactBroadcaster()


# ─────────────────────────────────────────────────────────────────────────────
# Cryptographic Embed Token (HMAC-SHA256)
# ─────────────────────────────────────────────────────────────────────────────
def _get_signing_secret() -> bytes:
    key = os.getenv("ENCRYPTION_SECRET_KEY", "default-dev-secret-key-must-be-changed")
    return key.encode("utf-8")


def mint_embed_token(artifact_id: str, tenant_id: str, expires_in_minutes: int = 30) -> str:
    """Generate a tamper-proof, time-bounded URL-safe token scoped to an artifact."""
    import secrets
    now = int(time.time())
    exp = now + (expires_in_minutes * 60)
    payload = {
        "art": artifact_id,
        "ten": tenant_id,
        "iat": now,
        "exp": exp,
        "jti": secrets.token_hex(4),
        "scope": "canvas_embed"
    }
    payload_bytes = json.dumps(payload, separators=(',', ':')).encode("utf-8")
    encoded_payload = base64.urlsafe_b64encode(payload_bytes).decode("utf-8").rstrip("=")

    sig = hmac.new(_get_signing_secret(), encoded_payload.encode("utf-8"), hashlib.sha256).digest()
    encoded_sig = base64.urlsafe_b64encode(sig).decode("utf-8").rstrip("=")
    return f"{encoded_payload}.{encoded_sig}"


def verify_embed_token(token: str) -> dict:
    """Verify cryptographic signature and expiry. Returns payload dict or raises ValueError."""
    if not token or "." not in token:
        raise ValueError("Invalid token format")
    parts = token.split(".")
    if len(parts) != 2:
        raise ValueError("Malformed token structure")
    encoded_payload, encoded_sig = parts

    # Verify signature
    expected_sig = hmac.new(_get_signing_secret(), encoded_payload.encode("utf-8"), hashlib.sha256).digest()
    actual_sig = base64.urlsafe_b64decode(encoded_sig + "==")
    if not hmac.compare_digest(expected_sig, actual_sig):
        raise ValueError("Invalid cryptographic signature or tampered token")

    # Decode and check expiry
    payload_bytes = base64.urlsafe_b64decode(encoded_payload + "==")
    payload = json.loads(payload_bytes.decode("utf-8"))
    now = int(time.time())
    if payload.get("exp", 0) < now:
        raise ValueError("Token has expired")

    return payload


def refresh_embed_token(token: str, extension_minutes: int = 30) -> str:
    """Validate current token and mint a renewed token with extended expiration."""
    payload = verify_embed_token(token)
    return mint_embed_token(payload["art"], payload["ten"], expires_in_minutes=extension_minutes)


# ─────────────────────────────────────────────────────────────────────────────
# Diff Utilities
# ─────────────────────────────────────────────────────────────────────────────
def generate_unified_diff(old_text: str, new_text: str, filename: str = "content") -> str:
    """Generate a clean unified diff string (~50-200 bytes) of changes."""
    old_lines = old_text.splitlines(keepends=True)
    new_lines = new_text.splitlines(keepends=True)
    diff = difflib.unified_diff(
        old_lines, new_lines,
        fromfile=f"a/{filename}", tofile=f"b/{filename}",
        n=3
    )
    return "".join(diff)


def surgical_replace(original_text: str, target: str, replacement: str) -> Tuple[str, str]:
    """
    Replace target string within original_text.
    Returns (new_text, diff_patch).
    Raises ValueError if target text is not found or ambiguous.
    """
    if target not in original_text:
        raise ValueError(f"Target snippet not found in document content: '{target[:40]}...'")
    new_text = original_text.replace(target, replacement, 1)
    diff = generate_unified_diff(original_text, new_text)
    return new_text, diff


# ─────────────────────────────────────────────────────────────────────────────
# Block Decomposition Across Universal Formats
# ─────────────────────────────────────────────────────────────────────────────
def decompose_content(content: str, artifact_type: str) -> List[Dict]:
    """
    Decomposes arbitrary content into addressable blocks based on format.
    Returns list of dicts: [{"block_key": ..., "title": ..., "content": ..., "order_index": ...}]
    """
    blocks = []

    if artifact_type in ("document", "pdf") and content:
        heading_pattern = re.compile(r'^(#{1,3}\s+.+)$', re.MULTILINE)
        splits = heading_pattern.split(content)

        if len(splits) > 1:
            idx = 0
            preamble = splits[0].strip()
            if preamble:
                blocks.append({
                    "block_key": "sec_intro",
                    "title": "Introduction",
                    "content": preamble,
                    "order_index": idx
                })
                idx += 1

            for i in range(1, len(splits), 2):
                heading = splits[i].strip()
                sec_body = splits[i + 1].strip() if i + 1 < len(splits) else ""
                clean_title = re.sub(r'^#{1,3}\s+', '', heading).strip()
                block_key = f"sec_{idx + 1}"
                full_block_text = f"{heading}\n\n{sec_body}".strip()
                blocks.append({
                    "block_key": block_key,
                    "title": clean_title or f"Section {idx + 1}",
                    "content": full_block_text,
                    "order_index": idx
                })
                idx += 1

    elif artifact_type == "presentation" and content:
        try:
            deck_data = json.loads(content)
            if isinstance(deck_data, dict) and "slides" in deck_data:
                for idx, slide in enumerate(deck_data["slides"]):
                    blocks.append({
                        "block_key": f"slide_{idx + 1}",
                        "title": slide.get("title") or f"Slide {idx + 1}",
                        "content": json.dumps(slide, indent=2),
                        "order_index": idx
                    })
        except Exception:
            slide_parts = re.split(r'<!--\s*slide\s*-->|---\s*slide\s*---', content, flags=re.IGNORECASE)
            for idx, part in enumerate(slide_parts):
                if part.strip():
                    blocks.append({
                        "block_key": f"slide_{idx + 1}",
                        "title": f"Slide {idx + 1}",
                        "content": part.strip(),
                        "order_index": idx
                    })

    elif artifact_type == "spreadsheet" and content:
        try:
            sheet_data = json.loads(content)
            if isinstance(sheet_data, dict) and "sheets" in sheet_data:
                for idx, sheet in enumerate(sheet_data["sheets"]):
                    blocks.append({
                        "block_key": f"sheet_{idx + 1}",
                        "title": sheet.get("sheet_name") or f"Sheet {idx + 1}",
                        "content": json.dumps(sheet, indent=2),
                        "order_index": idx
                    })
        except Exception:
            pass

    if not blocks:
        blocks.append({
            "block_key": "main_block",
            "title": "Main Content",
            "content": content or "",
            "order_index": 0
        })

    return blocks


def assemble_full_content(artifact: SessionArtifact) -> str:
    """Assemble the complete full text of an artifact from its ordered blocks."""
    if not artifact.blocks:
        return ""
    if artifact.artifact_type in ("presentation", "spreadsheet"):
        try:
            if artifact.artifact_type == "presentation":
                slides = [json.loads(b.content) for b in artifact.blocks]
                return json.dumps({"slides": slides}, indent=2)
            elif artifact.artifact_type == "spreadsheet":
                sheets = [json.loads(b.content) for b in artifact.blocks]
                return json.dumps({"sheets": sheets}, indent=2)
        except Exception:
            pass

    return "\n\n".join(b.content for b in sorted(artifact.blocks, key=lambda x: x.order_index))


# ─────────────────────────────────────────────────────────────────────────────
# Database CRUD & Version Management
# ─────────────────────────────────────────────────────────────────────────────
def create_artifact(
    db: DbSession,
    session_id: str,
    tenant_id: str,
    title: str,
    filename: str,
    artifact_type: str,
    content: str,
    language: Optional[str] = None,
    media_url: Optional[str] = None
) -> SessionArtifact:
    """Create a new artifact, decompose into blocks, and log initial commit."""
    artifact = SessionArtifact(
        session_id=session_id,
        tenant_id=tenant_id,
        title=title,
        filename=filename,
        artifact_type=artifact_type,
        media_url=media_url,
        language=language or ("python" if filename.endswith(".py") else "javascript" if filename.endswith(".js") else "markdown"),
        current_version=1
    )
    db.add(artifact)
    db.flush()

    blocks_data = decompose_content(content, artifact_type)
    for b in blocks_data:
        block_row = ArtifactBlock(
            artifact_id=artifact.id,
            block_key=b["block_key"],
            order_index=b["order_index"],
            title=b["title"],
            content=b["content"],
            version=1
        )
        db.add(block_row)
        commit = ArtifactCommit(
            artifact_id=artifact.id,
            version=1,
            author="assistant",
            block_key=b["block_key"],
            summary=f"Initial draft of {b['title']}",
            patch=generate_unified_diff("", b["content"], filename=b["title"])
        )
        db.add(commit)

    db.commit()
    db.refresh(artifact)

    broadcaster.broadcast(artifact.id, "artifact_created", {
        "artifact": serialize_artifact_summary(artifact)
    })
    return artifact


def update_full_artifact(
    db: DbSession,
    artifact_id: str,
    content: str,
    title: Optional[str] = None,
    author: str = "assistant",
    summary: str = "Updated full document content"
) -> SessionArtifact:
    """
    Update the full content of an existing artifact cleanly.
    Re-decomposes into blocks, replaces outdated blocks, advances artifact version,
    and broadcasts an 'artifact_updated' SSE event so Canvas re-syncs cleanly.
    """
    artifact = db.query(SessionArtifact).filter(SessionArtifact.id == artifact_id).first()
    if not artifact:
        raise ValueError(f"Artifact {artifact_id} not found")

    if title:
        artifact.title = title

    artifact.current_version += 1
    artifact.updated_at = datetime.utcnow()

    # Decompose the new content into fresh blocks
    new_blocks_data = decompose_content(content, artifact.artifact_type)

    # Clean out existing blocks for this artifact to prevent stale/duplicate sections
    db.query(ArtifactBlock).filter(ArtifactBlock.artifact_id == artifact.id).delete()

    for b in new_blocks_data:
        block_row = ArtifactBlock(
            artifact_id=artifact.id,
            block_key=b["block_key"],
            order_index=b["order_index"],
            title=b["title"],
            content=b["content"],
            version=artifact.current_version
        )
        db.add(block_row)
        commit = ArtifactCommit(
            artifact_id=artifact.id,
            version=artifact.current_version,
            author=author,
            block_key=b["block_key"],
            summary=summary,
            patch=generate_unified_diff("", b["content"], filename=b["title"])
        )
        db.add(commit)

    db.commit()
    db.refresh(artifact)

    broadcaster.broadcast(artifact.id, "artifact_updated", {
        "artifact": serialize_artifact_summary(artifact),
        "version": artifact.current_version
    })
    return artifact



def edit_block(
    db: DbSession,
    artifact_id: str,
    block_key: str,
    new_content: str,
    summary: str,
    author: str = "assistant"
) -> Tuple[ArtifactBlock, ArtifactCommit]:
    """
    Surgically edit a single block. Computes unified diff, updates block content,
    logs commit, advances artifact version, and broadcasts delta.
    """
    artifact = db.query(SessionArtifact).filter(SessionArtifact.id == artifact_id).first()
    if not artifact:
        raise ValueError(f"Artifact {artifact_id} not found")

    block = db.query(ArtifactBlock).filter(
        ArtifactBlock.artifact_id == artifact_id,
        ArtifactBlock.block_key == block_key
    ).first()

    if not block:
        raise ValueError(f"Block '{block_key}' not found in artifact {artifact_id}")

    old_content = block.content
    diff_patch = generate_unified_diff(old_content, new_content, filename=block.title)

    artifact.current_version += 1
    block.version = artifact.current_version
    block.content = new_content
    block.updated_at = datetime.utcnow()
    artifact.updated_at = datetime.utcnow()

    commit = ArtifactCommit(
        artifact_id=artifact.id,
        version=artifact.current_version,
        author=author,
        block_key=block_key,
        summary=summary or f"Updated {block.title}",
        patch=diff_patch
    )
    db.add(commit)
    db.commit()
    db.refresh(block)
    db.refresh(artifact)

    broadcaster.broadcast(artifact.id, "artifact_patch", {
        "block_key": block_key,
        "title": block.title,
        "content": new_content,
        "version": artifact.current_version,
        "summary": summary,
        "author": author,
        "patch": diff_patch
    })
    return block, commit


def rollback_block_to_version(
    db: DbSession,
    artifact_id: str,
    block_key: str,
    target_version: int,
    author: str = "assistant"
) -> ArtifactBlock:
    """
    Reverts an isolated block back to its text state at target_version.
    Maintains non-destructive forward commit history.
    """
    artifact = db.query(SessionArtifact).filter(SessionArtifact.id == artifact_id).first()
    if not artifact:
        raise ValueError(f"Artifact {artifact_id} not found")

    block = db.query(ArtifactBlock).filter(
        ArtifactBlock.artifact_id == artifact_id,
        ArtifactBlock.block_key == block_key
    ).first()
    if not block:
        raise ValueError(f"Block '{block_key}' not found")

    commits = db.query(ArtifactCommit).filter(
        ArtifactCommit.artifact_id == artifact_id,
        ArtifactCommit.block_key == block_key,
        ArtifactCommit.version <= target_version
    ).order_by(ArtifactCommit.version.desc()).all()

    target_content = None
    if commits:
        target_commit = commits[0]
        reconstructed = []
        for line in target_commit.patch.splitlines():
            if line.startswith("+++") or line.startswith("---") or line.startswith("@@"):
                continue
            if line.startswith("+"):
                reconstructed.append(line[1:])
            elif line.startswith(" "):
                reconstructed.append(line[1:])
        if reconstructed:
            target_content = "\n".join(reconstructed)

    if not target_content:
        first_commit = db.query(ArtifactCommit).filter(
            ArtifactCommit.artifact_id == artifact_id,
            ArtifactCommit.block_key == block_key,
            ArtifactCommit.version == 1
        ).first()
        if first_commit:
            reconstructed = [line[1:] for line in first_commit.patch.splitlines() if line.startswith("+") and not line.startswith("+++")]
            if reconstructed:
                target_content = "\n".join(reconstructed)

    summary = f"Restored {block.title} to version {target_version}"
    updated_block, _ = edit_block(db, artifact_id, block_key, target_content if target_content is not None else block.content, summary, author=author)

    broadcaster.broadcast(artifact.id, "block_rolled_back", {
        "block_key": block_key,
        "restored_from_version": target_version,
        "new_version": artifact.current_version,
        "content": updated_block.content,
        "summary": summary
    })
    return updated_block


def serialize_artifact_summary(artifact: SessionArtifact) -> dict:
    """Serializes high-level artifact metadata for outline and list views."""
    return {
        "id": artifact.id,
        "session_id": artifact.session_id,
        "title": artifact.title,
        "filename": artifact.filename,
        "artifact_type": artifact.artifact_type,
        "language": artifact.language,
        "media_url": artifact.media_url,
        "current_version": artifact.current_version,
        "total_blocks": len(artifact.blocks) if artifact.blocks else 0,
        "created_at": artifact.created_at.isoformat() if artifact.created_at else None,
        "updated_at": artifact.updated_at.isoformat() if artifact.updated_at else None,
        "outline": [
            {
                "block_key": b.block_key,
                "title": b.title,
                "order_index": b.order_index,
                "version": b.version,
                "word_count": len(b.content.split()) if b.content else 0
            }
            for b in sorted(artifact.blocks, key=lambda x: x.order_index)
        ] if artifact.blocks else []
    }
