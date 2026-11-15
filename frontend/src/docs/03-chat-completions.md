# 💬 Chat Completions & Real-Time Streaming

The primary endpoint for running AI agent workflows is `POST /api/v1/chat/completions`. It follows the standard OpenAI chat wire protocol, while adding real-time agent lifecycle events, live thought process streaming, and interactive artifact generation.

---

## 1. Quick Example: Streaming in Python

When `"stream": true` is passed, the engine returns a Server-Sent Events (SSE) stream delivering real-time tokens:

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:2704/api/v1",
    api_key="sk_mgr_YOUR_TENANT_API_KEY"
)

stream = client.chat.completions.create(
    model="gemini-2.5-flash",
    messages=[
        {"role": "user", "content": "Analyze the sales trend for Q1 and summarize key takeaways."}
    ],
    stream=True
)

for chunk in stream:
    # Inspect live text response
    if chunk.choices and chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
```

---

## 2. Advanced Streaming Deltas (UI Guide)

Unlike standard LLMs that only return raw text tokens, AI Skill Engine streams rich execution lifecycle deltas inside `chunk.choices[0].delta`. You can use these to build interactive, ChatGPT/Claude-style interfaces:

### Stream Chunk Structure
```json
data: {
  "choices": [{
    "delta": {
      "status": "Invoking Python Code Runner (Skill: Code Interpreter)...",
      "reasoning": "I will import pandas and plot the sales data.",
      "content": "Here is the summary of your Q1 sales:",
      "tool_call": {
        "name": "run_python",
        "arguments": {"code": "import pandas as pd\n..."}
      },
      "tool_result": {
        "tool_name": "run_python",
        "stdout": "Q1 Revenue: $1.2M",
        "exit_code": 0
      },
      "artifacts": [{
        "artifact_id": "art_12345",
        "title": "Q1 Financial Summary",
        "artifact_type": "spreadsheet",
        "embed_url": "/embed/canvas?token=..."
      }]
    }
  }]
}
```

### How to Render These in Your Frontend:

| Delta Field | What It Is | How to Render in Your UI |
| :--- | :--- | :--- |
| **`delta.status`** | Real-time orchestrator lifecycle updates (`"Analyzing query..."`, `"Invoking Python Sandbox..."`, `"Finished in 42ms"`). | Display in a step-by-step progress stepper or status pill. |
| **`delta.reasoning`** | Live chain-of-thought tokens from reasoning models (e.g. Gemini Thinking, DeepSeek R1). | Render inside a collapsible "Thought Process" drawer or accordion. |
| **`delta.tool_call` & `delta.tool_result`** | The exact command/arguments sent to the sandbox, followed by stdout/stderr output. | Show an interactive code/terminal drawer showing what tools were dispatched. |
| **`delta.content`** | The final assistant response markdown tokens. | Standard chat bubble / message markdown renderer. |
| **`delta.artifacts`** | Array of newly generated documents, sheets, slides, or CAD models. | Render an interactive "Open Canvas" button or embed the URL in an iframe. |

---

## 3. JavaScript / Web Client Example

Here is how to consume the stream in a modern browser using standard `fetch`:

```javascript
async function sendChatMessage(prompt) {
  const response = await fetch("http://localhost:2704/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer sk_mgr_YOUR_TENANT_API_KEY"
    },
    body: JSON.stringify({
      model: "gemini-2.5-flash",
      stream: true,
      session_id: "user_session_42",
      messages: [{ role: "user", content: prompt }]
    })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      if (trimmed === "data: [DONE]") return;

      const payload = JSON.parse(trimmed.slice(6));
      const delta = payload.choices?.[0]?.delta;
      if (!delta) continue;

      if (delta.status) console.log("Status update:", delta.status);
      if (delta.reasoning) console.log("Thinking:", delta.reasoning);
      if (delta.content) process.stdout.write(delta.content);
      if (delta.artifacts) console.log("Generated artifacts:", delta.artifacts);
    }
  }
}
```

---

## 4. Request Parameters Reference

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `messages` | array | **Yes** | Standard OpenAI messages list (`[{"role": "user", "content": "..."}]`). Supports multimodal images/audio. |
| `model` | string | Optional | Model to invoke (e.g. `gemini-2.5-flash`, `gpt-4o`, `claude-3-7-sonnet`). |
| `stream` | boolean | Optional | Whether to stream response via Server-Sent Events (SSE). Default `false`. |
| `session_id` | string | Optional | Unique conversation ID. Ensures past conversation turns, files, and artifacts persist across requests. |
| `skill_names` | array | Optional | Explicitly restricts the agent to a subset of skills (e.g. `["code_interpreter", "email"]`). |
| `app_id` | string | Optional | Restricts tools to those bundled inside a predefined App container. |
| `user_data` | object | Optional | Runtime key-value dictionary to inject secrets or parameters dynamically into skills. |
