<p align="center">
  <img src="frontend/public/logo_stacked.svg" alt="AI Skill Engine" width="320" />
</p>

<p align="center">
  <strong>Enterprise self-hosted AI gateway, agent execution harness, and multi-tenant skill hub.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/dashboard-React-blueviolet" alt="Dashboard" />
  <img src="https://img.shields.io/badge/API-OpenAI%20Compatible-green" alt="API" />
  <img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="License" />
  <img src="https://img.shields.io/badge/docker-sandeshnaroju%2Fai--skill--engine-blue" alt="Docker" />
</p>

---

> [!NOTE]
> **Cloud-Hosted Setup Coming Soon!** ☁️
> We are building a fully managed cloud version of AI Skill Engine. If you want to skip self-hosting and deployment maintenance, stay tuned!

---

## 📸 Visual Tour & Dashboard Preview

<div align="center">
  <h3>💬 Interactive Chat Playground & Live Universal Canvas</h3>
  <img src="screenshots/chat_playground.png" alt="Chat Playground" width="100%" />
</div>

<br/>

### 🎨 Live Canvas & Artifact Previews

<table width="100%">
  <tr>
    <td width="50%" align="center">
      <b>📄 Interactive Document Viewer</b><br/>
      <img src="screenshots/document_viewer.png" alt="Document Viewer" width="100%"/>
    </td>
    <td width="50%" align="center">
      <b>📊 Spreadsheet & Data Analysis Viewer</b><br/>
      <img src="screenshots/spreadsheet_viewer.png" alt="Spreadsheet Viewer" width="100%"/>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <b>📽️ Dynamic Presentation Slides</b><br/>
      <img src="screenshots/presentation.png" alt="Presentation Viewer" width="100%"/>
    </td>
    <td width="50%" align="center">
      <b>📐 AutoCAD & 3D Model Viewer</b><br/>
      <img src="screenshots/cad_3d_viewer.png" alt="AutoCAD 3D Viewer" width="100%"/>
    </td>
  </tr>
</table>

<br/>

### 🏢 Multi-Tenant Gateway, Sandboxes & Storage

<table width="100%">
  <tr>
    <td width="50%" align="center">
      <b>🏢 Tenants & API Keys Setup</b><br/>
      <img src="screenshots/tenants_setup.png" alt="Tenants Setup" width="100%"/>
    </td>
    <td width="50%" align="center">
      <b>🧩 Skills Catalog & AI Generator</b><br/>
      <img src="screenshots/skills_setup.png" alt="Skills Setup" width="100%"/>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <b>🛡️ Isolated Code Sandboxes</b><br/>
      <img src="screenshots/sandbox_setup.png" alt="Sandbox Setup" width="100%"/>
    </td>
    <td width="50%" align="center">
      <b>💾 Cloud & Local Storage Providers</b><br/>
      <img src="screenshots/storage_setup.png" alt="Storage Setup" width="100%"/>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <b>🧪 Interactive API Tester</b><br/>
      <img src="screenshots/api_tester.png" alt="API Tester" width="100%"/>
    </td>
    <td width="50%" align="center">
      <b>💰 LLM Token & Cost Tracking</b><br/>
      <img src="screenshots/llm_costs_viewer.png" alt="LLM Costs Viewer" width="100%"/>
    </td>
  </tr>
</table>

---

## ✨ What It Does

An all-in-one AI gateway and tool-calling execution harness. Point your chatbot or business backend at this server's single OpenAI-compatible `/api/v1/chat/completions` endpoint and immediately unlock:

1. **Sandboxed Code Execution Harness**: Run Python scripts and calculations safely in isolated Docker containers, Azure Container Apps, or E2B micro-VMs.
2. **Universal Canvas Artifacts**: Co-edit and export interactive documents, spreadsheets, slides, and 3D CAD files via drop-in iframe or headless REST/SSE.
3. **Multi-Tenant Gateway**: Isolated workspaces with dedicated API keys, custom skillsets, per-client token cost accounting, and separated audit logs.
4. **Cloud Storage & Session Purge**: Stream files to Azure Blob Storage, AWS S3, or Local Disk, tracked per session with cascade cleanup APIs.
5. **No-Code Tool Customization & AI Generator**: Create, edit, and AI-generate SKILL.md tool definitions hot-reloaded directly from the dashboard.
6. **Universal Remote (MCP Hub)**: Connect models directly to external tools, databases, and filesystems via Model Context Protocol.
7. **Generative UI with ProChat**: Stream reactive React components and interactive widgets inline in chat responses.
8. **Sub-Agent Multimodal Routing**: Dispatch specialized image generation, video generation, and audio analysis to dedicated sub-agents in a single turn.

---

## ⚡ Quick Start (2 Minutes)

Run the pre-built, production-compiled container directly from Docker Hub:

```bash
# 1. Generate an encryption key (Fernet 32-byte key)
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# 2. Run the container
docker run -d \
  --name ai_skill_engine \
  -p 2704:2704 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$(pwd)/sandbox:/app/sandbox" \
  -v "$(pwd)/skill_manager.db:/app/skill_manager.db" \
  -v "$(pwd)/skill_manager.db-wal:/app/skill_manager.db-wal" \
  -v "$(pwd)/skill_manager.db-shm:/app/skill_manager.db-shm" \
  -e HOST_SANDBOX_DIR="$(pwd)/sandbox" \
  -e DATABASE_URL="sqlite:////app/skill_manager.db" \
  -e ENCRYPTION_SECRET_KEY="YOUR_GENERATED_FERNET_KEY" \
  -e WHITELISTED_EMAILS="admin@example.com,@mycompany.com" \
  --restart unless-stopped \
  sandeshnaroju/ai-skill-engine:latest
```

Open **`http://localhost:2704`** in your browser.

> 🔒 **Access Control / Whitelist**: Pass `-e WHITELISTED_EMAILS="user@example.com,@company.com"` (or add to `.env`) to restrict new user registration to specific emails or company domains. All other signups receive `HTTP 403 Forbidden`.

---

## 💻 Calling the API Gateway

The gateway is 100% compatible with the standard OpenAI wire protocol:

```bash
curl -N -X POST http://localhost:2704/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY" \
  -d '{
    "messages": [
      {"role": "user", "content": "Calculate 20,000 at 12% compound interest for 15 years using Python"}
    ],
    "model": "gemini-2.5-flash",
    "stream": true,
    "session_id": "client_session_101",
    "skill_names": ["code_interpreter"]
  }'
```

The streaming response delivers rich, real-time lifecycle deltas directly into your UI:
- **`delta.status`**: Real-time orchestrator state (query analysis, tool dispatch, sandbox execution timings, turn synthesis).
- **`delta.reasoning`**: Live chain-of-thought / model thinking traces.
- **`delta.tool_call` & `delta.tool_result`**: Dispatched sandbox execution commands and live output logs.
- **`delta.artifacts`**: Interactive Canvas documents, spreadsheets, slides, and 3D CAD files with signed HMAC embed URLs.

---

## 📚 Documentation Hub & In-App Browser

All guides are packaged directly into the web application and can be interactively browsed with live search, syntax highlighting, and one-click copy from the dashboard at **`/api-docs`** (Tab 3: *Complete Knowledge Base & Guides*), or viewed directly in [`frontend/src/docs/`](frontend/src/docs/):

| # | Category | Guide | Description |
|---|---|---|---|
| 01 | **Getting Started** | [🚀 **Quickstart & Platform Overview**](frontend/src/docs/01-getting-started.md) | What you can build, platform architecture, and a 3-minute first API request. |
| 02 | **Getting Started** | [🔑 **Authentication & Workspaces**](frontend/src/docs/02-authentication-and-tenants.md) | Tenant API keys, request headers, multi-tenant isolation, and workspace limits. |
| 03 | **Building with API** | [💬 **Chat Completions & Streaming**](frontend/src/docs/03-chat-completions.md) | OpenAI wire-compatible endpoint, streaming SSE deltas, live reasoning, and tool results. |
| 04 | **Building with API** | [🎨 **Embedding Artifacts & Canvas**](frontend/src/docs/04-artifacts-and-canvas.md) | Embedding interactive documents, spreadsheets, slides, and 3D CAD via iframe or REST. |
| 05 | **Building with API** | [📁 **File Uploads & Session Storage**](frontend/src/docs/05-files-and-storage.md) | Uploading documents/CSVs for agent analysis, downloading results, and cascade purges. |
| 06 | **Building with API** | [⏰ **Scheduled Background Tasks**](frontend/src/docs/06-scheduled-jobs.md) | Automating recurring tasks with cron, interval, and date triggers, plus error guardrails. |
| 07 | **Building with API** | [📡 **Complete REST API Reference**](frontend/src/docs/07-api-reference.md) | Endpoints, request/response bodies, parameters, and HTTP error code resolutions. |
| 08 | **Skills & Tools** | [🧩 **Connecting Custom APIs as Skills**](frontend/src/docs/08-custom-skills.md) | Turning your REST APIs into AI tools with SKILL.md and runtime secret injection. |
| 09 | **Skills & Tools** | [🔌 **External Tools with MCP**](frontend/src/docs/09-mcp-servers.md) | Connecting PostgreSQL databases, local filesystems, and GitHub using MCP. |
| 10 | **Skills & Tools** | [🔐 **Secrets & User Data Profiles**](frontend/src/docs/10-secrets-and-user-data.md) | Injecting API credentials into tools dynamically without ever leaking them to the LLM. |
| 11 | **Dashboard** | [🖥️ **Chat Playground & Dashboard Guide**](frontend/src/docs/11-dashboard-guide.md) | Navigating the dashboard: Playground testing, active skills, Apps packaging, and usage. |
| 12 | **Deployment** | [📦 **Self-Hosting & Deployment Guide**](frontend/src/docs/12-deployment-and-setup.md) | Docker run in 60s, Docker Compose with Postgres, LLM providers, and environment variables. |

---

## 📄 License

[Apache License 2.0](./LICENSE) — free for personal and commercial use, with attribution.