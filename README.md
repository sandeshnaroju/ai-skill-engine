# ⚡ AI Skill Engine

> **Self-hosted AI gateway and execution engine for businesses — add AI tool execution to your product, or offer AI-powered services to your own clients.**

Connect your chatbot with a single Chat Completion API call. AI Skill Engine acts as a gateway between your clients and any LLM — handling multi-turn tool execution, sandboxed code runs, MCP integrations, generative UI rendering via ProChat, per-tenant isolation, cost tracking, and a full visual admin dashboard — all in one self-hosted package. Drop-in compatible with the OpenAI API.

![Dashboard](https://img.shields.io/badge/dashboard-React-blueviolet) ![API](https://img.shields.io/badge/API-OpenAI%20Compatible-green) ![License](https://img.shields.io/badge/license-Apache%202.0-blue) ![Docker](https://img.shields.io/badge/docker-sandeshnaroju%2Fai--skill--engine-blue)

---

> [!NOTE]
> **Cloud-Hosted Setup Coming Soon!** ☁️
> We are building a fully managed cloud version of AI Skill Engine. If you want to skip self-hosting and deployment maintenance, stay tuned!

---

## 👥 Who Is This For?

**🏢 Businesses adding AI to their product**
Point your existing app at this server's single `/chat/completions` endpoint. Your LLM instantly gains tool execution, sandboxed code runs, file handling, API integrations, and more — without building any of that infrastructure yourself.

**🏗️ Businesses selling AI services to their clients**
Run one AI Skill Engine instance as a shared gateway and give each of your clients their own **tenant** — a fully isolated workspace with:
- Their own API key and model configuration
- Their own custom skill set and app groups
- Per-client token and cost tracking (so you know exactly what to charge them)
- Fully separated conversation history and execution logs

> **What is a Tenant?**
> A tenant is an isolated API consumer — a client, workspace, or environment. Each tenant has its own API key, registered LLM models, skills, apps, and usage history. A single AI Skill Engine server can serve many tenants independently.

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
7. **AI Skill Generator**: Describe what you want a skill to do and let the AI generate the full SKILL.md definition — including tool schemas and instructions — automatically.
8. **Secure, Sandboxed Execution**: Run calculations and custom scripts inside safe, isolated containers to keep your servers and business data protected.
9. **Universal Remote (MCP Hub)**: Connect your chatbot directly to databases, GitHub, or filesystems using standard Model Context Protocol.
10. **Generative UI with ProChat**: Return dynamic, interactive UI components (charts, forms, dashboards) directly inside the chat response — no extra frontend code needed.
11. **OpenAI-Compatible Gateway**: Point any existing OpenAI client at this server and it works immediately — no SDK changes, no prompt rewrites. Swap models, add tools, enforce tenant isolation, all transparently.
12. **Built-in Admin Dashboard**: View chatbot thoughts, tool triggers, sandbox logs, token usage, and costs — per tenant — in a beautiful visual turn-by-turn timeline.

---

## 🛠️ Configure Everything From The Dashboard

One of the core ideas behind AI Skill Engine is that **infrastructure decisions belong in the dashboard, not in code or config files**. You can switch your LLM provider, move code execution to a cloud sandbox, change where files are stored, or update your email server — all from the UI, without touching a single environment variable or redeploying.

Every setting below is **per-tenant** — so different clients or environments on the same server can use entirely different infrastructure.

---

### 🤖 LLM Providers — *Which AI model powers your chatbot*

Register any number of models per tenant. The engine uses the OpenAI protocol universally, so any OpenAI-compatible API works out of the box.

| Provider | How to use |
|---|---|
| **OpenAI** | GPT-4o, GPT-4-turbo, GPT-4o-mini, o1, o3, etc. |
| **Google Gemini** | gemini-2.5-flash, gemini-2.5-pro, gemini-2.0-flash, etc. |
| **OpenRouter** | Access 200+ models (Claude, Llama, Mistral, Qwen, DeepSeek, etc.) through a single key |
| **Custom / Self-hosted** | Any OpenAI-compatible endpoint — Ollama, LM Studio, vLLM, Azure OpenAI, AWS Bedrock, etc. |

You can also set **per-token pricing rates** (input / output / audio) on each model config so usage costs are tracked accurately per tenant — essential if you're billing your clients.

---

### 💻 Code Execution — *Where sandboxed code runs*

When the LLM calls a skill that runs code, you choose where that execution happens. Switch between environments from the **Sandbox Settings** page — no code changes needed.

| Sandbox | Description |
|---|---|
| **Docker** *(default)* | Ephemeral local container (`ai-sandbox-python:latest`). Isolated from the host. Great for development and on-prem deployments. |
| **Process** | Runs directly on the host server. Fast, but only recommended for fully trusted, private setups. |
| **Azure Container Apps** | Hyper-V isolated cloud containers via Azure Dynamic Sessions. Requires Entra ID credentials and a Session Pool Endpoint. |
| **E2B** | Stateful agentic micro-VMs with persistent filesystems. Ideal for long-running, stateful code tasks. Requires an E2B API key. |
| **Fly.io** | Serverless Fly Machines. Requires a Fly API token and app name. |
| **AWS Lambda** | Serverless Lambda functions. Requires AWS access/secret keys, region, and function name. |

> 🔒 If a remote sandbox is configured, execution always targets that cloud environment. It will **never** silently fall back to local execution on failure.

---

### 💾 File Storage — *Where generated files and uploads are kept*

Choose where the engine stores files created by skills (reports, charts, CSVs, PDFs). Configure from the **Storage Settings** page.

| Storage Backend | Description |
|---|---|
| **Local filesystem** *(default)* | Files saved to the server's local `sandbox/` directory. Simple and zero-config. |
| **AWS S3** | Upload to any S3 bucket. Supports custom endpoint URLs for S3-compatible services (MinIO, Cloudflare R2, DigitalOcean Spaces, etc.). |
| **Azure Blob Storage** | Upload to any Azure Blob container using account name and key. |

All cloud storage options support **pre-signed URLs** (configurable expiry) so generated file links can be securely shared directly with end users.

---

### 📧 Email (SMTP) — *From where emails are sent*

The `email` skill lets the LLM send emails on behalf of a user or system. Configure the SMTP server per tenant from the **Email Settings** page.

| SMTP Option | Examples |
|---|---|
| **Gmail** | smtp.gmail.com with an App Password |
| **SendGrid** | smtp.sendgrid.net with an API key as password |
| **Mailgun** | smtp.mailgun.org |
| **Amazon SES** | email-smtp.&lt;region&gt;.amazonaws.com |
| **Custom / corporate SMTP** | Any SMTP server with TLS or SSL support |

Supports TLS (STARTTLS) and SSL, configurable username, sender address, and encrypted password storage.

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
   # Generate a 32-byte Fernet key first:
   # python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

   docker run -d \
     --name ai_skill_engine \
     -p 2704:2704 \
     -v /var/run/docker.sock:/var/run/docker.sock \
     -v "$(pwd)/sandbox:/app/sandbox" \
     -v "$(pwd)/skill_manager.db:/app/skill_manager.db" \
     -e HOST_SANDBOX_DIR="$(pwd)/sandbox" \
     -e DATABASE_URL="sqlite:////app/skill_manager.db" \
     -e ENCRYPTION_SECRET_KEY="YOUR_GENERATED_FERNET_KEY" \
     --restart unless-stopped \
     sandeshnaroju/ai-skill-engine:latest
   ```
   *(Note: Set `DATABASE_URL` to a PostgreSQL URI if you want an external database instead of the default local SQLite db)*

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

| Variable | Description | Example |
| --- | --- | --- |
| `ENCRYPTION_SECRET_KEY` | **Required** — 32-byte base64 Fernet key to encrypt stored API keys & credentials | `j-A2fHiav45IjlHFpEIJkhYGcEEni9bd5KExyEeoovY=` |
| `DATABASE_URL` | Connection URI of your database (defaults to local SQLite `skill_manager.db`) | `postgresql://postgres:password@localhost:5432/dbname` |
| `SMTP_HOST` | Hostname of the SMTP server to send OTP codes | `smtp.gmail.com` |
| `SMTP_PORT` | Port of the SMTP server (default: 587) | `587` |
| `SMTP_USERNAME` | Username for SMTP server | `user@gmail.com` |
| `SMTP_PASSWORD` | Password or App Password for SMTP server | `your-smtp-password` |
| `SMTP_SENDER` | Sender email address (default: `SMTP_USERNAME`) | `no-reply@mycompany.com` |

> 🔑 **Generating an `ENCRYPTION_SECRET_KEY`**:
> Stored secrets (LLM API keys, SMTP passwords, cloud credentials) are encrypted using AES-128-CBC + HMAC-SHA256 (Fernet). You must supply a valid key on container start:
> ```bash
> python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
> ```

---

### Passing Environment Variables to Docker

#### Method A: Using a `.env` file (Recommended)
1. Create a `.env` file in your root workspace:
   ```env
   ENCRYPTION_SECRET_KEY=YOUR_GENERATED_FERNET_KEY
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
```bash
docker run -d \
  --name ai_skill_engine \
  -p 2704:2704 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$(pwd)/sandbox:/app/sandbox" \
  -v "$(pwd)/skill_manager.db:/app/skill_manager.db" \
  -e HOST_SANDBOX_DIR="$(pwd)/sandbox" \
  -e ENCRYPTION_SECRET_KEY="YOUR_GENERATED_FERNET_KEY" \
  -e SMTP_HOST="smtp.gmail.com" \
  -e SMTP_PORT="587" \
  -e SMTP_USERNAME="user@gmail.com" \
  -e SMTP_PASSWORD="your-app-password" \
  --restart unless-stopped \
  sandeshnaroju/ai-skill-engine:latest
```

---

## 🔑 Configuring Models

AI Skill Engine does **not** use environment API keys for LLMs. Models are registered **per-tenant** via the dashboard, so each tenant (client) can use entirely different providers and models independently.

1. Go to **Tenants & Keys** → click **Manage** on a tenant
2. Click **Register Model** and choose a provider (OpenAI, Gemini, OpenRouter, or Custom)
3. Enter the model name, API key, and optional per-token pricing rates
4. Use that tenant's API key when calling the chat endpoint

> 💡 **For resellers:** You can set your own cost rates (input/output tokens per $1M) on each model config, giving you full visibility into what each tenant costs — so you can bill your clients accordingly.

---

## 🎨 Enabling Generative UI with ProChat

AI Skill Engine supports **ProChat** — a generative UI protocol that lets your chatbot respond with rich, interactive UI components (data tables, forms, charts) rendered directly inside the chat interface.

To enable ProChat, each tenant needs a ProChat model registered alongside their regular LLM:

1. **Create an account** at [prochat.dev](https://prochat.dev) and generate an API key from your dashboard.
2. Go to **Tenants & Keys** in the Admin Dashboard → click **Manage** on your tenant.
3. Click **Register Model** and fill in:
   - **Provider**: `prochat`
   - **Model Name**: the model identifier from your prochat.dev dashboard (e.g. `genui-mars-0.1`)
   - **API Key**: your ProChat API key from prochat.dev
4. Save the model, then pass `"prochat_model": "genui-mars-0.1"` in your API request (see [API Usage](#-api-usage) below).

> 💡 **How it works**: When you include `prochat_model` in your request, AI Skill Engine runs your regular LLM as usual. Once the final answer is ready, it forwards the response to the ProChat API, which returns a rendered UI component — streamed back and displayed inline in the chat.

---

## 📦 Sandbox Environments

AI Skill Engine runs Python code and bash scripts inside secure, isolated sandboxes. You can select and configure the active sandbox from the **Sandbox Settings** page in the dashboard:

1. **Docker Sandbox (Default)**: Runs scripts inside a local ephemeral Docker container (`ai-sandbox-python:latest`). Keeps your host environment safe.
2. **Process Sandbox**: Executes commands directly on the host server process. Recommended only for trusted private local setups.
3. **Azure Container Apps (ACA) Sandboxes**: Offloads executions to secure, Hyper-V isolated container pools. Requires Entra ID App credentials and a Session Pool Endpoint.
4. **E2B Sandboxes**: Runs scripts inside specialized, stateful agentic micro-VMs. Requires an `E2B API Key`.
5. **Fly.io Sandboxes**: Routes execution to Fly.io Machines. Requires a `Fly API Token` and `App Name`.
6. **AWS Lambda**: Routes calculations to serverless Lambdas. Requires AWS keys, `Region`, and `Function Name`.

> 🔒 **Security Notice:** If any remote sandbox (Azure, E2B, Fly.io, or Lambda) is active, execution strictly targets that cloud environment. If the sandbox call fails or credentials are incomplete, it returns the error immediately and **never** silently falls back to local host processes.

---

## 💾 Sandbox File Operations & Storage

### 1. Auto-Download Pipeline
When running code inside the Azure ACA Sandbox, the system automatically:
- Scans the sandbox filesystem for newly created files (e.g. PDFs, CSVs, plots) right after execution.
- Transfers them back to the host server outputs folder.
- Generates click-to-download links and surfaces them directly in the Chat Playground.

### 2. Sandbox File Manager Skill
Enable the `sandbox_file_manager` skill to give the chatbot explicit control over its environment. This grants the LLM access to three tools:
- `list_sandbox_files`: Lists all files present in the active sandbox workspace.
- `download_sandbox_file`: Pulls a specific file from the remote sandbox to the local backend server.
- `upload_sandbox_file`: Uploads local server inputs into the remote sandbox workspace for processing.

### 3. Cloud Storage Skill
For production environments, use the `cloud_storage` skill to upload generated outputs directly to cloud buckets (AWS S3 or Azure Blob Storage) and retrieve secure URLs.

---


## 🌐 API Usage

Authenticate requests using a standard Bearer token header (works natively with OpenAI SDKs):

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
| `session_id` | string | `"default_session"` | Conversation thread identifier. Used to maintain persistent memory across turns — the same `session_id` will resume a stored conversation in Dashboard Playground sessions. |
| `app_id` | string | `null` | UUID of an App group — scopes available tools to that App's skills only |
| `skill_names` | array of strings | `null` | Directly filter which skills are active for this request. If combined with `app_id`, only skills present in both the list and the App are used. |
| `user_data` | object | `null` | Key-value pairs (credentials, API keys, tokens) injected into skill tool parameters at runtime. These values are resolved server-side and **never exposed to the LLM** — ideal for passing per-user secrets. |
| `prochat_model` | string | `null` | ProChat model name (e.g. `genui-mars-0.1`) — enables generative UI rendering after the LLM responds. Requires a `prochat` provider model registered for the tenant. |

> **Note:** API client conversations are **not** stored in chat history by default. Only Dashboard Chat Playground sessions persist conversation messages. Tool execution results are always logged in the API Execution Logs regardless of source.

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
        "session_id": "user_123_thread_1",    # resumes or starts a conversation thread
        "app_id": "your-app-group-uuid",       # scopes tools to this App's skills only
        "skill_names": ["weather_fetcher"],    # optional: limit to specific skills
        "prochat_model": "genui-mars-0.1",     # optional: enable ProChat generative UI
        "user_data": {
            "openweathermap_api_key": "YOUR_SECRET_KEY"  # injected into skill parameters server-side
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
    "user_data": {
      "openweathermap_api_key": "YOUR_SECRET_KEY"
    }
  }'
```

---


## 📝 Creating Skills

Skills are Markdown files with YAML frontmatter that define both the LLM instructions and the tools it can call. Create a `skills/<skill_name>/SKILL.md` file:

```yaml
---
name: my_skill
description: What this skill does and when the LLM should use it.
tools:
  - name: run_shell
    description: Runs a shell command.
    type: shell
    command: echo "Hello from AI Skill Engine!"

  - name: run_python
    description: Executes Python code in the sandbox.
    type: code
    command: python3 -c "{{code}}"
    parameters:
      type: object
      properties:
        code:
          type: string
          description: The Python code to execute.
      required: [code]

  - name: call_api
    description: Calls an external REST API.
    type: http
    method: GET
    url: https://api.example.com/data
---

# Instructions
Tell the LLM when and how to use these tools.
```

**Supported tool types:**

| Type | What it does |
|---|---|
| `shell` | Runs a bash/shell command in the sandbox |
| `code` | Executes dynamic code passed as a parameter (Python, etc.) |
| `http` / `rest_api` / `api` | Makes an HTTP request to an external endpoint |
| `mcp` / `mcp_stdio` | Calls an MCP server tool |

Skills can also be **created, edited, and AI-generated directly in the dashboard** — they're stored in the database and hot-reloaded without a server restart.

---

## 🤖 AI Skill Generator

Don't want to write SKILL.md files by hand? The built-in **AI Skill Generator** can build one for you.

From the **Skills** page in the dashboard, click **Generate Skill** and provide:
- A **skill name** and **description** of what it should do
- Any **API endpoints** it should call (method, URL, headers, query params, body)
- Any **secrets or inputs** it needs
- Any **behavioral notes** for the LLM

The generator uses your configured LLM to produce a complete, ready-to-use SKILL.md — including tool schemas, parameter definitions, and system instructions.

---

## 🔌 MCP Servers

Add external MCP servers from the **MCP Servers** tab. Both `stdio` and `http/sse` transports are supported.

```bash
# Examples
npx -y @modelcontextprotocol/server-filesystem /allowed/path
npx -y @modelcontextprotocol/server-github
npx -y @modelcontextprotocol/server-memory
```

Once registered, the MCP server's tools are automatically discovered and made available to the LLM — no skill file needed.

---

## 📊 Dashboard Pages

| Page | URL | Description |
|---|---|---|
| Chat Playground | `/playground` | Live chatbot simulator with streaming, session history & audit traces |
| Apps & Groups | `/apps` | Group skills into scoped App containers |
| Skills Catalog | `/skills` | Browse, filter, create, edit, and AI-generate skills |
| MCP Servers | `/mcp` | Connect external MCP protocol servers |
| Tenants & Keys | `/tenants` | Manage tenant API keys, model configs, and cost rates |
| Sandbox Audit Logs | `/logs` | Dashboard execution audit trail |
| API Execution Logs | `/api-logs` | External API client execution logs |
| API Tester | `/api-tester` | Built-in HTTP client to test the chat endpoint |
| API Documentation | `/docs` | Interactive API reference |

---

## 📄 License

[Apache License 2.0](./LICENSE) — free for personal and commercial use, with attribution.