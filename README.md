# ⚡ AI Skill Engine

> **Self-hosted Chatbot Skill Server & MCP Hub**

A lightweight FastAPI server that gives any chatbot superpowers — sandboxed code execution, shell commands, HTTP APIs, and MCP tool calls — through modular **Skills**. Drop-in compatible with the OpenAI API.

![Dashboard](https://img.shields.io/badge/dashboard-React-blueviolet) ![API](https://img.shields.io/badge/API-OpenAI%20Compatible-green) ![License](https://img.shields.io/badge/license-MIT-blue)

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

## ✨ What It Does

- **OpenAI-compatible API** — point any OpenAI SDK at `http://localhost:8000/api/v1`
- **Skill Engine** — YAML `SKILL.md` manifests auto-generate LLM tool functions
- **Dual Sandbox** — tools run in Docker (isolated, CPU/RAM capped) or process fallback
- **MCP Hub** — connect external MCP servers (GitHub, Filesystem, Postgres, etc.)
- **Multi-Tenant** — enterprise API key isolation with per-tenant audit logs
- **Streaming SSE** — live reasoning traces, tool calls, and results streamed in real time
- **React Dashboard** — full admin UI served on the same port (dark/light mode)

---

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- Docker *(optional, for sandboxed execution)*

### 1. Clone & Install

```bash
git clone https://github.com/sandeshnaroju/ai-skill-engine.git
cd ai-skill-engine

# Backend
cd backend && pip install -r requirements.txt && cd ..

# Frontend
cd frontend && npm install && npm run build && cd ..
```

### 2. Start the Server

```bash
./run_server.sh
# or manually:
cd backend && uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Open **http://localhost:8000** — the dashboard loads automatically.

> **First run:** A default tenant and sample skills are seeded automatically.

---

## 🔑 Configuring Models

AI Skill Engine does **not** use environment API keys. Models are registered per-tenant via the dashboard:

1. Go to **Tenants & Keys** → click **Manage** on a tenant
2. Add a provider (OpenAI, Gemini, OpenRouter, or Custom)
3. Enter the model name and its API key
4. Use that tenant's API key when calling the chat endpoint

This lets you register different models for different tenants independently.

---

## 🌐 API Usage

```http
POST /api/v1/chat/completions
X-API-Key: sk_asr_YOUR_TENANT_KEY
Content-Type: application/json

{
  "messages": [{"role": "user", "content": "Check disk space"}],
  "model": "gemini-2.5-flash",
  "stream": true,
  "session_id": "user_123_thread_1",
  "app_id": "your-app-group-uuid"
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

> **Note:** API client conversations are **not** stored in the chat history. Only Dashboard Chat Playground sessions are persisted. Tool execution results are always logged in the API Execution Logs.

### From Python (OpenAI SDK)

The OpenAI SDK doesn't natively support `session_id` / `app_id`, so pass them via `extra_body`:

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8000/api/v1",
    api_key="sk_asr_YOUR_TENANT_KEY"
)

stream = client.chat.completions.create(
    model="gemini-2.5-flash",
    messages=[{"role": "user", "content": "Calculate compound interest in Python"}],
    stream=True,
    extra_body={
        "session_id": "user_123_thread_1",    # labels this call in execution logs
        "app_id": "your-app-group-uuid"        # scopes tools to this App's skills only
    }
)

for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="")
```

### From cURL

```bash
curl -X POST http://localhost:8000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-API-Key: sk_asr_YOUR_TENANT_KEY" \
  -d '{
    "messages": [{"role": "user", "content": "Check disk space"}],
    "model": "gemini-2.5-flash",
    "stream": false,
    "session_id": "user_123_thread_1",
    "app_id": "your-app-group-uuid"
  }'
```

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

---

## 📁 Project Structure

```
ai-skill-engine/
├── backend/
│   ├── main.py              # FastAPI app & REST endpoints
│   ├── skill_engine.py      # LLM orchestration & tool dispatch
│   ├── skill_registry.py    # Skill & MCP tool discovery
│   ├── models.py            # SQLAlchemy models
│   ├── llm_client.py        # Multi-provider LLM client
│   ├── encryption_utils.py  # API key encryption
│   └── executors/           # Docker / Process / HTTP / MCP executors
├── frontend/src/
│   ├── App.jsx              # Routing & sidebar nav
│   └── components/          # Dashboard page components
├── skills/
│   ├── system_diagnostics/  # Shell tools (uptime, disk, CPU)
│   ├── code_interpreter/    # Sandboxed Python execution
│   ├── ip_info/             # HTTP IP geolocation
│   └── sample_api/          # Example REST API skill
└── run_server.sh            # Start script
```

---

## 📄 License

MIT — free for personal and commercial use.
