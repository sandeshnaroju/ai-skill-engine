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
  --restart unless-stopped \
  sandeshnaroju/ai-skill-engine:latest
```

Open **`http://localhost:2704`** in your browser.

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

---

## 📚 Documentation Hub & In-App Browser

All guides are packaged directly into the web application and can be interactively browsed with live search, syntax highlighting, and one-click copy from the dashboard at **`/api-docs`** (Tab 3: *Complete Knowledge Base & Guides*), or viewed directly in [`frontend/src/docs/`](frontend/src/docs/):

| # | Guide | Description |
|---|---|---|
| 01 | [📖 **Introduction & Architecture**](frontend/src/docs/01-introduction.md) | Platform overview, request lifecycle, multi-tenancy model, and core concepts. |
| 02 | [⚡ **Quickstart Walkthrough**](frontend/src/docs/02-quickstart.md) | 5-minute step-by-step from initial boot to first tool call and API request. |
| 03 | [📦 **Installation & Deployment**](frontend/src/docs/03-installation.md) | Docker Hub zero-clone, Docker Compose (with PostgreSQL), Bare-Metal, and Nginx SSL proxy. |
| 04 | [💡 **Usage & Dashboard Workflows**](frontend/src/docs/04-usage-guide.md) | Chat Playground, Universal Canvas, Apps & Groups, ProChat Generative UI, and Audit Logs. |
| 05 | [🔌 **Chat Completions & Streaming API**](frontend/src/docs/05-backend-api.md) | OpenAI wire-compatible endpoint, streaming SSE deltas, tool schemas, and custom tools. |
| 06 | [🎨 **Multimodal & Sub-Agents**](frontend/src/docs/06-backend-multimodal.md) | Image generation (DALL-E 3/Imagen/Flux), video generation (Veo/Runway), vision and audio analysis. |
| 07 | [📁 **Session Files & Lifecycle**](frontend/src/docs/07-backend-files.md) | File uploads, session attachment, listing, single file deletion, and cascade session purges. |
| 08 | [⚙️ **Artifacts & Management APIs**](frontend/src/docs/08-backend-management.md) | Artifacts REST/SSE endpoints, MCP servers, tenant management, and audit logs. |
| 09 | [📡 **Complete API Reference**](frontend/src/docs/09-api-reference.md) | Request parameters, response bodies, error codes, and end-to-end Python/JS SDK snippets. |
| 10 | [🖼️ **Universal Canvas Iframe Embedding**](frontend/src/docs/10-frontend-canvas.md) | Embedding interactive Canvas in your web apps via iframe and postMessage bi-directional events. |
| 11 | [⚡ **Headless Canvas REST & SSE**](frontend/src/docs/11-frontend-headless.md) | Building custom canvas viewers with direct REST and real-time Server-Sent Events. |
| 12 | [🔒 **Canvas Security & Uploaded Files**](frontend/src/docs/12-frontend-security.md) | HMAC security tokens, proxy patterns, and opening user files directly in Canvas editors. |
| 13 | [📄 **Universal Canvas Artifacts**](frontend/src/docs/13-artifacts-canvas.md) | Architecture of live co-editing documents, spreadsheets, slides, and 3D CAD models. |
| 14 | [💾 **Session Storage & Cloud Files**](frontend/src/docs/14-session-storage.md) | Azure Blob, S3, and Local Disk file lifecycles, session uploads, listing, and cascade purge APIs. |
| 15 | [🛡️ **Execution Sandboxes**](frontend/src/docs/15-sandboxes.md) | Docker containers, Azure Container Apps (Hyper-V), E2B micro-VMs, Fly.io, and AWS Lambda. |
| 16 | [⚙️ **Configuration & Settings**](frontend/src/docs/16-configuration.md) | Environment variables, Fernet encryption, custom token pricing rates, and SMTP email setup. |
| 17 | [🧩 **Skills & MCP Servers**](frontend/src/docs/17-skills-and-mcp.md) | Anatomy of `SKILL.md`, tool schemas, AI Skill Generator, and Model Context Protocol integrations. |

---

## 📄 License

[Apache License 2.0](./LICENSE) — free for personal and commercial use, with attribution.