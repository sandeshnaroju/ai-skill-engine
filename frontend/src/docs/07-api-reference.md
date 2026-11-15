# 📡 Complete REST API Reference

This reference documents the complete suite of REST endpoints available to **External API Users** authenticating via their Tenant API Key (`Authorization: Bearer sk_mgr_...` or `X-API-Key: ...`).

---

## 1. Chat Completions & Sessions (`/api/v1/...`)

### `POST /api/v1/chat/completions`
Executes an AI agent turn with dynamic tool orchestration, reasoning streaming, and artifact generation. Compatible with the standard OpenAI wire format.

**Request Body:**
```json
{
  "messages": [{"role": "user", "content": "Fetch top news and draft a summary."}],
  "model": "gemini-2.5-flash",
  "stream": true,
  "session_id": "thread_abc123",
  "skill_names": ["http_fetcher", "code_interpreter"],
  "app_id": "support_app",
  "user_data": {"api_key": "custom_token"},
  "temperature": 0.7
}
```

### `GET /api/v1/sessions`
Lists conversation sessions for the authenticated workspace.
- **Query Params**: `page` (int), `page_size` (int).

### `GET /api/v1/sessions/{session_id}/messages`
Retrieves message history for a session, including reasoning traces (`reasoning`) and tool execution details.

### `DELETE /api/v1/sessions/{session_id}`
Deletes a conversation session and its stored message history.

---

## 2. Artifacts & Universal Canvas (`/api/v1/artifacts/...`)

### `GET /api/v1/artifacts/{artifact_id}`
Returns artifact metadata, type (`document`, `spreadsheet`, `presentation`, `diagram_svg`, `cad_3d`, `pcb_layout`), source content, and versions.

### `GET /api/v1/artifacts/session/{session_id}`
Lists all artifacts generated in a specific conversation session.

### `GET /api/v1/artifacts/{artifact_id}/stream`
Connects to a real-time SSE stream of live block edits for an artifact. Accepts either `Authorization` header, `X-API-Key`, or temporary `token` query param.

### `GET /api/v1/artifacts/{artifact_id}/export`
Exports the compiled artifact directly in binary format.
- **Query Params**: `format` (e.g. `pdf`, `docx`, `xlsx`, `pptx`, `csv`, `svg`, `png`, `html`), `inline` (`true` or `false`).

### `POST /api/v1/artifacts/{artifact_id}/embed-token`
Generates a signed temporary HMAC token to securely embed the Canvas in an `<iframe>` without exposing the Tenant API key.
- **Query Params**: `expires_in_minutes` (default 30, range 5–1440).

### `GET /api/v1/artifacts/{artifact_id}/blocks/{block_key}`
Fetches the current content and version of an individual block within an artifact.

### `PUT /api/v1/artifacts/{artifact_id}/blocks/{block_key}`
Headless REST block creation/update for building custom editors without an iframe:
```json
{
  "content": "Updated paragraph or cell data",
  "author": "external_api"
}
```

### `GET /api/v1/artifacts/{artifact_id}/commits`
Lists the commit revision history for the artifact (or a specific block via `?block_key=...`).

### `POST /api/v1/artifacts/{artifact_id}/blocks/{block_key}/rollback`
Reverts a specific block to a prior version number:
```json
{
  "target_version": 2
}
```

### `DELETE /api/v1/artifacts/{artifact_id}`
Permanently deletes an artifact and its associated blocks and commits.

---

## 3. Files & Storage (`/api/v1/files/...`)

### `POST /api/v1/files/upload`
Uploads a file (multipart/form-data) to a specific session so agents can read and analyze it.
- **Form Fields**: `file` (binary), `session_id` (string).

### `GET /api/v1/files/session/{session_id}`
Lists all files uploaded or generated within a session.
- **Query Params**: `source` (optional), `origin` (optional: `user` or `agent`).

### `GET /api/v1/files/tenant`
Lists all tracked files across the tenant workspace with pagination (`page`, `page_size`, `provider`).

### `GET /api/v1/files/download/{tenant_name}/{filename}` & `GET /api/v1/files/download/{filename}`
Streams the binary file content for download from cloud or local storage.

### `DELETE /api/v1/files/{file_id}`
Deletes a single tracked file by its ID from storage and the database.

### `DELETE /api/v1/files/session/{session_id}`
Cascade-deletes all files attached to a session.

---

## 4. Scheduled Jobs & Automation (`/api/v1/scheduler/...`)

### `POST /api/v1/scheduler/jobs`
Creates a recurring or one-shot background job.
```json
{
  "name": "Daily Uptime Report",
  "prompt": "Check server health and email summary to devops@company.com using the email skill.",
  "trigger_type": "cron",
  "cron_expression": "0 9 * * *",
  "user_data_template_id": "optional_profile_id",
  "skill_names": ["http_fetcher", "email"],
  "model_name": "gemini-2.5-flash",
  "store_in_session": true
}
```

### `GET /api/v1/scheduler/jobs`
Lists scheduled jobs with pagination and status filters (`status=active|paused`, `trigger_type=cron|interval|date`).

### `GET /api/v1/scheduler/jobs/{job_id}`
Returns single job details, run counts, next trigger time, and last error.

### `PUT /api/v1/scheduler/jobs/{job_id}`
Updates cadence, prompt, model, or active status.

### `POST /api/v1/scheduler/jobs/{job_id}/trigger`
Forces an immediate execution in the background for testing.

### `POST /api/v1/scheduler/jobs/{job_id}/pause` & `POST /api/v1/scheduler/jobs/{job_id}/resume`
Pauses or resumes an active schedule.

### `DELETE /api/v1/scheduler/jobs/{job_id}`
Permanently deletes a scheduled job.

---

## 5. Skills & Tool Catalog (`/api/v1/skills/...`)

### `GET /api/v1/skills`
Lists all active built-in and custom skills available to the tenant workspace.

### `GET /api/v1/skills/{skill_name}`
Inspects a specific skill's YAML schema, description, and input parameters.

### `POST /api/v1/skills`
Registers a new custom skill using `SKILL.md` format (HTTP, Python, or Custom tools).

### `PUT /api/v1/skills/{skill_name}` & `DELETE /api/v1/skills/{skill_name}`
Updates or deletes a custom skill.

### `POST /api/v1/skills/{skill_name}/duplicate`
Clones an existing skill under a new name for fast authoring.

---

## 6. Apps & Tool Scoping (`/api/v1/apps/...`)

### `GET /api/v1/apps`
Lists grouped App packages that bundle specific skills together.

### `POST /api/v1/apps`
Creates or updates an App bundle:
```json
{
  "name": "customer_support",
  "description": "Zendesk & CRM tools only",
  "skill_names": ["crm_lead_creator", "email"]
}
```

### `DELETE /api/v1/apps/{app_id}`
Deletes an App container.

### `POST /api/v1/apps/{app_id}/duplicate`
Clones an existing app bundle.

---

## 7. Model Context Protocol Hub (`/api/v1/mcp_servers/...`)

### `GET /api/v1/mcp_servers`
Lists all connected MCP servers and their auto-discovered tools.

### `POST /api/v1/mcp_servers`
Registers a new MCP server (e.g. PostgreSQL, Local Filesystem, GitHub):
```json
{
  "name": "postgres_db",
  "transport": "stdio",
  "command": "npx -y @modelcontextprotocol/server-postgres postgresql://usr:pwd@localhost:5432/mydb"
}
```

### `POST /api/v1/mcp_servers/{server_id}/sync`
Triggers re-discovery of tools exposed by the MCP server.

### `DELETE /api/v1/mcp_servers/{server_id}`
Unregisters an MCP server.

---

## 8. Secrets & User Data Profiles (`/api/v1/user_data_templates/...`)

### `GET /api/v1/user_data_templates`
Lists saved credential and context profiles.

### `GET /api/v1/user_data_templates/{template_id}`
Retrieves a specific profile's key-value pairs.

### `POST /api/v1/user_data_templates`
Creates or updates a secret profile:
```json
{
  "name": "Staging Credentials",
  "description": "Staging API tokens",
  "data": {
    "stripe_key": "sk_test_...",
    "crm_token": "crm_test_token"
  }
}
```

### `PUT /api/v1/user_data_templates/{template_id}` & `DELETE /api/v1/user_data_templates/{template_id}`
Modifies or removes a secret profile template.

---

## 9. Tenant Workspace & Models (`/api/v1/tenant/...`)

### `GET /api/v1/tenant/llms`
Lists all active LLM models configured and accessible to this tenant (Gemini, OpenAI, Claude, Grok, Ollama) along with token rates.

---

## 10. HTTP Status & Error Codes

| Status Code | Reason | Resolution |
| :--- | :--- | :--- |
| **`200 OK`** | Success | Request succeeded. |
| **`400 Bad Request`** | Invalid parameters | Check missing or malformed fields in your request JSON. |
| **`401 Unauthorized`** | Missing or invalid API key | Pass `Authorization: Bearer sk_mgr_...`. |
| **`403 Forbidden`** | Workspace permission check failed | Ensure the requested resource belongs to your tenant workspace. |
| **`404 Not Found`** | Resource missing | Verify the session, artifact, or job ID. |
| **`429 Rate Limited`** | Quota / Token budget exceeded | Check token limits in **Tenants & Keys**. |
| **`500 Internal Error`** | Tool execution or sandbox failure | Inspect raw stdout/stderr in execution logs. |
