# 📖 Introduction & Architecture

**AI Skill Engine** is an enterprise self-hosted AI gateway, tool execution engine, and multi-tenant skill hub. It transforms standard OpenAI-compatible API calls into actionable agent workflows equipped with sandboxed code execution, persistent file handling, third-party API tool use, interactive Canvas artifacts, and generative UI.

---

## 🎯 The Problem It Solves

Standard LLMs (GPT-4, Claude, Gemini) are powerful conversationalists, but in enterprise production they suffer from critical limitations:
1. **Inability to Act Directly**: Models cannot run code safely, execute shell commands, or trigger external APIs without a custom backend orchestration loop.
2. **Infrastructure Complexity**: Setting up isolated Docker sandboxes, secure token proxies, and cloud storage integrations requires months of boilerplate engineering.
3. **Multi-Tenant Chaos**: Serving multiple clients or internal departments with separate API keys, custom skillsets, per-client token cost tracking, and isolated audit logs is complex to build and maintain.
4. **Static Outputs**: Returning flat markdown or code blocks forces users to copy-paste into external applications rather than interactively editing documents, spreadsheets, slides, and CAD files.

**AI Skill Engine bridges this gap in minutes.** It acts as a transparent, high-performance gateway between your frontend application and upstream LLM providers.

---

## 🏗️ High-Level Architecture

```
                                  [ Client Applications / Frontend ]
                                  (Chatbot UI, SaaS App, API Clients)
                                                  │
                                                  ▼
                                 ┌─────────────────────────────────┐
                                 │  AI Skill Engine Gateway        │
                                 │  (FastAPI • OpenAI-Compatible)  │
                                 └────────────────┬────────────────┘
                                                  │
                                                  ▼
                                 ┌─────────────────────────────────┐
                                 │  Orchestrator & Agent Planner   │
                                 │  (Multi-Turn ReAct Loop ≤ 25)   │
                                 └────────┬───────────────┬────────┘
                                          │               │
                     ┌────────────────────┘               └────────────────────┐
                     ▼                                                         ▼
    ┌─────────────────────────────────┐                       ┌─────────────────────────────────┐
    │  Tool Executor & Sandbox Engine │                       │  Storage & Artifact Hub         │
    │  • Local Docker Containers      │                       │  • Azure Blob Storage           │
    │  • Azure Container Apps (ACA)   │                       │  • AWS S3 / MinIO / R2          │
    │  • E2B Micro-VMs                │                       │  • Local Host Storage           │
    │  • Fly.io / AWS Lambda          │                       │  • Interactive Canvas Engine    │
    └─────────────────────────────────┘                       └─────────────────────────────────┘
                     │                                                         │
                     └────────────────────┬────────────────────────────────────┘
                                          │
                                          ▼
                         [ Upstream Foundation Models ]
               (OpenAI, Google Gemini, Anthropic via OpenRouter, Ollama)
```

### Request Lifecycle:
1. **Client Request**: Your business app sends an OpenAI-formatted `POST /api/v1/chat/completions` request with a Tenant API key (`Authorization: Bearer sk_mgr_...`).
2. **Tenant Authentication & Rate Governance**: The gateway validates the tenant, loads the tenant's model configurations, cost pricing rates, and enabled skill sets.
3. **Planning & Tool Assembly**: The engine combines registered skills, custom tools, and external Model Context Protocol (MCP) servers into standard OpenAI function definitions.
4. **Execution Loop**:
   - If the LLM generates a tool call (e.g. `run_python`, `call_api`, `create_artifact`), the engine securely dispatches it to the configured sandbox (Docker, Azure ACA, E2B, etc.).
   - Tool outputs and generated files are fed back to the model iteratively (supporting up to 25 continuous ReAct turns).
5. **Storage & Streaming**:
   - Generated files and charts are saved to the tenant's active storage provider (Azure Blob, S3, or Local Disk).
   - Artifacts (interactive documents, spreadsheets, slides) are compiled with signed HMAC preview tokens.
   - The final stream is flushed back to the client via standard Server-Sent Events (SSE).

---

## 🏢 Core Concepts

### 1. Tenants (Workspaces)
A **Tenant** represents an isolated API consumer — a client company, an internal business department, or a separate staging/production environment. Each tenant has:
- A unique API Key (`sk_mgr_...`).
- Its own registered LLM providers and pricing models.
- Isolated conversation histories and audit logs.
- Dedicated sandbox execution folders and storage namespaces.
- Granular token usage and cost accounting.

### 2. Skills
A **Skill** is an extensible capability defined via a `SKILL.md` file containing YAML frontmatter and markdown system instructions. It defines:
- The tools available to the model (shell commands, Python scripts, REST APIs, MCP connectors).
- Behavioral guidelines directing *when* and *how* the model should execute those tools.

### 3. Apps & Skill Groups
An **App** is a logical container grouping specific skills together. For instance:
- **Finance Analyst App**: Bundles `math_solver`, `spreadsheet_editor`, and `financial_apis`.
- **Customer Support App**: Bundles `kb_search`, `email_sender`, and `crm_lookup`.

When client backends call the API, they can pass `"app_id": "finance_analyst"` to automatically scope the agent to only the relevant tools.

### 4. Universal Canvas Artifacts
Instead of returning long text walls or static markdown code blocks, the engine can create and co-edit **Artifacts**:
- **Documents & Contracts** (`.docx`, `.pdf`, `.md`)
- **Interactive Spreadsheets** (`.xlsx`, `.csv`)
- **Presentation Slides** (`.pptx`)
- **Engineering CAD & 3D Models** (`.dxf`, `.step`, `.stl`)

Users can view, edit, version, and export these directly inside an interactive iframe canvas or through headless REST/SSE endpoints.

---

## 🔒 Security & Data Privacy

- **Self-Hosted Autonomy**: All data, conversation histories, and execution logs reside on your infrastructure (Docker host, VM, or private cloud).
- **Hyper-Isolated Code Sandboxes**: Code execution happens inside isolated containers or micro-VMs, never directly compromising host application code.
- **Envelope Encryption**: Secrets, API keys, and cloud storage credentials in the database are encrypted using Fernet (AES-128-CBC with HMAC-SHA256).
- **Ephemeral Access Tokens**: Canvas embedding utilizes time-bounded (30-minute) HMAC tokens, ensuring client browsers never see or expose master tenant API keys.

---

## 🧭 Next Steps

- **[Installation Guide](installation.md)**: Deploy with Docker Hub, Docker Compose, or Bare-Metal.
- **[Quickstart Guide](quickstart.md)**: Spin up and execute your first tool in under 5 minutes.
- **[API Reference](api-reference.md)**: Explore the OpenAI-compatible gateway specifications.
