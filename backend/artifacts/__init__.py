"""
backend/artifacts
Universal Document & Artifact Engine:
- Block decomposition, surgical diff editing, zero-snapshot commits (manager.py)
- In-database BM25 hybrid semantic search (search.py)
- Multi-format compilation to .docx, .xlsx, .pptx, .pdf, code, media (compiler.py)
- Built-in tool runners for artifact_editor skill (tools.py)
- REST & SSE streaming API router (router.py)
"""
from .manager import (
    broadcaster,
    mint_embed_token,
    verify_embed_token,
    refresh_embed_token,
    generate_unified_diff,
    decompose_content,
    assemble_full_content,
    create_artifact,
    update_full_artifact,
    edit_block,
    rollback_block_to_version,
    serialize_artifact_summary,
)
from .compiler import export_artifact, compile_to_docx, compile_to_xlsx, compile_to_pptx, compile_to_pdf
from .search import keyword_search_artifact, semantic_search_artifact
from .tools import (
    run_open_or_update_artifact,
    run_artifact_search,
    run_artifact_semantic_search,
    run_edit_artifact_section,
    run_patch_artifact,
    run_rollback_artifact_block,
)
from .router import router as artifacts_router

__all__ = [
    "broadcaster",
    "mint_embed_token",
    "verify_embed_token",
    "refresh_embed_token",
    "generate_unified_diff",
    "decompose_content",
    "assemble_full_content",
    "create_artifact",
    "update_full_artifact",
    "edit_block",
    "rollback_block_to_version",
    "serialize_artifact_summary",
    "export_artifact",
    "compile_to_docx",
    "compile_to_xlsx",
    "compile_to_pptx",
    "compile_to_pdf",
    "keyword_search_artifact",
    "semantic_search_artifact",
    "run_open_or_update_artifact",
    "run_artifact_search",
    "run_artifact_semantic_search",
    "run_edit_artifact_section",
    "run_patch_artifact",
    "run_rollback_artifact_block",
    "artifacts_router",
]
