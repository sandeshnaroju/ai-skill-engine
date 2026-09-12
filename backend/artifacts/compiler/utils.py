"""
backend/artifacts/compiler/utils.py
Shared utilities for artifact compilers: color conversion, HTML stripping,
image fetching, inline markdown tokenization, and XML text sanitization.
"""
import os
import re
import base64
import urllib.request
from typing import Tuple, List, Optional, Any


def _hex_to_rgb(hex_str: str) -> Tuple[int, int, int]:
    """Helper to convert #hex or #rgb to RGB tuple."""
    if not hex_str:
        return (51, 65, 85)
    hex_clean = hex_str.strip().lstrip('#')
    if len(hex_clean) == 3:
        hex_clean = "".join([c * 2 for c in hex_clean])
    if len(hex_clean) == 6:
        try:
            return (int(hex_clean[0:2], 16), int(hex_clean[2:4], 16), int(hex_clean[4:6], 16))
        except ValueError:
            pass
    return (51, 65, 85)


def _strip_html(text: str) -> str:
    """Strip HTML tags and decode common entities for plain text fallback."""
    if not text:
        return ""
    clean = re.sub(r'<[^<]+?>', '', text)
    clean = clean.replace('&nbsp;', ' ').replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
    return clean.strip()


def _fetch_image_bytes(url_or_data: str) -> Optional[bytes]:
    """Fetch image bytes from data URI, local sandbox path, or HTTP(S) URL."""
    if not url_or_data:
        return None
    url_clean = url_or_data.strip()
    if url_clean.startswith("data:image/"):
        try:
            if "," in url_clean:
                _, encoded = url_clean.split(",", 1)
                return base64.b64decode(encoded)
        except Exception:
            return None
    elif url_clean.startswith("http://") or url_clean.startswith("https://"):
        try:
            req = urllib.request.Request(
                url_clean,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                return resp.read()
        except Exception:
            return None
    else:
        # Local file path or relative download URL
        clean_name = os.path.basename(url_clean.split("?")[0])
        if os.path.isfile(url_clean):
            try:
                with open(url_clean, "rb") as f:
                    return f.read()
            except Exception:
                pass
        for s_dir in [
            os.path.join(os.getcwd(), "sandbox", "uploads"),
            os.path.join(os.getcwd(), "sandbox", "outputs"),
            "/app/sandbox/uploads",
            "/app/sandbox/outputs",
        ]:
            if os.path.exists(s_dir):
                for root, _, files in os.walk(s_dir):
                    if clean_name in files:
                        try:
                            with open(os.path.join(root, clean_name), "rb") as f:
                                return f.read()
                        except Exception:
                            pass
    return None


def _tokenize_inline_formatting(text: str) -> List[dict]:
    """
    Parses inline markdown and HTML tags into tokens.
    Handles:
    - Markdown links [text](url) and <a href="...">text</a>
    - Colored spans <span style="color:..."> and <font color="...">
    - Bold (**bold**, <b>, <strong>)
    - Italic (*italic*, _italic_, <i>, <em>)
    - Inline code (`code`)
    - Plain text
    """
    if not text:
        return []

    # Clean unrenderable layout tags
    clean = re.sub(r'</?(?:div|p|br|mark|section|article)[^>]*>', '', text)

    pattern = re.compile(
        r'(?P<md_link>\[(?P<link_text>[^\]]+)\]\((?P<link_url>[^\)]+)\))|'
        r'(?P<html_link><a\s+[^>]*href=[\'"](?P<a_url>[^\'"]+)[\'"][^>]*>(?P<a_text>.*?)</a>)|'
        r'(?P<color_span><span\s+style=[\'"][^\'"]*color:\s*(?P<span_color>#[0-9a-fA-F]{3,6}|[a-zA-Z]+)[^\'"]*[\'"][^>]*>(?P<span_text>.*?)</span>)|'
        r'(?P<color_font><font\s+color=[\'"](?P<font_color>#[0-9a-fA-F]{3,6}|[a-zA-Z]+)[\'"][^>]*>(?P<font_text>.*?)</font>)|'
        r'(?P<bold_tag><b>|<strong>)(?P<bold_tag_text>.*?)(?:</b>|</strong>)|'
        r'(?P<italic_tag><i>|<em>)(?P<italic_tag_text>.*?)(?:</i>|</em>)|'
        r'(?:\*\*(?P<bold_md>[^\*]+)\*\*)|'
        r'(?:__(?P<bold_under>[^_]+)__)|'
        r'(?:\*(?P<it_md>[^\*]+)\*)|'
        r'(?:_(?P<it_under>[^_]+)_)|'
        r'(?:`(?P<code_txt>[^`]+)`)',
        re.IGNORECASE | re.DOTALL
    )

    tokens = []
    last_idx = 0

    for match in pattern.finditer(clean):
        start, end = match.span()
        if start > last_idx:
            tokens.append({"type": "text", "text": clean[last_idx:start]})

        d = match.groupdict()

        if d.get("link_text") and d.get("link_url"):
            tokens.append({"type": "link", "text": d["link_text"], "url": d["link_url"]})
        elif d.get("a_text") and d.get("a_url"):
            tokens.append({"type": "link", "text": d["a_text"], "url": d["a_url"]})
        elif d.get("span_text") and d.get("span_color"):
            tokens.append({"type": "colored", "color": d["span_color"], "text": d["span_text"]})
        elif d.get("font_text") and d.get("font_color"):
            tokens.append({"type": "colored", "color": d["font_color"], "text": d["font_text"]})
        elif d.get("bold_tag_text"):
            tokens.append({"type": "bold", "text": d["bold_tag_text"]})
        elif d.get("bold_md"):
            tokens.append({"type": "bold", "text": d["bold_md"]})
        elif d.get("bold_under"):
            tokens.append({"type": "bold", "text": d["bold_under"]})
        elif d.get("italic_tag_text"):
            tokens.append({"type": "italic", "text": d["italic_tag_text"]})
        elif d.get("it_md"):
            tokens.append({"type": "italic", "text": d["it_md"]})
        elif d.get("it_under"):
            tokens.append({"type": "italic", "text": d["it_under"]})
        elif d.get("code_txt"):
            tokens.append({"type": "code", "text": d["code_txt"]})

        last_idx = end

    if last_idx < len(clean):
        tokens.append({"type": "text", "text": clean[last_idx:]})

    return tokens


def _sanitize_xml_text(text: str) -> str:
    """Strip characters not permitted in XML 1.0 (control chars 0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F)."""
    if not text:
        return ""
    return re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', str(text)).strip()


def _parse_hex_color(val: Any, default_rgb) -> Any:
    """Parse hex, rgb(), or rgba() string into pptx RGBColor."""
    from pptx.dml.color import RGBColor
    if not val:
        return default_rgb
    s = str(val).strip()
    hex_matches = re.findall(r'#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b', s)
    if hex_matches:
        h = hex_matches[0]
        if len(h) == 3:
            h = ''.join([c * 2 for c in h])
        try:
            return RGBColor(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
        except Exception:
            return default_rgb
    rgb_m = re.search(r'rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)', s)
    if rgb_m:
        try:
            return RGBColor(int(rgb_m.group(1)), int(rgb_m.group(2)), int(rgb_m.group(3)))
        except Exception:
            return default_rgb
    return default_rgb
