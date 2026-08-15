# ⚡ AI Skill Engine

> **Readymade self-hostable backend server for chatbots — with a built-in admin dashboard.**

Connect your chatbot with a single Chat Completion API call. AI Skill Engine handles the rest — multi-turn tool execution, sandboxed code runs, MCP integrations, generative UI rendering via ProChat, audit logs, and a full visual admin dashboard — all in one self-hosted package. Drop-in compatible with the OpenAI API.

![Dashboard](https://img.shields.io/badge/dashboard-React-blueviolet) ![API](https://img.shields.io/badge/API-OpenAI%20Compatible-green) ![License](https://img.shields.io/badge/license-Apache%202.0-blue)

---

> [!NOTE]
> **Cloud-Hosted Setup Coming Soon!** ☁️
> We are building a fully managed cloud version of AI Skill Engine. If you want to skip self-hosting and deployment maintenance, stay tuned!

---

## ✨ What It Does

Standard AI chatbots are great conversationalists — but they can't act. They can't run code, call your APIs, or touch your files without a backend to bridge that gap. **AI Skill Engine** is that backend, ready to self-host in minutes.

Point your chatbot at this server's single `/api/v1/chat/completions` endpoint and immediately unlock:

1. **Read & Analyze Uploaded Documents**: Instantly read, search, and extract key details from uploaded contracts, receipts, or PDF files.
2. **Connect to Web APIs**: Retrieve live information, query third-party services, and trigger external API requests automatically.
3. **Generate Reports & Convert HTML**: Draft and render print-ready PDF reports or convert web-style HTML templates into polished documents.
4. **Compute Math & Chart Data Visually**: Parse spreadsheets (Excel/CSV), run complex calculations, and plot charts for presentations.
5. **Deep Problem Solving (Up to 25 turns)**: Execute long-running multi-turn logical steps and diagnostics without getting interrupted.
6. **No-Code Tool Customization**: Extend your chatbot's abilities by adding, editing, or enabling new capabilities (Skills) directly from a visual dashboard catalog.
7. **Secure, Sandboxed Execution**: Run calculations and custom scripts inside safe, isolated containers to keep your servers and business data protected.
8. **Universal Remote (MCP Hub)**: Connect your chatbot directly to databases, GitHub, or filesystems using standard Model Context Protocol.
9. **Generative UI with ProChat**: Return dynamic, interactive UI components (charts, forms, dashboards) directly inside the chat response — no extra frontend code needed.
10. **OpenAI Drop-in Upgrade**: Supercharge your existing AI application instantly by pointing its API URL to this engine.
11. **Built-in Admin Dashboard**: View chatbot thoughts, tool triggers, sandbox logs, token usage, and costs in a beautiful visual turn-by-turn timeline.

---

## 📸 Screenshots

<table width="100%">
  <tr>
    <td width="50%" align="center">
      <b>💬 Chat Playground</b><br/>
      <img src="screenshots/playground.png" alt="Chat Playground" width="100%"/>
    </td>
    <td width="50%" align="center">
      <b>🛠️ Skills Catalog & Editor</b><br/>
      <img src="screenshots/skills.png" alt="Skills Catalog" width="100%"/>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <b>📦 App Groups & Packaging</b><br/>
      <img src="screenshots/App%20groups.png" alt="App Groups" width="100%"/>
    </td>
    <td width="50%" align="center">
      <b>📊 Cost & Usage Analytics</b><br/>
      <img src="screenshots/usage.png" alt="Usage Summary" width="100%"/>
    </td>
  </tr>
  <tr>
    <td colspan="2" align="center">
      <b>🔌 Built-in API Tester</b><br/>
      <img src="screenshots/Api%20tester.png" alt="API Tester" width="80%"/>
    </td>
  </tr>
</table>

---

## 🚀 Quick Start

### 🚀 Option A: Run directly from Docker Hub (Zero-Clone)

You can run the pre-built image directly from Docker Hub without cloning the source code.

1. **Start the container**:
   ```bash
   docker run -d \
     --name ai_skill_engine \
     -p 2704:2704 \
     -v /var/run/docker.sock:/var/run/docker.sock \
     -v "$(pwd)/sandbox:/app/sandbox" \
     -v "$(pwd)/skill_manager.db:/app/skill_manager.db" \
     -e HOST_SANDBOX_DIR="$(pwd)/sandbox" \
     -e DATABASE_URL="sqlite:////app/skill_manager.db" \
     --restart unless-stopped \
     sandeshnaroju/ai-skill-engine:latest
   ```
   *(Note: Set `DATABASE_URL` environment variable if you want to use an external PostgreSQL database instead of the default local SQLite db)*

2. **Access the application**:
   Open **http://localhost:2704** in your browser.
   - To check logs: `docker logs -f ai_skill_engine`
   - To stop: `docker stop ai_skill_engine`

---

### 🐳 Option B: Build and Run locally with Docker

Running with Docker compiles the React frontend and packages the FastAPI server into a single container. It maps port `2704` and links the host's Docker socket to support sandboxed code runs.

1. **Clone the repository**:
   ```bash
   git clone https://github.com/sandeshnaroju/ai-skill-engine.git
   cd ai-skill-engine
   ```

2. **Start the stack**:
   ```bash
   ./run_docker.sh
   ```
   *This script pre-creates persistent files, compiles the multi-stage image, and starts the container in the background.*

3. **Access the application**:
   Open **http://localhost:2704** in your browser.
   - To check container logs: `docker logs -f ai_skill_engine`
   - To stop the application: `docker stop ai_skill_engine`

---

### 💻 Option C: Run locally without Docker (Local Setup)

1. **Clone the repository**:
   ```bash
   git clone https://github.com/sandeshnaroju/ai-skill-engine.git
   cd ai-skill-engine
   ```

2. **Setup Backend**:
   ```bash
   cd backend
   pip install -r requirements.txt
   cd ..
   ```

3. **Build Frontend**:
   ```bash
   cd frontend
   npm install
   npm run build
   cd ..
   ```

4. **Start Server**:
   ```bash
   ./run_server.sh
   # or manually:
   cd backend && uvicorn main:app --host 0.0.0.0 --port 2704 --reload
   ```

5. **Access the application**:
   Open **http://localhost:2704** in your browser.

## ⚙️ Environment Variables

You can configure several features of the AI Skill Engine (like SMTP for email OTP verification) by setting environment variables.

### Key Configuration Variables

| Variable | Description | Example |
| --- | --- | --- |
| `DATABASE_URL` | Connection URI of your database (defaults to local SQLite `skill_manager.db`) | `postgresql://postgres:password@localhost:5432/dbname` |
| `SMTP_HOST` | Hostname of the SMTP server to send OTP codes | `smtp.gmail.com` |
| `SMTP_PORT` | Port of the SMTP server (default: 587) | `587` |
| `SMTP_USERNAME` | Username for SMTP server | `user@gmail.com` |
| `SMTP_PASSWORD` | Password or App Password for SMTP server | `your-smtp-password` |
| `SMTP_SENDER` | Sender email address (default: `SMTP_USERNAME`) | `no-reply@mycompany.com` |

---

### Passing Environment Variables to Docker

There are two primary ways to supply these environment variables to the container:

#### Method A: Using a `.env` file (Recommended)
1. Create a `.env` file in your root workspace:
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USERNAME=your-email@gmail.com
   SMTP_PASSWORD=your-app-password
   ```
2. When starting the container:
   - **For local run scripts (`run_docker.sh`)**: The script automatically mounts this file into `/app/.env` where `python-dotenv` loads it automatically.
   - **For custom Docker commands**: Include the `--env-file` parameter:
     ```bash
     docker run -d \
       --name ai_skill_engine \
       -p 2704:2704 \
       -v /var/run/docker.sock:/var/run/docker.sock \
       -v "$(pwd)/sandbox:/app/sandbox" \
       -v "$(pwd)/skill_manager.db:/app/skill_manager.db" \
       --env-file "$(pwd)/.env" \
       -e HOST_SANDBOX_DIR="$(pwd)/sandbox" \
       --restart unless-stopped \
       sandeshnaroju/ai-skill-engine:latest
     ```

#### Method B: Using `-e` CLI flags
Pass environment variables directly into the command line when running the container:
```bash
docker run -d \
  --name ai_skill_engine \
  -p 2704:2704 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$(pwd)/sandbox:/app/sandbox" \
  -v "$(pwd)/skill_manager.db:/app/skill_manager.db" \
  -e HOST_SANDBOX_DIR="$(pwd)/sandbox" \
  -e SMTP_HOST="smtp.gmail.com" \
  -e SMTP_PORT="587" \
  -e SMTP_USERNAME="user@gmail.com" \
  -e SMTP_PASSWORD="your-app-password" \
  --restart unless-stopped \
  sandeshnaroju/ai-skill-engine:latest
```

---

## 🔑 Configuring Models

AI Skill Engine does **not** use environment API keys. Models are registered per-tenant via the dashboard:

1. Go to **Tenants & Keys** → click **Manage** on a tenant
2. Add a provider (OpenAI, Gemini, OpenRouter, or Custom)
3. Enter the model name and its API key
4. Use that tenant's API key when calling the chat endpoint

This lets you register different models for different tenants independently.

---

### 🎨 Enabling Generative UI with ProChat

AI Skill Engine supports **ProChat** — a generative UI protocol that lets your chatbot respond with rich, interactive UI components (data tables, forms, charts) rendered directly inside the chat interface.

To enable ProChat, each tenant needs a ProChat model registered alongside their regular LLM:

1. **Create an account** at [prochat.dev](https://prochat.dev) and generate an API key from your dashboard.
2. Go to **Tenants & Keys** in the Admin Dashboard → click **Manage** on your tenant.
3. Click **Register Model** and fill in:
   - **Provider**: `prochat`
   - **Model Name**: the model identifier from your prochat.dev dashboard (e.g. `genui-mars-0.1`)
   - **API Key**: your ProChat API key from prochat.dev
4. Save the model.

Once registered, pass the `prochat_model` field in your API request (see [API Usage](#-api-usage) below) to activate generative UI for that call.

> 💡 **How it works**: When you include `"prochat_model": "genui-mars-0.1"` in your chat completion request, AI Skill Engine runs your regular LLM as usual. Once the final answer is ready, it forwards the full conversation (including the LLM's response) to the ProChat API. ProChat returns a rendered UI component — such as a data table, chart, or form — which is streamed back alongside the text response and displayed inline in the chat. Your tenant must have a model registered with `provider: prochat` for this to work.

## 📦 Sandbox Environments

AI Skill Engine runs python code and bash scripts inside secure, isolated sandboxes. You can select and configure the active sandbox environment directly from the **Sandbox Settings** page in the dashboard:

1. **Docker Sandbox (Default)**: Runs scripts inside a local ephemeral Docker container (`ai-sandbox-python:latest`). Keeps your host environment safe.
2. **Process Sandbox**: Executes commands directly on the host server process. Recommended only for trusted private local setups.
3. **Azure Container Apps (ACA) Sandboxes**: Offloads executions to secure, Hyper-V isolated container pools. Requires Entra ID App credentials (`Client ID`, `Client Secret`, `Tenant ID`) and a `Session Pool Endpoint` (obtainable from the [Azure portal](https://portal.azure.com) or [sandboxes.azure.com](https://sandboxes.azure.com)).
4. **E2B Sandboxes**: Runs scripts inside specialized, stateful agentic micro-VMs. Requires an `E2B API Key`.
5. **Fly.io Sandboxes**: Routes execution to Fly.io Machines. Requires a `Fly API Token` and `App Name`.
6. **AWS Lambda**: Routes calculations to serverless Lambdas. Requires AWS keys (`Access Key`, `Secret Key`), `Region`, and `Function Name`.

> 🔒 **Security Notice:** If any remote sandbox (Azure, E2B, Fly.io, or Lambda) is active, execution strictly targets that cloud environment. If the sandbox call fails or credentials are incomplete, it returns the error immediately and **never** silently falls back to local host processes.

---

## 💾 Sandbox File Operations & Storage

Managing files between your chatbot and remote execution sandboxes is handled in two ways:

### 1. Auto-Download Pipeline
When running code inside the Azure ACA Sandbox, the system automatically:
- Scans the sandbox filesystem for newly created files (e.g. PDFs, CSVs, plots) right after execution.
- Transfers them back to the host server outputs folder.
- Generates click-to-download links and surfaces them directly in the Chat Playground.

### 2. Sandbox File Manager Skill
To give the chatbot explicit control over its environment, enable the `sandbox_file_manager` skill. This grants the LLM access to three tools:
- `list_sandbox_files`: Lists all files present in the active sandbox workspace.
- `download_sandbox_file`: Pulls a specific file from the remote sandbox to the local backend server.
- `upload_sandbox_file`: Uploads local server inputs into the remote sandbox workspace for processing.

### 3. Cloud Storage Skill
For production environments where local files shouldn't be shared directly, use the `cloud_storage` skill to upload generated outputs directly to cloud buckets (AWS S3 or Azure Blob Storage) and retrieve secure cloud URLs.

---


## 🌐 API Usage

You can authenticate HTTP requests using standard HTTP Bearer token headers (supported natively by standard OpenAI SDKs):

```http
POST /api/v1/chat/completions
Authorization: Bearer sk_asr_YOUR_TENANT_KEY
Content-Type: application/json

{
  "messages": [{"role": "user", "content": "Check disk space"}],
  "model": "gemini-2.5-flash",
  "stream": true,
  "session_id": "user_123_thread_1",
  "app_id": "your-app-group-uuid",
  "skill_names": ["system_diagnostics", "weather_fetcher"]
}
```

### Request Fields

| Field | Type | Default | Description |
|---|---|---|---|
| `messages` | array | required | OpenAI-style message array |
| `model` | string | tenant default | Model name (must be registered for the tenant) |
| `stream` | bool | `false` | Stream response as SSE events |
| `session_id` | string | `"default_session"` | Arbitrary ID to label this conversation in execution logs |
| `app_id` | string | `null` | UUID of an App group — scopes available tools to that App's skills only |
| `skill_names` | array of strings | `null` | Direct filter of skill names to load in this request context. If combined with `app_id`, it intersects (only matching skills in both list and App are used). |
| `user_data` | object | `null` | Key-value pairs (credentials, API keys, tokens) dynamically resolved inside skill tools (e.g. URLs, headers, arguments) during action runs. Keep secrets hidden from the LLM. |
| `prochat_model` | string | `null` | ProChat model name (e.g. `genui-mars-0.1`) — when set, AI Skill Engine forwards the conversation to ProChat after the LLM responds, generating a rich UI component rendered inline in the chat. Requires a `prochat` provider model registered for the tenant. |

> **Note:** API client conversations are **not** stored in the chat history. Only Dashboard Chat Playground sessions are persisted. Tool execution results are always logged in the API Execution Logs.

### From Python (OpenAI SDK)

The OpenAI SDK doesn't natively support `session_id` / `app_id` / `user_data` / `skill_names`, so pass them via `extra_body`:

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:2704/api/v1",
    api_key="sk_asr_YOUR_TENANT_KEY"
)

stream = client.chat.completions.create(
    model="gemini-2.5-flash",
    messages=[{"role": "user", "content": "Fetch weather in London"}],
    stream=True,
    extra_body={
        "session_id": "user_123_thread_1",    # labels this call in execution logs
        "app_id": "your-app-group-uuid",       # scopes tools to this App's skills only
        "skill_names": ["weather_fetcher"],    # optional: limit execution to specific skills
        "prochat_model": "genui-mars-0.1",     # optional: enable ProChat generative UI
        "user_data": {
            "openweathermap_api_key": "YOUR_SECRET_KEY"  # resolved in weather skill parameters
        }
    }
)

for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="")
```

### From cURL

```bash
curl -X POST http://localhost:2704/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_asr_YOUR_TENANT_KEY" \
  -d '{
    "messages": [{"role": "user", "content": "Fetch weather in Paris"}],
    "model": "gemini-2.5-flash",
    "stream": false,
    "session_id": "user_123_thread_1",
    "app_id": "your-app-group-uuid",
    "skill_names": ["weather_fetcher"],
    "prochat_model": "genui-mars-0.1",
    "user_data": {
      "openweathermap_api_key": "YOUR_SECRET_KEY"
    }
  }'
```

> 📝 **`prochat_model`** (optional): Pass the ProChat model name (e.g. `genui-mars-0.1`) to enable generative UI on this request. Requires a model with `provider: prochat` registered for your tenant on prochat.dev.

---

## 📡 Reading the Stream

When `"stream": true`, the server emits **Server-Sent Events (SSE)**. Each line is prefixed with `data: ` followed by a JSON object. The final event is always `data: [DONE]`.

Every chunk shares this envelope:

```json
{
  "id": "chatcmpl-<session_id>",
  "object": "chat.completion.chunk",
  "created": 1700000000,
  "model": "gemini-2.5-flash",
  "choices": [{ "index": 0, "delta": { ... }, "finish_reason": null }]
}
```

The **`delta`** object determines the event type:

---

### 💭 Reasoning / Status Updates

Emitted while the engine is routing, thinking, or executing tools. Safe to display as a status indicator or hide from end users entirely.

```json
{ "delta": { "reasoning": "Analyzing query & active skills..." } }
{ "delta": { "reasoning": "Consulting LLM model gemini-2.5-flash (Turn 1)..." } }
{ "delta": { "reasoning": "Invoking tool weather__get_weather (Skill: weather_fetcher)..." } }
{ "delta": { "reasoning": "Tool weather__get_weather finished in 312ms (http)." } }
{ "delta": { "reasoning": "Generating dynamic user interface components..." } }
```

**Python:**
```python
for chunk in stream:
    delta = chunk.choices[0].delta
    reasoning = getattr(delta, "reasoning", None) or (delta.model_extra or {}).get("reasoning")
    if reasoning:
        print(f"[status] {reasoning}")
```

---

### 💬 Text Content

The LLM's final answer, streamed token-by-token. Append these to build the full response.

```json
{ "delta": { "content": "The weather in London is " } }
{ "delta": { "content": "currently 18°C and cloudy." } }
```

**Python:**
```python
full_response = ""
for chunk in stream:
    text = chunk.choices[0].delta.content or ""
    full_response += text
    print(text, end="", flush=True)
```

**JavaScript:**
```js
let fullText = "";
if (delta.content) {
  fullText += delta.content;
  appendToUI(delta.content);
}
```

---

### 🔧 Tool Call Start

Emitted just before a tool executes. Shows which tool and skill are triggered and with what arguments.

```json
{
  "delta": {
    "reasoning": "Invoking tool weather__get_weather (Skill: weather_fetcher)...",
    "tool_call": {
      "name": "weather__get_weather",
      "arguments": { "city": "London" }
    }
  }
}
```

**JavaScript:**
```js
if (delta.tool_call) {
  showToolBadge(delta.tool_call.name, delta.tool_call.arguments);
}
```

---

### ✅ Tool Result

Emitted after each tool finishes. Contains stdout, stderr, exit code, timing, sandbox type, and any generated file download links.

```json
{
  "delta": {
    "reasoning": "Tool weather__get_weather finished in 312ms (http).",
    "tool_result": {
      "tool_name": "weather__get_weather",
      "skill_name": "weather_fetcher",
      "stdout": "{\"temp\": 18, \"condition\": \"Cloudy\"}",
      "stderr": "",
      "exit_code": 0,
      "sandbox_type": "http",
      "execution_time_ms": 312,
      "generated_files": []
    }
  }
}
```

**Generated files** (when the tool produces downloadable output):
```json
"generated_files": [{
  "filename": "abc123_report.pdf",
  "original_name": "report.pdf",
  "url": "/api/v1/files/download/tenant_name/abc123_report.pdf",
  "sandbox_path": "sandbox/outputs/tenant_name/abc123_report.pdf"
}]
```

**JavaScript:**
```js
if (delta.tool_result) {
  const r = delta.tool_result;
  console.log(`✔ ${r.tool_name} — exit=${r.exit_code}, ${r.execution_time_ms}ms`);
  r.generated_files?.forEach(f =>
    console.log(`  📎 ${f.original_name} → ${f.url}`)
  );
}
```

---

### 🎨 ProChat Generative UI — JSON & Code

When `prochat_model` is set, the engine streams ProChat UI chunks after the text response. `json` is a UI component spec; `code` is optional supporting HTML/JavaScript.

```json
{ "delta": { "json": { "type": "table", "columns": ["City","Temp"], "rows": [["London","18°C"]] }, "code": null } }
{ "delta": { "json": null, "code": "<script>renderChart(data)</script>" } }
```

> 💡 `json` and `code` can arrive in the same chunk or in separate ones. Always accumulate both until `[DONE]`.

**JavaScript:**
```js
if (delta.json != null || delta.code != null) {
  if (delta.json) renderProChatComponent(delta.json);
  if (delta.code) executeProChatCode(delta.code);
}
```

---

### 🏁 Done Event

Sent once just before `data: [DONE]`. Confirms completion and reports total tools called.

```json
{ "type": "done", "request_id": "req_abc123", "tools_called": 3 }
```

> ⚠️ This event does **not** have the standard `choices` wrapper — check `raw.type` directly after parsing.

---

### ❌ Error Event

Emitted if the engine encounters an unrecoverable error mid-stream.

```json
{ "type": "error", "request_id": "req_abc123", "detail": "LLM returned no response after 25 turns." }
```

---

### 📋 Complete Stream Reader (JavaScript)

Drop-in utility that dispatches all event types via callbacks:

```js
async function readSkillEngineStream(response, callbacks = {}) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    for (const line of decoder.decode(value).split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6);
      if (payload === "[DONE]") { callbacks.onDone?.(); break; }

      const raw = JSON.parse(payload);

      // top-level done / error events (no "choices" wrapper)
      if (raw.type === "done")  { callbacks.onComplete?.(raw); continue; }
      if (raw.type === "error") { callbacks.onError?.(raw);    continue; }

      const delta = raw.choices?.[0]?.delta ?? {};

      if (delta.content)                       callbacks.onText?.(delta.content);
      if (delta.reasoning)                     callbacks.onReasoning?.(delta.reasoning);
      if (delta.tool_call)                     callbacks.onToolStart?.(delta.tool_call);
      if (delta.tool_result)                   callbacks.onToolEnd?.(delta.tool_result);
      if (delta.json != null || delta.code != null)
                                               callbacks.onProChatUI?.({ json: delta.json, code: delta.code });
    }
  }
}

// Example usage:
await readSkillEngineStream(response, {
  onText:      (t)  => appendToChat(t),
  onReasoning: (r)  => updateStatusBar(r),
  onToolStart: (tc) => showToolCard(tc.name, tc.arguments),
  onToolEnd:   (tr) => markToolDone(tr.tool_name, tr.exit_code, tr.generated_files),
  onProChatUI: (ui) => renderUI(ui.json, ui.code),
  onComplete:  (ev) => console.log(`Done — ${ev.tools_called} tools ran`),
  onError:     (ev) => showError(ev.detail),
});
```

---

### 📋 Non-Streaming Response

When `"stream": false`, the full result is a single JSON object:

```json
{
  "id": "chatcmpl-<session_id>",
  "object": "chat.completion",
  "model": "gemini-2.5-flash",
  "request_id": "req_abc123",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "The weather in London is 18°C and cloudy.",
      "json": { "type": "table", "columns": ["City","Temp"], "rows": [["London","18°C"]] },
      "code": null
    },
    "finish_reason": "stop"
  }],
  "executed_tools": [{
    "id": "log_xyz",
    "skill_name": "weather_fetcher",
    "tool_name": "weather__get_weather",
    "stdout": "{\"temp\": 18}",
    "stderr": "",
    "exit_code": 0,
    "sandbox_type": "http",
    "execution_time_ms": 312,
    "generated_files": []
  }]
}
```

| Field | Description |
|---|---|
| `message.content` | The LLM's natural-language answer |
| `message.json` | ProChat UI component spec (only when `prochat_model` is set) |
| `message.code` | ProChat supporting code (only when `prochat_model` is set) |
| `executed_tools` | Full audit of every tool run — stdout, stderr, timing, generated files |



---


## 📝 Creating Skills

Create a `skills/<skill_name>/SKILL.md` file:

```yaml
---
name: my_skill
description: What this skill does and when the LLM should use it.
tools:
  - name: run_shell
    description: Runs a shell command.
    command: echo "Hello from AI Skill Engine!"
  - name: run_python
    description: Executes Python in sandbox.
    type: python
    code: |
      result = sum(range(1, 101))
      print(f"Sum = {result}")
---

# Instructions
Tell the LLM when and how to use these tools.
```

Skills can also be **created and edited directly in the dashboard** — they're stored in the database and hot-reloaded.

---

## 🔌 MCP Servers

Add external MCP servers from the **MCP Servers** tab. Both `stdio` and `http/sse` transports are supported.

```bash
# Examples
npx -y @modelcontextprotocol/server-filesystem /allowed/path
npx -y @modelcontextprotocol/server-github
npx -y @modelcontextprotocol/server-memory
```

---

## 📊 Dashboard Pages

| Page | URL | Description |
|---|---|---|
| Chat Playground | `/playground` | Live chatbot simulator with streaming, session history & audit traces |
| Apps & Groups | `/apps` | Group skills into scoped App containers |
| Skills Catalog | `/skills` | Browse, filter, create, and edit skills |
| MCP Servers | `/mcp` | Connect external MCP protocol servers |
| Tenants & Keys | `/tenants` | Manage tenant API keys and model configs |
| Sandbox Audit Logs | `/logs` | Dashboard execution audit trail |
| API Execution Logs | `/api-logs` | External API client execution logs |
| API Tester | `/api-tester` | Built-in HTTP client to test the chat endpoint |
| API Documentation | `/docs` | Interactive API reference |




## 📄 License

[Apache License 2.0](./LICENSE) — free for personal and commercial use, with attribution.
