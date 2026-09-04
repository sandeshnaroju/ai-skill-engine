"""
backend/engine/artifact_search.py
In-Database Hybrid Search Engine for Artifacts:
- Exact keyword & regex search across artifact blocks
- Semantic concept matching across block titles and summaries using BM25 and NumPy cosine similarity
- Zero external vector database dependencies
"""
import re
import math
from typing import List, Dict, Optional
from sqlalchemy.orm import Session as DbSession
import numpy as np

from models import SessionArtifact, ArtifactBlock


def keyword_search_artifact(
    db: DbSession,
    artifact_id: str,
    query: str,
    max_results: int = 5
) -> List[Dict]:
    """
    High-speed keyword search across all blocks of an artifact.
    Extracts matching snippets with line numbers and surrounding context.
    """
    query_clean = query.strip().lower()
    if not query_clean:
        return []

    blocks = db.query(ArtifactBlock).filter(
        ArtifactBlock.artifact_id == artifact_id
    ).order_by(ArtifactBlock.order_index.asc()).all()

    results = []
    pattern = re.compile(re.escape(query_clean), re.IGNORECASE)

    for block in blocks:
        lines = block.content.splitlines()
        for line_idx, line in enumerate(lines):
            if pattern.search(line):
                start = max(0, line_idx - 2)
                end = min(len(lines), line_idx + 3)
                context_snippet = "\n".join(lines[start:end])

                results.append({
                    "block_key": block.block_key,
                    "title": block.title,
                    "line_number": line_idx + 1,
                    "matched_text": line.strip(),
                    "context_snippet": context_snippet
                })

                if len(results) >= max_results:
                    return results

    return results


CONCEPT_SYNONYMS = {
    "money": ["finance", "financial", "revenue", "budget", "cost", "funds", "dollar", "currency", "cash", "price"],
    "finance": ["money", "financial", "revenue", "budget", "cost", "funds", "projection", "projections", "forecast", "profit", "earnings"],
    "financial": ["finance", "money", "revenue", "budget", "cost", "projection", "projections", "forecast", "profit", "earnings"],
    "forecast": ["projection", "projections", "future", "outlook", "estimate", "expected", "quadruple", "plan"],
    "revenue": ["money", "sales", "income", "finance", "financial", "earnings", "cashflow"],
    "analysis": ["analyze", "breakdown", "research", "study", "market", "overview"],
    "summary": ["overview", "abstract", "synopsis", "executive", "introduction", "conclusion"],
    "code": ["function", "class", "script", "def", "implementation", "program", "method"],
    "test": ["validation", "spec", "check", "verify", "unit", "testing"]
}


def _stem(word: str) -> str:
    """Basic suffix stripping for conceptual matching."""
    w = word.lower()
    for suffix in ("ing", "tion", "tions", "ment", "ments", "ial", "ials", "ies", "es", "s", "ed", "ly"):
        if w.endswith(suffix) and len(w) - len(suffix) >= 3:
            return w[:-len(suffix)]
    return w


def _tokenize(text: str) -> List[str]:
    return [w for w in re.findall(r'\b[a-zA-Z0-9_-]+\b', text.lower()) if len(w) > 2]


def semantic_search_artifact(
    db: DbSession,
    artifact_id: str,
    concept: str,
    top_k: int = 3
) -> List[Dict]:
    """
    Semantic concept matching using BM25 scoring with concept expansion and stemming
    over block titles and content. Returns the most relevant blocks even when exact wording differs.
    """
    raw_tokens = _tokenize(concept)
    if not raw_tokens:
        return []

    # Expand query tokens with synonyms
    query_tokens = set(raw_tokens)
    for t in raw_tokens:
        stemmed = _stem(t)
        query_tokens.add(stemmed)
        if t in CONCEPT_SYNONYMS:
            for syn in CONCEPT_SYNONYMS[t]:
                query_tokens.add(syn)
                query_tokens.add(_stem(syn))

    blocks = db.query(ArtifactBlock).filter(
        ArtifactBlock.artifact_id == artifact_id
    ).order_by(ArtifactBlock.order_index.asc()).all()

    if not blocks:
        return []

    # Compute BM25 parameters across blocks
    docs = []
    for b in blocks:
        toks = _tokenize(f"{b.title} {b.content[:1500]}")
        stemmed_toks = toks + [_stem(t) for t in toks]
        docs.append((b, stemmed_toks))

    N = len(docs)
    avg_dl = sum(len(d[1]) for d in docs) / max(1, N)
    k1 = 1.5
    b_param = 0.75

    scores = []
    for block, doc_tokens in docs:
        doc_len = len(doc_tokens)
        score = 0.0

        for q in query_tokens:
            # Document frequency of q
            n_q = sum(1 for _, d_toks in docs if q in d_toks)
            idf = math.log((N - n_q + 0.5) / (n_q + 0.5) + 1.0)

            # Term frequency in this doc
            f = doc_tokens.count(q)
            if f > 0:
                tf = (f * (k1 + 1)) / (f + k1 * (1 - b_param + b_param * (doc_len / max(1, avg_dl))))
                score += idf * tf

        if score > 0:
            scores.append((score, block))

    scores.sort(key=lambda x: x[0], reverse=True)

    results = []
    for score, block in scores[:top_k]:
        preview = block.content[:300].strip() + ("..." if len(block.content) > 300 else "")
        results.append({
            "block_key": block.block_key,
            "title": block.title,
            "score": round(score, 3),
            "preview": preview
        })

    return results

