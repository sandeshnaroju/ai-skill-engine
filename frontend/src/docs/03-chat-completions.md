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

## 4. Multi-Model Routing & Specialized Model Overrides

AI Skill Engine allows you to configure a **heterogeneous multi-model pipeline** in a single API call. Instead of forcing one model to handle fast reasoning, expensive vision inspection, media generation, and UI layout simultaneously, you can route sub-tasks to specialized models:

```json
{
  "model": "gemini-2.5-flash",
  "prochat_model": "gemini-2.5-pro",
  "image_model": "gemini-2.5-pro",
  "image_gen_model": "imagen-3.0-generate-002",
  "audio_model": "gemini-2.5-flash",
  "video_model": "gemini-2.5-pro",
  "reasoning_effort": "high",
  "thinking_budget": 4096,
  "stream": true,
  "messages": [
    { "role": "user", "content": "Inspect this schematic image, generate a clean block diagram, and layout the summary report." }
  ]
}
```

### Specialized Model Roles:

- **`model`** *(Primary Orchestrator)*: Drives the conversational agent loop, tool selection, and text streaming (e.g. `gemini-2.5-flash`, `gpt-4o`).
- **`prochat_model`** *(UI & Visual Synthesis)*: A secondary high-capability model used to synthesize structured UI cards, dynamic interactive components, and generative widgets alongside the chat stream.
- **`image_model`** *(Vision Understanding)*: Dispatched to skills and tools when inspecting, describing, OCR-ing, or reasoning over uploaded images, screenshots, and visual schematics.
- **`image_gen_model`** *(Image Generation)*: Dispatched to creative generation tools when the agent produces synthetic images, wireframes, or diagrams.
- **`audio_model`** *(Audio & Speech)*: Dedicated model for transcribing or analyzing speech and audio recordings.
- **`video_model`** *(Video Understanding)*: Specialized multimodal model for deep temporal and frame-by-frame video reasoning.
- **`video_gen_model`** *(Video Generation)*: Model used when generating dynamic video clips from agent prompts.

---

## 5. Request Parameters Reference

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `messages` | array | **Yes** | Standard OpenAI messages list (`[{"role": "user", "content": "..."}]`). Supports multimodal content parts. |
| `model` | string | Optional | Primary conversational model (e.g. `gemini-2.5-flash`, `gpt-4o`, `claude-3-7-sonnet`). |
| `stream` | boolean | Optional | Whether to stream response via Server-Sent Events (SSE). Default `false`. |
| `session_id` | string | Optional | Conversation thread ID. Ensures memory, files, and artifacts persist across requests. |
| `prochat_model` | string | Optional | Secondary model override for ProChat UI and rich component generation. |
| `image_model` | string | Optional | Vision model override for image analysis and visual tool execution. |
| `image_gen_model` | string | Optional | Image generation model override for generative image tools. |
| `audio_model` | string | Optional | Audio processing and transcription model override. |
| `video_model` | string | Optional | Video reasoning model override for temporal analysis. |
| `video_gen_model` | string | Optional | Video generation model override. |
| `reasoning_effort` | string | Optional | Reasoning effort for supported models (`low`, `medium`, `high`). |
| `thinking_budget` | integer | Optional | Token budget allocated for chain-of-thought thinking models. |
| `skill_names` | array | Optional | Restricts the agent to a specific list of skills (e.g. `["code_interpreter", "email"]`). |
| `app_id` | string | Optional | Restricts tools to those bundled inside a predefined App container. |
| `user_data` | object | Optional | Runtime key-value dictionary injecting dynamic secrets/parameters into skills. |
| `temperature` | float | Optional | Sampling temperature between `0.0` and `2.0`. |
| `max_tokens` | integer | Optional | Maximum token limit for the generated completion. |
