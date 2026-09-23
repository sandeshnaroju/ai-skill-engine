# ⚡ Multimodal & Sub-Agent Routing

Rather than forcing a single general-purpose model to execute complex vision, audio transcription, image synthesis, video rendering, and UI generation, AI Skill Engine automatically delegates specialized tasks to dedicated sub-agent models.

---

## 🔀 Sub-Agent Routing Parameters

Pass any of the following parameters in your `POST /api/v1/chat/completions` payload alongside the primary `model`:

| Parameter | Modality / Role | Target Skill / Tool | Recommended Models |
|---|---|---|---|
| `model` | Primary Orchestrator | Main conversation, intent detection, planning | `gemini-2.5-flash`, `gpt-4o`, `claude-3-5-sonnet` |
| `image_gen_model` | AI Image Synthesis | `image_and_video_generation` → `generate_image` | `gemini-2.5-flash-image`, `dall-e-3`, `imagen-3.0` |
| `video_gen_model` | AI Video Synthesis | `image_and_video_generation` → `generate_video` | `veo-3.1-generate-preview` |
| `image_model` | Vision Analysis | `multimodal_analyst` → `analyze_image` | `gemini-2.5-flash`, `gpt-4o`, `claude-3-5-sonnet` |
| `audio_model` | Audio Transcription & Analysis | `multimodal_analyst` → `analyze_audio` | `gemini-2.5-flash`, `gemini-2.5-pro` |
| `video_model` | Video Frame Understanding | `multimodal_analyst` → `analyze_video` | `gemini-2.5-flash`, `gemini-2.5-pro` |
| `prochat_model` | Generative UI (React / JSON) | ProChat Dynamic Components | `genui-mars-0.1`, `gemini-2.5-flash` |

---

## 🖼️ Multimodal Request Payload Format

To submit images or visual assets for analysis, provide structured objects within the `messages.content` array:

```json
{
  "role": "user",
  "content": [
    { "type": "text", "text": "Analyze this system architecture sketch and point out security bottlenecks." },
    { "type": "image_url", "image_url": { "url": "https://example.com/system-architecture.png" } }
  ]
}
```

---

## 🔵 Multimodal & Multi-Sub-Agent (cURL Example)

The following request sends an image for vision analysis while configuring dedicated models for image generation, video rendering, and audio processing:

```bash
curl -N -X POST http://localhost:8000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": [
          {"type": "text", "text": "Generate a modern isometric marketing asset based on this blueprint sketch."},
          {"type": "image_url", "image_url": {"url": "https://example.com/blueprint.png"}}
        ]
      }
    ],
    "model": "gemini-2.5-flash",
    "image_gen_model": "gemini-2.5-flash-image",
    "video_gen_model": "veo-3.1-generate-preview",
    "image_model": "gemini-2.5-flash",
    "audio_model": "gemini-2.5-flash",
    "video_model": "gemini-2.5-flash",
    "stream": true,
    "session_id": "multimodal_session_901",
    "skill_names": ["image_and_video_generation", "multimodal_analyst"]
  }'
```

---

## 🎨 Generative UI (ProChat Model)

When `prochat_model` is specified, AI Skill Engine can return structured UI layouts (JSON schema or executable React component code) directly in the streaming delta chunks:

### Python ProChat Consumption

```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:8000/api/v1", api_key="sk_mgr_YOUR_KEY")

stream = client.chat.completions.create(
    model="gemini-2.5-flash",
    messages=[{"role": "user", "content": "Show an interactive mortgage calculator component"}],
    stream=True,
    extra_body={
        "prochat_model": "genui-mars-0.1"
    }
)

for chunk in stream:
    if not chunk.choices:
        continue
    delta = chunk.choices[0].delta
    
    # Check for Generative UI React Code
    ui_code = getattr(delta, "code", None) or (delta.model_extra or {}).get("code")
    if ui_code:
        print("[ProChat React UI Code]:\n", ui_code)
        
    # Check for Generative UI JSON Schema
    ui_json = getattr(delta, "json", None) or (delta.model_extra or {}).get("json")
    if ui_json:
        print("[ProChat JSON Schema]:\n", ui_json)
```

---

## 🧭 Related Guides

- **[Chat Completions & Streaming](backend-api.md)** — Gateway endpoint parameters and standard streaming SDKs
- **[Skills & MCP Servers](skills-and-mcp.md)** — Understand tool definitions, schemas, and custom tools
- **[Canvas Artifacts & Iframe Integration](frontend-canvas.md)** — Render rich documents and code blocks in Canvas
