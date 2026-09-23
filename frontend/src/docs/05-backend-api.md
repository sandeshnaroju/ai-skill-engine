# 📡 Chat Completions & Streaming Gateway

AI Skill Engine exposes an **OpenAI-compatible** gateway endpoint at `/api/v1/chat/completions`. Any standard OpenAI client, library, or HTTP tool can connect with zero protocol changes—simply set the `base_url` and `api_key`.

---

## 🔑 Authentication

All API calls authenticate using your Tenant API Key in standard HTTP Bearer format:

```http
Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY
```

*(Alternatively, you can pass the header `X-API-Key: sk_mgr_YOUR_TENANT_API_KEY`)*

---

## 📡 Primary Endpoint: `POST /api/v1/chat/completions`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `messages` | Array of Objects | **Yes** | Standard OpenAI message objects (`role`: `user` \| `assistant` \| `system`, `content`: string or multimodal array). |
| `model` | String | Optional | The registered model identifier (e.g. `gemini-2.5-flash`, `gpt-4o`). Defaults to the tenant default model. |
| `stream` | Boolean | Optional | If `true`, returns a Server-Sent Events (SSE) `text/event-stream`. Default is `false`. |
| `session_id` | String | Optional | Unique conversation thread identifier. Tracks conversation context, uploaded files, and generated artifacts. |
| `app_id` | String | Optional | Scopes available tools to only those included in a named App package (e.g. `customer_support_prod`). |
| `skill_names` | Array of Strings | Optional | Explicitly enables specific skills by name (e.g. `["weather_fetcher", "math_solver"]`). |
| `temperature` | Float | Optional | Sampling temperature between `0.0` and `2.0`. |
| `max_tokens` | Integer | Optional | Maximum completion tokens to generate. |

---

## ⚡ Server-Sent Events (SSE) Streaming Format

When `"stream": true`, the endpoint streams JSON chunks prefixed with `data: `:

```text
data: {"choices": [{"delta": {"content": "Planning calculations..."}}]}
data: {"choices": [{"delta": {"reasoning": "I need to import pandas and load the CSV."}}]}
data: {"choices": [{"delta": {"tool_call": {"name": "run_python", "arguments": {"code": "import pandas as pd..."}}}}]}
data: {"choices": [{"delta": {"tool_result": {"tool_name": "run_python", "exit_code": 0, "stdout": "Mean: 42.5\n"}}}]}
data: {"choices": [{"delta": {"artifacts": [{"artifact_id": "uuid", "title": "Report", "embed_url": "..."}]}}]}
data: {"type": "done", "tools_called": ["run_python"]}
data: [DONE]
```

---

## 🔵 Streaming Request Examples

### 1. cURL (Streaming)

```bash
curl -N -X POST http://localhost:8000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY" \
  -d '{
    "messages": [
      {"role": "user", "content": "Calculate 20,000 RS at 12% interest for 20 years"}
    ],
    "model": "gemini-2.5-flash",
    "stream": true,
    "session_id": "chatbot_user_session_101",
    "app_id": "customer_support_prod",
    "skill_names": ["weather_fetcher", "math_solver"]
  }'
```

### 2. Python (Official OpenAI SDK)

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8000/api/v1",
    api_key="sk_mgr_YOUR_TENANT_API_KEY"
)

response_stream = client.chat.completions.create(
    model="gemini-2.5-flash",
    messages=[{"role": "user", "content": "Calculate compound interest for 20k @ 12% for 20 yrs"}],
    stream=True,
    extra_body={
        "session_id": "chatbot_user_session_101",
        "app_id": "customer_support_prod",
        "skill_names": ["weather_fetcher", "math_solver"]
    }
)

for chunk in response_stream:
    raw = chunk.model_dump() if hasattr(chunk, "model_dump") else dict(chunk)
    if raw.get("type") == "done":
        print(f"\n[DONE] Tools called: {raw.get('tools_called')}")
        continue
    elif raw.get("type") == "error":
        print(f"\n[ERROR] {raw.get('detail')}")
        continue

    if not chunk.choices:
        continue
    delta = chunk.choices[0].delta

    # Assistant Text Content
    if delta.content:
        print(delta.content, end="", flush=True)

    # Thinking / Status Reasoning
    reasoning = getattr(delta, "reasoning", None) or (delta.model_extra or {}).get("reasoning")
    if reasoning:
        print(f"\n[Reasoning] {reasoning}")

    # Tool Execution Calls
    tool_call = getattr(delta, "tool_call", None) or (delta.model_extra or {}).get("tool_call")
    if tool_call:
        print(f"\n[Tool Call] {tool_call.get('name')} with args: {tool_call.get('arguments')}")

    # Tool Execution Results
    tool_result = getattr(delta, "tool_result", None) or (delta.model_extra or {}).get("tool_result")
    if tool_result:
        print(f"\n[Tool Result] {tool_result.get('tool_name')} exit: {tool_result.get('exit_code')}")
        print(f"Stdout: {tool_result.get('stdout')}")
```

### 3. JavaScript / TypeScript (Native Fetch)

```javascript
const response = await fetch("http://localhost:8000/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer sk_mgr_YOUR_TENANT_API_KEY"
  },
  body: JSON.stringify({
    messages: [{ role: "user", content: "Calculate compound interest for 20k @ 12% for 20 yrs" }],
    stream: true,
    session_id: "user_session_202",
    app_id: "customer_support_prod",
    skill_names: ["weather_fetcher", "math_solver"]
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
    const cleanLine = line.trim();
    if (!cleanLine.startsWith("data: ")) continue;
    const rawData = cleanLine.substring(6);
    if (rawData === "[DONE]") break;

    try {
      const dataJson = JSON.parse(rawData);
      if (dataJson.type === "done") { console.log(`\n[DONE] Tools: ${dataJson.tools_called}`); continue; }
      if (dataJson.type === "error") { console.error(`\n[ERROR] ${dataJson.detail}`); continue; }

      const delta = dataJson.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) process.stdout.write(delta.content);
      if (delta.reasoning) console.log(`\n[Status] ${delta.reasoning}`);
      if (delta.tool_call) console.log(`\n[Tool Call] ${delta.tool_call.name}`, delta.tool_call.arguments);
      if (delta.tool_result) console.log(`\n[Tool Result] ${delta.tool_result.tool_name} exit=${delta.tool_result.exit_code}`);
    } catch (err) {}
  }
}
```

---

## 🔵 Synchronous (Non-Streaming) Requests

If `"stream": false`, the endpoint waits for all agent turns, tool invocations, and sub-agent delegates to complete before returning the final response JSON.

### cURL (Synchronous)

```bash
curl -X POST http://localhost:8000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY" \
  -d '{
    "messages": [{"role": "user", "content": "Check server disk space"}],
    "stream": false,
    "session_id": "user_session_404",
    "skill_names": ["math_solver"]
  }'
```

### Python (Synchronous)

```python
import requests

response = requests.post(
    "http://localhost:8000/api/v1/chat/completions",
    headers={"Authorization": "Bearer sk_mgr_YOUR_TENANT_API_KEY"},
    json={
        "messages": [{"role": "user", "content": "Check server disk space"}],
        "stream": False,
        "session_id": "user_session_404",
        "skill_names": ["math_solver"]
    }
).json()

print("Assistant Reply:", response["choices"][0]["message"]["content"])
print("Executed Tools:", response.get("executed_tools", []))
```

---

## 🧭 Related Backend Guides

- **[Multimodal & Sub-Agent Routing](06-backend-multimodal.md)** — Image generation, video generation, vision analysis, and ProChat routing
- **[Files & Session Lifecycle](07-backend-files.md)** — File uploads, session files listing, single file deletion, and cascade purge
- **[Artifacts & Management APIs](08-backend-management.md)** — Artifacts REST/SSE endpoints, MCP servers, and audit logs
