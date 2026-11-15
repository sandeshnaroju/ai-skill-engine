# 🖥️ Chat Playground & Dashboard Guide

The AI Skill Engine web dashboard provides a complete control center to test agents, configure skills, schedule jobs, inspect live tool outputs, and track token usage across your workspaces.

---

## 1. Navigating the Dashboard

| Section | Page | What You Do Here |
| :--- | :--- | :--- |
| **Chat Playground** | `/playground` | Real-time agent testing ground with model switching, skill toggles, and live artifact splits. |
| **Scheduled Jobs** | `/schedules` | Set up automated recurring tasks, view run histories, and pause/resume jobs. |
| **Skills Catalog** | `/skills` | Visual library to test, edit, and AI-generate SKILL.md tool definitions. |
| **Apps & Groups** | `/apps` | Bundle specific skills into isolated App containers for customer API clients. |
| **Artifacts** | `/artifacts` | Central repository of all generated spreadsheets, documents, presentations, and CAD models. |
| **User Data Profiles** | `/user-data` | Securely manage API keys, database connection strings, and runtime parameters. |
| **Tenants & Keys** | `/tenants` | Manage client workspaces, generate API keys, and configure LLM models. |
| **LLM Costs & Analytics**| `/usage` | Real-time token usage graphs, latency metrics, and billing analytics per tenant. |
| **Audit Logs** | `/logs` | Comprehensive sandbox and API execution history with raw stdout/stderr traces. |

---

## 2. Using the Chat Playground

The **Chat Playground** (`/playground`) is designed for fast, iterative agent testing:

### Key Controls:
- **Model Selector**: Switch between registered models (Gemini 2.5 Flash, GPT-4o, Claude 3.7 Sonnet, DeepSeek R1, or local Ollama).
- **Active Skills Drawer**: Click the right-hand panel to toggle individual skills on or off to test how the model behaves with different tool combinations.
- **Thought Process Accordion**: Inspect the model's live chain-of-thought reasoning before and during tool calls.
- **Tool Execution Drawers**: Click on any tool pill (`run_python`, `call_api`, `send_email`) to inspect the exact parameters passed to the sandbox and the raw output returned.
- **Split Canvas View**: When the agent creates or edits a document or spreadsheet, the Live Canvas automatically opens side-by-side with your chat.

---

## 3. Packaging Skills into Apps

To provide scoped access to specific API clients (e.g. creating a `Customer Support Bot` that only has access to Zendesk tools, not SQL databases):
1. Go to **Apps & Groups** (`/apps`).
2. Click **+ New App**.
3. Name your app (e.g. `support_bot`) and select the subset of skills it is allowed to use.
4. When calling `/api/v1/chat/completions`, simply pass `"app_id": "support_bot"`. The model will be strictly restricted to those tools.
