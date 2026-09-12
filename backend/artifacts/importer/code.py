"""
backend/artifacts/importer/code.py
Parses programming code scripts (.py, .js, .ts, .html, .css, .json, .sql, .sh, etc.)
into functions, classes, components, or modular sections for surgical inspection and patching.
"""
import re
from typing import Tuple, List, Dict, Any


def _parse_code_file(filepath: str, filename: str, language: str) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Parses code scripts (.py, .js, .ts, .html, .css, .json, .sql, .sh, .go, .rs, .java, etc.)
    into functions, classes, components, or modular sections for surgical inspection and patching.
    """
    blocks = []
    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            raw_text = f.read()
    except Exception as e:
        content = f"// Error reading code file {filename}: {str(e)}"
        return content, [{"block_key": "code_error", "title": "Error", "content": content, "order_index": 0}]

    # Python decomposition: def / class
    if language == "python":
        fn_pattern = re.compile(r'^(def\s+[a-zA-Z0-9_]+\s*\(|class\s+[a-zA-Z0-9_]+)', re.MULTILINE)
        splits = fn_pattern.split(raw_text)
        if len(splits) > 1:
            idx = 0
            preamble = splits[0].strip()
            if preamble:
                blocks.append({
                    "block_key": "imports_header",
                    "title": "Module Imports & Constants",
                    "content": preamble,
                    "order_index": idx
                })
                idx += 1

            for s_i in range(1, len(splits), 2):
                hdr = splits[s_i].strip()
                symbol_match = re.search(r'(?:def|class)\s+([a-zA-Z0-9_]+)', hdr)
                symbol_name = symbol_match.group(1) if symbol_match else f"Block {idx + 1}"
                body = splits[s_i + 1].strip() if s_i + 1 < len(splits) else ""
                full_block = f"{hdr}{body}".strip()
                blocks.append({
                    "block_key": f"sym_{symbol_name.lower()}",
                    "title": f"{'Class' if 'class ' in hdr else 'Function'}: {symbol_name}",
                    "content": full_block,
                    "order_index": idx
                })
                idx += 1

    # JavaScript / TypeScript decomposition: function, class, export default
    elif language in ("javascript", "typescript"):
        fn_pattern = re.compile(r'^(export\s+default\s+function|export\s+function|function\s+[a-zA-Z0-9_]+|class\s+[a-zA-Z0-9_]+)', re.MULTILINE)
        splits = fn_pattern.split(raw_text)
        if len(splits) > 1:
            idx = 0
            preamble = splits[0].strip()
            if preamble:
                blocks.append({
                    "block_key": "imports_header",
                    "title": "Imports & Declarations",
                    "content": preamble,
                    "order_index": idx
                })
                idx += 1

            for s_i in range(1, len(splits), 2):
                hdr = splits[s_i].strip()
                name_match = re.search(r'(?:function|class)\s+([a-zA-Z0-9_]+)', hdr)
                symbol_name = name_match.group(1) if name_match else f"Component {idx + 1}"
                body = splits[s_i + 1].strip() if s_i + 1 < len(splits) else ""
                blocks.append({
                    "block_key": f"fn_{symbol_name.lower()}",
                    "title": f"Export: {symbol_name}",
                    "content": f"{hdr}{body}".strip(),
                    "order_index": idx
                })
                idx += 1

    if not blocks:
        blocks.append({
            "block_key": "main_code",
            "title": f"Source Code: {filename}",
            "content": raw_text,
            "order_index": 0
        })

    return raw_text, blocks
