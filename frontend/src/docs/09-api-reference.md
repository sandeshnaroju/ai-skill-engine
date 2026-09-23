# 📡 API Reference & Integration

AI Skill Engine provides an enterprise-grade OpenAI-compatible gateway (`POST /api/v1/chat/completions`) with built-in multi-turn tool execution, code sandboxing, and multimodal sub-agent routing.

---

## 🔑 Authentication

All requests require your Tenant API Key in standard HTTP Bearer format:

```http
Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY
```
*(Alternatively, you can pass the header `X-API-Key: sk_mgr_YOUR_TENANT_API_KEY`)*

---

## 📡 Gateway Endpoint: `/api/v1/chat/completions`

### Request Parameters:

| Parameter | Type | Required | Description |
|---|---|---|---|
| `messages` | Array of Objects | **Yes** | Standard OpenAI message objects (`role`: `user` \| `assistant` \| `system`, `content`: string or multimodal array). |
| `model` | String | Optional | The registered model identifier (e.g. `gemini-2.5-flash`, `gpt-4o`). Defaults to the tenant's default model. |
| `stream` | Boolean | Optional | If `true`, returns a Server-Sent Events (SSE) stream. Default is `false`. |
| `session_id` | String | Optional | Unique conversation thread identifier. Tracks conversation context, uploaded files, and generated artifacts. |
| `app_id` | String | Optional | Scopes available tools to only those included in a named App package (e.g. `financial_advisor`). |
| `skill_names` | Array of Strings | Optional | Explicitly enables specific skills by name (e.g. `["code_interpreter", "artifact_editor"]`). |
| `temperature` | Float | Optional | Sampling temperature between `0.0` and `2.0`. |
| `max_tokens` | Integer | Optional | Maximum completion tokens to generate. |

---

## ⚡ Multimodal & Sub-Agent Routing Parameters

In addition to the primary `model`, AI Skill Engine allows routing specialized sub-tasks to dedicated models in a single API call:

| Parameter | Modality / Role | Target Skill / Tool | Recommended Models |
|---|---|---|---|
| `image_gen_model` | AI Image Generation | `image_and_video_generation` (`generate_image`) | `gemini-2.5-flash-image`, `dall-e-3`, `imagen-3.0` |
| `video_gen_model` | AI Video Generation | `image_and_video_generation` (`generate_video`) | `veo-3.1-generate-preview` |
| `image_model` | Vision Analysis | `multimodal_analyst` (`analyze_image`) | `gemini-2.5-flash`, `gpt-4o`, `claude-3-5-sonnet` |
| `audio_model` | Audio Analysis | `multimodal_analyst` (`analyze_audio`) | `gemini-2.5-flash`, `gemini-2.5-pro` |
| `video_model` | Video Frame Analysis | `multimodal_analyst` (`analyze_video`) | `gemini-2.5-flash`, `gemini-2.5-pro` |
| `prochat_model` | Generative UI | ProChat Dynamic React & JSON UI | `genui-mars-0.1`, `gemini-2.5-flash` |

---

## 📡 Server-Sent Events (SSE) Streaming Format

When `"stream": true`, the endpoint streams JSON chunks prefixed with `data: `:

```text
data: {"choices": [{"delta": {"content": "Planning calculations..."}}]}
data: {"choices": [{"delta": {"reasoning": "I need to import pandas and load the CSV."}}]}
data: {"choices": [{"delta": {"tool_call": {"name": "run_python", "arguments": {"code": "import pandas as pd..."}}}}]}
data: {"choices": [{"delta": {"tool_result": {"output": "Mean: 42.5\n", "generated_files": ["chart.png"]}}}]}
data: {"choices": [{"delta": {"artifacts": [{"artifact_id": "uuid", "title": "Report", "embed_url": "..."}]}}]}
data: [DONE]
```

### Delta Fields:
- `delta.content`: Streamed text response tokens.
- `delta.reasoning`: Live thought process and intermediate reasoning of the agent.
- `delta.tool_call`: Tool invocation name and argument payloads dispatched to the sandbox.
- `delta.tool_result`: Output captured from the sandbox (stdout, stderr, generated file paths).
- `delta.artifacts`: Newly created or updated Canvas artifacts with signed HMAC embed URLs.

---

## 💻 Code Examples

### 1. Python (Official OpenAI SDK)
Because the engine implements the OpenAI wire protocol, you can use the official OpenAI Python library directly:

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:2704/api/v1",
    api_key="sk_mgr_YOUR_TENANT_API_KEY"
)

response_stream = client.chat.completions.create(
    model="gemini-2.5-flash",
    messages=[
        {"role": "user", "content": "Compute monthly mortgage payments for $500k at 6.8% over 30 years using Python."}
    ],
    stream=True,
    extra_body={
        "session_id": "mortgage_calc_session_101",
        "skill_names": ["code_interpreter"]
    }
)

for chunk in response_stream:
    if not chunk.choices:
        continue
    delta = chunk.choices[0].delta
    
    # Text token
    if delta.content:
        print(delta.content, end="", flush=True)
        
    # Tool execution output
    tool_result = getattr(delta, "tool_result", None) or (delta.model_extra or {}).get("tool_result")
    if tool_result:
        print(f"\n[Sandbox Execution]: {tool_result}")
```

---

### 2. JavaScript / Node.js (Fetch & SSE Streaming)

```javascript
const response = await fetch("http://localhost:2704/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer sk_mgr_YOUR_TENANT_API_KEY"
  },
  body: JSON.stringify({
    messages: [{ role: "user", content: "Draft an Executive Summary in Canvas" }],
    stream: true,
    session_id: "user_session_402",
    skill_names: ["artifact_editor"]
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder("utf-8");
let buffer = "";

while (true) {
  const { value, done } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split("\n");
  buffer = lines.pop();

  for (const line of lines) {
    const clean = line.trim();
    if (!clean.startsWith("data: ") || clean === "data: [DONE]") continue;

    try {
      const data = JSON.parse(clean.substring(6));
      const delta = data.choices?.[0]?.delta;
      if (!delta) continue;

      if (delta.content) process.stdout.write(delta.content);
      if (delta.artifacts && Array.isArray(delta.artifacts)) {
        delta.artifacts.forEach(art => {
          console.log("\n[Artifact Created]:", art.title, art.embed_url);
        });
      }
    } catch (err) {}
  }
}
```

---

### 3. cURL (Synchronous Request)

```bash
curl -X POST http://localhost:2704/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY" \
  -d '{
    "messages": [{"role": "user", "content": "What is the status of system memory?"}],
    "stream": false,
    "model": "gemini-2.5-flash",
    "skill_names": ["system_info"]
  }'
```

---

## 🧭 Next Steps

- **[Universal Canvas Artifacts Guide](13-artifacts-canvas.md)**: Drop-in iframe specs and headless endpoints.
- **[Session Storage & Cloud Files](14-session-storage.md)**: File upload, listing, and session purge lifecycles.
- **[Skills & MCP Servers](17-skills-and-mcp.md)**: Define custom tools and connect external MCP servers.
