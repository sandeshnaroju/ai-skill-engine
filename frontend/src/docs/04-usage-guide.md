# 💡 Usage & Dashboard Workflows

The AI Skill Engine Admin Dashboard provides an end-to-end interface for testing agents, managing skills, packaging apps, inspecting sandbox audit logs, and monitoring real-time API client usage.

---

## 🧭 Dashboard Navigation Overview

The sidebar is divided into four functional categories:

| Group | Page | URL | Purpose |
|---|---|---|---|
| **Chat & Testing** | **Chat Playground** | `/playground` | Live chatbot simulator with streaming, reasoning traces, and Canvas side-by-side. |
| | **API Tester** | `/tester` | In-browser HTTP request builder to test external API client requests without leaving the dashboard. |
| **Registry & Assets** | **Apps & Groups** | `/apps` | Package skills into logical application containers for scoped API access. |
| | **Skills Catalog** | `/skills` | Visual catalog to create, edit, test, and AI-generate SKILL.md tool definitions. |
| | **Artifacts** | `/artifacts` | Central repository of interactive documents, sheets, slides, and CAD files. |
| | **MCP Servers** | `/mcp` | Register and auto-discover tools from Model Context Protocol servers. |
| | **User Data Profiles** | `/user-data` | Define custom metadata schemas and user profile contexts. |
| **Settings & Gateway** | **Tenants & Keys** | `/tenants` | Manage workspace tenants, API keys, registered LLM models, and per-token pricing. |
| | **Email Configuration**| `/email-config` | Configure tenant SMTP server credentials for email transmission tools. |
| | **Storage Settings** | `/storage` | Configure active cloud storage (Azure Blob Storage, AWS S3, Local Disk). |
| | **Session Files** | `/session-files` | Explore, inspect, filter, download, and purge session files across cloud storage. |
| | **Sandbox Config** | `/sandbox` | Choose code execution backend (Docker, Azure ACA, E2B, Fly.io, AWS Lambda). |
| **Audit & Analytics** | **LLM Cost & Usage** | `/usage` | Real-time token usage, latency graphs, and billing analytics per tenant. |
| | **Sandbox Audit Logs** | `/logs` | Detailed execution history of traces triggered by the Chat Playground. |
| | **API Execution Logs** | `/apilogs` | Detailed execution history triggered by external customer API calls. |
| | **Request Logs** | `/requestlogs` | Full raw HTTP request/response inspection logs. |
| | **API Documentation** | `/api-docs` | Interactive Unified API and Artifact embedding documentation. |

---

## 💬 1. Chat Playground Workflows

The **Chat Playground** (`/playground`) is your primary testing ground:

### Key Features:
- **Model Selector**: Switch seamlessly between registered models (Gemini, OpenAI, Claude, local Ollama).
- **Skill Scoping**: Toggle specific skills on or off to test how your model behaves with different tool combinations.
- **Agent Reasoning & Thought Traces**: Click the collapsible thought bubbles to inspect the model's intermediate planning steps before tool execution.
- **Tool Output Inspection**: Click on any tool pill (`run_python`, `call_api`, `write_file`) to expand the exact parameters sent to the sandbox and the raw stdout/stderr returned.
- **Split-Screen Canvas**: When an artifact is created or edited, the right half of the screen expands into the Live Canvas automatically.

---

## 🎨 2. Universal Canvas & Artifacts

The **Universal Canvas** provides an interactive viewport for documents, spreadsheets, presentations, and engineering diagrams:

### Co-Editing & Version History:
- **Interactive Markdown & Document Editor**: Click any section block to edit text with live autosave.
- **Spreadsheet SheetGrid**: Edit formula cells, filter columns, and preview CSV/XLSX tables.
- **Dynamic SlidePlayer**: Preview pitch decks and slide layouts with presenter notes.
- **AutoCAD 2D & 3D Three.js Viewports**: Rotate and inspect 3D models (`.step`, `.stl`, `.obj`) or zoom into architectural DXF floorplans.
- **One-Click Export**: Click the Export icon in the Canvas header to download the compiled binary document as `.docx`, `.pdf`, `.xlsx`, or `.pptx`.

---

## 📦 3. Packaging Apps & Skill Groups

Instead of granting client chatbots access to all 30+ skills at once, use **Apps & Groups** (`/apps`):

1. Click **+ Create New App**.
2. Give the App a unique identifier, e.g. `financial_advisor`.
3. Select the required skills:
   - `math_solver`
   - `code_interpreter`
   - `financial_datasets`
4. When your backend calls `/api/v1/chat/completions`, simply pass:
   ```json
   {
     "app_id": "financial_advisor",
     "messages": [{"role": "user", "content": "Analyze our Q3 churn rate"}]
   }
   ```
   The engine automatically restricts the model to only those tools included in the app.

---

## 🎭 4. Generative UI with ProChat

AI Skill Engine integrates natively with **ProChat** to return interactive React components directly in chat responses:

1. Register a ProChat model in **Tenants & Keys** (e.g. `genui-mars-0.1`).
2. Pass `"prochat_model": "genui-mars-0.1"` in your API completion payload.
3. Once the orchestrating LLM generates the answer, the engine calls the ProChat generative UI renderer.
4. The response streams back dynamic interactive widgets (custom booking calendars, survey forms, reactive KPI dashboards) rendered inline in the chat interface.

---

## 📁 5. Session & Storage Files Manager

Located at **Session Files** (`/session-files`):
- **Provider Filtering**: Filter files by **All Providers**, **Azure Blob Storage**, **AWS S3**, or **Local Disk**.
- **Search & Session Filtering**: Type any filename, storage path, or `session_id` to immediately locate files uploaded by users or generated by Python code.
- **Source & Origin Breakdown**: Distinguish between files created in the Playground vs. External API clients, and User Uploads vs. Tool-Generated outputs.
- **Session Purge Action**: Click the red trash icon beside any session ID to open the **Purge Session Files Modal**. Confirming permanently deletes all blobs from your cloud container and clears database records.

---

## 💰 6. Token Tracking & Cost Analytics

Located at **LLM Cost & Usage** (`/usage`):
- **Per-Tenant Breakdown**: View token consumption (prompt tokens, completion tokens, audio tokens) grouped by tenant.
- **Profit Margin & Reseller Billing**: Because you can set custom pricing rates on each tenant model, the dashboard calculates your exact costs vs. billed amounts.
- **Latency & Error Rates**: Track average tool execution latency and LLM response times over 24-hour, 7-day, and 30-day windows.

---

## 🛡️ 7. Real-Time Audit Logs

Located at **Sandbox Audit Logs** (`/logs`) and **API Execution Logs** (`/apilogs`):
- **Execution Traces**: Every tool invocation records timestamp, tenant, execution duration, sandbox environment, command executed, stdout, and stderr.
- **Security Compliance**: Ensure no unauthorized code or malicious commands are executed in sandboxes.

---

## 🧭 Next Steps

- **[API Reference](09-api-reference.md)**: Explore API request parameters, streaming SSE, and multimodal routing.
- **[Session Storage Guide](14-session-storage.md)**: Business backend file lifecycle management.
- **[Skills & MCP Guide](17-skills-and-mcp.md)**: Build custom tools and connect external MCP servers.
