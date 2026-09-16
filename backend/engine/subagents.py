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
import uuid
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
    1. User-selected model from dropdown / API request (image_model, image_gen_model, audio_model, video_model)
    2. Tenant-level default setting (tenant.default_image_model, default_image_gen_model, default_audio_model, default_video_model)
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

    default_for_type = {
        "image_gen": "gemini-3.1-flash-image",
        "video_gen": "veo-2.0-generate-001",
        "image": "gemini-2.5-flash",
        "audio": "gemini-2.5-flash",
        "video": "gemini-2.5-flash",
    }
    return os.getenv("MULTIMODAL_MODEL", default_for_type.get(media_type, "gemini-2.5-flash"))


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


def run_image_generation_subagent(
    prompt: str,
    tenant,
    db: Session,
    session_id: str,
    aspect_ratio: Optional[str] = "1:1",
    size: Optional[str] = None,
    style: Optional[str] = None,
    source_image_path: Optional[str] = None,
    flat_request_model: Optional[str] = None,
    tool_model_arg: Optional[str] = None
) -> dict:
    """
    Sub-agent for generating or editing images via modular media provider templates
    (DALL-E, Gemini Flash Image, OpenRouter, and offline Synthesizer).
    Saves the resulting image into sandbox/outputs/{tenant_name}/, registers it as a SessionArtifact,
    and returns rich markdown referencing the image with Canvas embed url.
    """
    import secrets
    from artifacts.manager import create_artifact, mint_embed_token
    from engine.media_providers import resolve_media_provider_chain

    start_time = time.time()
    tenant_name = tenant.name if tenant else "default"
    tenant_id = tenant.id if tenant else None
    if not tenant_id and db:
        from models import Tenant
        def_t = db.query(Tenant).first()
        if def_t:
            tenant_id = def_t.id
            tenant_name = def_t.name
    if not tenant_id:
        tenant_id = "default"

    resolved_model = resolve_subagent_model(
        media_type="image_gen",
        tool_model_arg=tool_model_arg,
        flat_request_model=flat_request_model,
        tenant=tenant
    )

    clean_prompt = (prompt or "").strip()
    if not clean_prompt:
        if source_image_path:
            clean_prompt = f"Stylized high quality visual illustration based on {os.path.basename(source_image_path)}"
        else:
            clean_prompt = "A high-quality cinematic digital artwork illustration"

    target_size = size or "1024x1024"
    if aspect_ratio == "16:9":
        target_size = "1792x1024"
    elif aspect_ratio == "9:16":
        target_size = "1024x1792"
    elif aspect_ratio == "4:3":
        target_size = "1024x768"
    elif aspect_ratio == "3:4":
        target_size = "768x1024"

    try:
        providers = resolve_media_provider_chain(
            model_name=resolved_model,
            media_type="image_gen",
            tenant=tenant,
            db=db
        )

        gen_result = None
        for provider in providers:
            try:
                gen_result = provider.generate_image(
                    prompt=clean_prompt,
                    aspect_ratio=aspect_ratio or "1:1",
                    size=target_size,
                    style=style,
                    source_image_path=source_image_path,
                    tenant_id=tenant_id,
                    db=db
                )
                if gen_result and gen_result.bytes_data:
                    break
            except Exception:
                continue

        if not gen_result or not gen_result.bytes_data:
            from engine.media_providers.synthesizer import SynthesizerFallbackProvider
            gen_result = SynthesizerFallbackProvider(resolved_model).generate_image(
                prompt=clean_prompt,
                aspect_ratio=aspect_ratio or "1:1",
                size=target_size,
                style=style
            )

        image_bytes = gen_result.bytes_data
        ext = f".{gen_result.media_format.lstrip('.')}"
        provider_used = gen_result.provider_name

        # Determine storage directories
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        repo_root = os.path.dirname(backend_dir)
        possible_roots = [
            os.path.join(repo_root, "sandbox", "outputs"),
            os.path.join(backend_dir, "sandbox", "outputs"),
            "/app/sandbox/outputs",
            os.path.abspath("sandbox/outputs")
        ]
        out_base = next((p for p in possible_roots if os.path.isdir(p)), os.path.join(repo_root, "sandbox", "outputs"))
        tenant_out_dir = os.path.join(out_base, tenant_name)
        os.makedirs(tenant_out_dir, exist_ok=True)

        slug = "".join(c if c.isalnum() else "_" for c in clean_prompt[:25]).strip("_").lower()
        if not slug:
            slug = "image"
        unique_fn = f"{uuid.uuid4().hex[:12]}_{slug}{ext}"
        saved_file_path = os.path.join(tenant_out_dir, unique_fn)

        with open(saved_file_path, "wb") as img_file:
            img_file.write(image_bytes)

        media_url = f"/api/v1/files/download/{tenant_name}/{unique_fn}"
        relative_sandbox_path = f"sandbox/outputs/{tenant_name}/{unique_fn}"

        # Register generated image as SessionArtifact
        art_title = clean_prompt[:40].strip().title() or "Generated Image"
        art_type = "svg" if ext == ".svg" else "image"
        raw_content = image_bytes.decode("utf-8", errors="replace") if ext == ".svg" else f"[Generated Image: {unique_fn}]"

        artifact = create_artifact(
            db=db,
            session_id=session_id,
            tenant_id=tenant_id,
            title=art_title,
            filename=unique_fn,
            artifact_type=art_type,
            content=raw_content,
            media_url=media_url
        )

        token = mint_embed_token(artifact.id, tenant_id)
        artifact_data = {
            "id": artifact.id,
            "artifact_id": artifact.id,
            "title": artifact.title,
            "filename": artifact.filename,
            "artifact_type": artifact.artifact_type,
            "current_version": artifact.current_version,
            "token": token,
            "embed_url": f"/embed/canvas?token={token}"
        }

        elapsed_ms = int((time.time() - start_time) * 1000)
        stdout_msg = (
            f"Successfully generated image using **{provider_used}** ({resolved_model})!\n\n"
            f"- **File:** `{unique_fn}`\n"
            f"- **Sandbox Path:** `{relative_sandbox_path}`\n"
            f"- **Size:** {target_size}\n"
            f"- **Prompt:** \"{clean_prompt}\"\n\n"
            f"The image has been opened directly in your Canvas Artifact viewer!"
        )

        return {
            "stdout": stdout_msg,
            "stderr": "",
            "exit_code": 0,
            "execution_time_ms": elapsed_ms,
            "sandbox_type": "subagent",
            "model_name": resolved_model,
            "generated_files": [{
                "filename": unique_fn,
                "original_name": unique_fn,
                "url": media_url,
                "sandbox_path": relative_sandbox_path
            }],
            "artifact_data": artifact_data
        }

    except Exception as e:
        elapsed_ms = int((time.time() - start_time) * 1000)
        return {
            "stdout": "",
            "stderr": f"Image Generation ({resolved_model}) error: {str(e)}",
            "exit_code": 1,
            "execution_time_ms": elapsed_ms,
            "sandbox_type": "subagent",
            "model_name": resolved_model
        }


def run_video_generation_subagent(
    prompt: str,
    tenant,
    db: Session,
    session_id: str,
    duration_seconds: int = 5,
    aspect_ratio: str = "16:9",
    source_image_path: Optional[str] = None,
    flat_request_model: Optional[str] = None,
    tool_model_arg: Optional[str] = None
) -> dict:
    """
    Executes a video generation subagent using modular media provider templates
    (Google Veo 3.1 / 2.0, OpenRouter Video API, xAI Grok, Luma, Fal.ai, and offline Synthesizer).
    Saves output into sandbox/outputs/{tenant}/<uuid>_<slug>.mp4 and registers
    as an interactive Canvas video artifact.
    """
    import secrets
    from artifacts.manager import create_artifact, mint_embed_token
    from engine.media_providers import resolve_media_provider_chain

    start_time = time.time()
    tenant_name = tenant.name if tenant else "default"
    tenant_id = tenant.id if tenant else None
    if not tenant_id and db:
        from models import Tenant
        def_t = db.query(Tenant).first()
        if def_t:
            tenant_id = def_t.id
            tenant_name = def_t.name
    if not tenant_id:
        tenant_id = "default"

    resolved_model = resolve_subagent_model(
        media_type="video_gen",
        tool_model_arg=tool_model_arg,
        flat_request_model=flat_request_model,
        tenant=tenant
    )

    clean_prompt = (prompt or "").strip()
    if not clean_prompt:
        if source_image_path:
            clean_prompt = f"Cinematic video animation and motion based on the starting frame image {os.path.basename(source_image_path)}"
        else:
            clean_prompt = "A breathtaking cinematic video scene with dynamic camera motion"

    duration = 10 if duration_seconds in (10, "10") else 5
    ratio = aspect_ratio if aspect_ratio in ("16:9", "9:16", "1:1") else "16:9"

    try:
        providers = resolve_media_provider_chain(
            model_name=resolved_model,
            media_type="video_gen",
            tenant=tenant,
            db=db
        )

        gen_result = None
        for provider in providers:
            try:
                gen_result = provider.generate_video(
                    prompt=clean_prompt,
                    duration_seconds=duration,
                    aspect_ratio=ratio,
                    source_image_path=source_image_path,
                    tenant_id=tenant_id,
                    db=db
                )
                if gen_result and gen_result.bytes_data:
                    break
            except Exception:
                continue

        if not gen_result or not gen_result.bytes_data:
            from engine.media_providers.synthesizer import SynthesizerFallbackProvider
            gen_result = SynthesizerFallbackProvider(resolved_model).generate_video(
                prompt=clean_prompt,
                duration_seconds=duration,
                aspect_ratio=ratio
            )

        video_bytes = gen_result.bytes_data
        ext = f".{gen_result.media_format.lstrip('.')}"
        provider_used = gen_result.provider_name

        # Determine sandbox output paths
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        repo_root = os.path.dirname(backend_dir)
        possible_roots = [
            os.path.join(repo_root, "sandbox", "outputs"),
            os.path.join(backend_dir, "sandbox", "outputs"),
            "/app/sandbox/outputs",
            os.path.abspath("sandbox/outputs")
        ]
        out_base = next((p for p in possible_roots if os.path.isdir(p)), os.path.join(repo_root, "sandbox", "outputs"))
        tenant_out_dir = os.path.join(out_base, tenant_name)
        os.makedirs(tenant_out_dir, exist_ok=True)

        slug = "".join(c if c.isalnum() else "_" for c in clean_prompt[:25]).strip("_").lower()
        if not slug:
            slug = "clip"
        unique_fn = f"{uuid.uuid4().hex[:12]}_{slug}{ext}"
        saved_file_path = os.path.join(tenant_out_dir, unique_fn)

        with open(saved_file_path, "wb") as vf:
            vf.write(video_bytes)

        media_url = f"/api/v1/files/download/{tenant_name}/{unique_fn}"
        relative_sandbox_path = f"sandbox/outputs/{tenant_name}/{unique_fn}"

        # Register generated video as an interactive Canvas Artifact
        art_title = clean_prompt[:40].strip().title() or "Generated Video"
        raw_content = f"[Generated Video Clip: {unique_fn} | Duration: {duration}s | Aspect Ratio: {ratio}]"

        artifact = create_artifact(
            db=db,
            session_id=session_id,
            tenant_id=tenant_id,
            title=art_title,
            filename=unique_fn,
            artifact_type="video",
            content=raw_content,
            media_url=media_url
        )

        token = mint_embed_token(artifact.id, tenant_id)
        artifact_data = {
            "id": artifact.id,
            "artifact_id": artifact.id,
            "title": artifact.title,
            "filename": artifact.filename,
            "artifact_type": "video",
            "current_version": artifact.current_version,
            "token": token,
            "embed_url": f"/embed/canvas?token={token}"
        }

        elapsed_ms = int((time.time() - start_time) * 1000)
        stdout_msg = (
            f"Successfully generated video using **{provider_used}** ({resolved_model})!\n\n"
            f"- **File:** `{unique_fn}`\n"
            f"- **Sandbox Path:** `{relative_sandbox_path}`\n"
            f"- **Duration:** {duration}s\n"
            f"- **Aspect Ratio:** {ratio}\n"
            f"- **Prompt:** \"{clean_prompt}\"\n\n"
            f"The video has been opened directly in your Canvas Artifact player!"
        )

        return {
            "stdout": stdout_msg,
            "stderr": "",
            "exit_code": 0,
            "execution_time_ms": elapsed_ms,
            "sandbox_type": "subagent",
            "model_name": resolved_model,
            "generated_files": [{
                "filename": unique_fn,
                "original_name": unique_fn,
                "url": media_url,
                "sandbox_path": relative_sandbox_path
            }],
            "artifact_data": artifact_data
        }

    except Exception as e:
        elapsed_ms = int((time.time() - start_time) * 1000)
        return {
            "stdout": "",
            "stderr": f"Video Generation ({resolved_model}) error: {str(e)}",
            "exit_code": 1,
            "execution_time_ms": elapsed_ms,
            "sandbox_type": "subagent",
            "model_name": resolved_model
        }
