"""
engine/subagents.py
Sub-agent runner & multimodal payload builder for specialized sub-agents.
Supports granular model routing for:
  - image: vision OCR, diagram & scene comprehension
  - audio: speech-to-text, timestamps, meeting summaries
  - video: frame timeline, visual events, on-screen text & dialogue
"""
import os
import json
import time
import base64
import mimetypes
from typing import Optional, Tuple
from sqlalchemy.orm import Session

from llm_client import get_llm_client, get_model_name


def resolve_media_to_data_uri(file_path: str, tenant_id: str = None) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Safely locate a file in sandbox/, sandbox/uploads/, or relative workspace path,
    determine its MIME type, and encode as a base64 Data URI (data:<mime>;base64,<encoded>).
    Returns (data_uri, mime_type, error_message).
    """
    if not file_path or not isinstance(file_path, str):
        return None, None, "Invalid file path provided"

    # If it's already a base64 data URI, return as-is
    if file_path.startswith("data:"):
        mime = file_path.split(";", 1)[0].replace("data:", "")
        return file_path, mime, None

    # If it's an external HTTP/HTTPS URL, download it directly to buffer
    if file_path.startswith("http://") or file_path.startswith("https://"):
        try:
            import urllib.request
            import urllib.parse
            req = urllib.request.Request(
                file_path,
                headers={"User-Agent": "AI-Skill-Engine/1.0"}
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw_bytes = resp.read()
                content_type = resp.headers.get_content_type() if hasattr(resp.headers, "get_content_type") else resp.headers.get("Content-Type")

            # Infer MIME type from content_type header or URL path
            url_clean_path = urllib.parse.urlparse(file_path).path
            mime_type = content_type.split(";")[0].strip() if content_type else None
            if not mime_type or mime_type in ("application/octet-stream", "text/plain"):
                guessed, _ = mimetypes.guess_type(url_clean_path)
                if guessed:
                    mime_type = guessed
            if not mime_type:
                mime_type = "image/png"

            b64_str = base64.b64encode(raw_bytes).decode("utf-8")
            return f"data:{mime_type};base64,{b64_str}", mime_type, None
        except Exception as ex:
            pass  # Fall through to local cache/sandbox search if remote download failed

    # Clean leading slashes and URL query params
    import urllib.parse
    unquoted = urllib.parse.unquote(file_path)
    if "://" in unquoted:
        unquoted = "/" + unquoted.split("://", 1)[-1].split("/", 1)[-1]
    cleaned = unquoted.split("?")[0].lstrip("/")
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # backend/
    workspace_dir = os.path.dirname(base_dir)  # project root

    possible_paths = [
        file_path,
        cleaned,
        os.path.join(workspace_dir, cleaned),
        os.path.join(base_dir, cleaned),
        os.path.join(workspace_dir, "sandbox", cleaned),
        os.path.join(workspace_dir, "sandbox", "uploads", cleaned),
        os.path.join(base_dir, "sandbox", cleaned),
        os.path.join(base_dir, "sandbox", "uploads", cleaned),
    ]

    filename = os.path.basename(cleaned)
    if filename:
        for root_dir in [workspace_dir, base_dir]:
            possible_paths.append(os.path.join(root_dir, "sandbox", "uploads", "default", filename))
            possible_paths.append(os.path.join(root_dir, "sandbox", "uploads", "Default Workspace", filename))
            # Deep search sandbox subdirectories
            for sub_name in ("uploads", "outputs"):
                sub_root = os.path.join(root_dir, "sandbox", sub_name)
                if os.path.exists(sub_root):
                    for entry in os.listdir(sub_root):
                        sub_folder = os.path.join(sub_root, entry)
                        if os.path.isdir(sub_folder):
                            possible_paths.append(os.path.join(sub_folder, filename))
                            for fn in os.listdir(sub_folder):
                                if fn == filename or fn.endswith(f"_{filename}") or filename in fn:
                                    possible_paths.append(os.path.join(sub_folder, fn))

    if tenant_id:
        possible_paths.extend([
            os.path.join(workspace_dir, "sandbox", "uploads", str(tenant_id), cleaned),
            os.path.join(workspace_dir, "sandbox", "uploads", str(tenant_id), filename),
            os.path.join(workspace_dir, "sandbox", str(tenant_id), cleaned),
            os.path.join(workspace_dir, "sandbox", str(tenant_id), filename),
        ])

    actual_path = None
    for p in possible_paths:
        if os.path.isfile(p):
            actual_path = p
            break

    if not actual_path:
        return None, None, f"File not found at: {file_path}"

    # Determine MIME type
    mime_type, _ = mimetypes.guess_type(actual_path)
    if not mime_type:
        ext = os.path.splitext(actual_path)[-1].lower()
        mime_map = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp",
            ".gif": "image/gif",
            ".svg": "image/svg+xml",
            ".mp3": "audio/mp3",
            ".wav": "audio/wav",
            ".m4a": "audio/m4a",
            ".aac": "audio/aac",
            ".ogg": "audio/ogg",
            ".flac": "audio/flac",
            ".mp4": "video/mp4",
            ".mov": "video/quicktime",
            ".webm": "video/webm",
            ".mkv": "video/x-matroska",
        }
        mime_type = mime_map.get(ext, "application/octet-stream")

    try:
        with open(actual_path, "rb") as f:
            raw_bytes = f.read()
        b64_str = base64.b64encode(raw_bytes).decode("utf-8")
        data_uri = f"data:{mime_type};base64,{b64_str}"
        return data_uri, mime_type, None
    except Exception as e:
        return None, None, f"Error reading media file: {str(e)}"


def resolve_subagent_model(
    media_type: str,
    tool_model_arg: Optional[str] = None,
    flat_request_model: Optional[str] = None,
    tenant=None
) -> str:
    """
    Model resolution order:
    1. User-selected model from dropdown / API request (image_model, audio_model, video_model)
    2. Tenant-level default setting (tenant.default_image_model, default_audio_model, default_video_model)
    3. Environment fallback (MULTIMODAL_MODEL, GEMINI_API_KEY, or gemini-2.5-flash)
    Note: The user dropdown selection takes strict precedence; LLMs cannot override it.
    """
    if flat_request_model and str(flat_request_model).strip():
        return str(flat_request_model).strip()

    if tenant:
        attr = f"default_{media_type}_model"
        tenant_val = getattr(tenant, attr, None)
        if tenant_val and str(tenant_val).strip():
            return str(tenant_val).strip()

    return os.getenv("MULTIMODAL_MODEL", os.getenv("LLM_MODEL", "gemini-2.5-flash"))


def run_multimodal_subagent(
    media_type: str,
    file_path: str,
    query: Optional[str],
    tenant,
    db: Session,
    session_id: str,
    tool_model_arg: Optional[str] = None,
    flat_request_model: Optional[str] = None
) -> dict:
    """
    Executes a multimodal sub-agent inspection on image, audio, or video files.
    Returns standard tool execution dictionary:
    {
        "stdout": str,
        "stderr": str,
        "exit_code": int,
        "execution_time_ms": int,
        "sandbox_type": "subagent",
        "model_name": str
    }
    """
    start_time = time.time()
    tenant_id = tenant.id if tenant else None

    # 1. Resolve media file to data URI
    data_uri, mime_type, err = resolve_media_to_data_uri(file_path, tenant_id=tenant_id)
    if err or not data_uri:
        elapsed_ms = int((time.time() - start_time) * 1000)
        return {
            "stdout": "",
            "stderr": f"Sub-Agent File Error: {err}",
            "exit_code": 1,
            "execution_time_ms": elapsed_ms,
            "sandbox_type": "subagent",
            "model_name": "none"
        }

    # 2. Resolve model for this specific media type
    resolved_model = resolve_subagent_model(
        media_type=media_type,
        tool_model_arg=tool_model_arg,
        flat_request_model=flat_request_model,
        tenant=tenant
    )

    # 3. Formulate system prompt & user payload based on media type
    system_prompts = {
        "image": (
            "You are a specialized Vision Analyst Sub-Agent. Your role is to carefully inspect "
            "the provided image, diagram, UI screenshot, or document. Transcribe visible text (OCR), "
            "identify components, diagrams, objects, and relationships, and answer the specific query "
            "concisely and accurately. Return clear markdown formatted observations."
        ),
        "audio": (
            "You are a specialized Audio & Speech Analyst Sub-Agent. Your role is to listen to "
            "the provided audio recording, accurately transcribe dialogues, identify speakers, "
            "extract key discussion points, and answer the query with chronological quotes and timestamps."
        ),
        "video": (
            "You are a specialized Video Analyst Sub-Agent. Your role is to analyze the video stream, "
            "understand actions, visual scene changes, spoken dialogue, and on-screen text. Provide a "
            "structured timeline of events [MM:SS] and directly answer the query."
        ),
    }
    sys_prompt = system_prompts.get(media_type, system_prompts["image"])
    user_prompt = query.strip() if query and query.strip() else f"Analyze this {media_type} in detail and summarize all key content."

    # Parse raw base64 and ensure no linebreaks
    raw_b64 = data_uri.split(",", 1)[-1].replace("\n", "").replace("\r", "").strip()
    m_lower = resolved_model.lower()

    # Build multimodal content block tailored to provider specification
    if media_type == "image":
        # Check if direct Anthropic native API format is expected (non-OpenRouter Anthropic)
        if "claude" in m_lower and not ("openrouter" in m_lower or "/" in resolved_model):
            content_block = [
                {"type": "text", "text": user_prompt},
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": mime_type or "image/png",
                        "data": raw_b64
                    }
                }
            ]
        else:
            # Standard OpenAI / Gemini / OpenRouter format (data URI url)
            content_block = [
                {"type": "text", "text": user_prompt},
                {"type": "image_url", "image_url": {"url": data_uri}}
            ]

    elif media_type == "audio":
        fmt = (mime_type.split("/")[-1] if mime_type else "mp3").lower()
        if fmt in ("mpeg", "mpga"):
            fmt = "mp3"
        elif fmt not in ("wav", "mp3", "flac", "ogg", "aac"):
            fmt = "mp3"

        if "gemini" in m_lower:
            # Gemini OpenAI compatibility layer accepts audio as Data URI or input_audio
            content_block = [
                {"type": "text", "text": user_prompt},
                {"type": "image_url", "image_url": {"url": data_uri}}
            ]
        else:
            # OpenAI gpt-4o-audio-preview / standard OpenAI input_audio specification (requires pure base64 without prefix)
            content_block = [
                {"type": "text", "text": user_prompt},
                {
                    "type": "input_audio",
                    "input_audio": {
                        "data": raw_b64,
                        "format": fmt
                    }
                }
            ]

    elif media_type == "video":
        # Gemini natively accepts video Data URIs in its OpenAI-compatible endpoint
        if "gemini" in m_lower:
            content_block = [
                {"type": "text", "text": user_prompt},
                {"type": "image_url", "image_url": {"url": data_uri}}
            ]
        else:
            # For non-Gemini models (like gpt-4o), video data URIs fail with 400 Unsupported MediaType.
            # Send prompt and data URI with explicit instruction
            content_block = [
                {"type": "text", "text": f"{user_prompt}\n\n[Note: Video inspection requested with model {resolved_model}]"},
                {"type": "image_url", "image_url": {"url": data_uri}}
            ]
    else:
        content_block = [{"type": "text", "text": user_prompt}]

    messages = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": content_block}
    ]

    # 4. Invoke LLM Client
    try:
        client = get_llm_client(db=db, tenant_id=tenant_id, model_name=resolved_model)
        completion = client.chat.completions.create(
            model=resolved_model,
            messages=messages,
            temperature=0.2,
            max_tokens=2048,
        )
        response_text = completion.choices[0].message.content or ""
        elapsed_ms = int((time.time() - start_time) * 1000)

        return {
            "stdout": response_text,
            "stderr": "",
            "exit_code": 0,
            "execution_time_ms": elapsed_ms,
            "sandbox_type": "subagent",
            "model_name": resolved_model
        }
    except Exception as e:
        elapsed_ms = int((time.time() - start_time) * 1000)
        return {
            "stdout": "",
            "stderr": f"Sub-Agent ({resolved_model}) execution error: {str(e)}",
            "exit_code": 1,
            "execution_time_ms": elapsed_ms,
            "sandbox_type": "subagent",
            "model_name": resolved_model
        }
