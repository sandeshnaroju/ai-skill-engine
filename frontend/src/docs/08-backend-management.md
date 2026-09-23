# 🛠️ Artifacts & System Management APIs

This reference covers the operational and administrative REST endpoints provided by AI Skill Engine, including Canvas Artifact management, MCP server integration, execution sandbox logs, and audit trails.

---

## 🎨 Canvas Artifacts Endpoints

Manage real-time documents, section blocks, rollback commits, live typing streams, and token minting:

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/artifacts/{id}` | Fetch document metadata, outline, and current state. |
| `PUT` | `/api/v1/artifacts/{id}` | Replace or update full document content. |
| `GET` | `/api/v1/artifacts/{id}/blocks/{key}` | Fetch content for a specific surgical section block. |
| `PUT` | `/api/v1/artifacts/{id}/blocks/{key}` | Surgically update a single block (creates a version diff commit). |
| `GET` | `/api/v1/artifacts/{id}/commits` | Retrieve full commit audit history and diff snapshots. |
| `POST` | `/api/v1/artifacts/{id}/blocks/{key}/rollback` | Roll back a specific block to a previous commit ID. |
| `GET` | `/api/v1/artifacts/{id}/stream` | Server-Sent Events (SSE) live typing and real-time surgical patch stream. |
| `POST` | `/api/v1/artifacts/{id}/refresh-token` | Silent background token renewal (used by iframe). |
| `POST` | `/api/v1/artifacts/{id}/embed-token` | Mint a fresh, time-bounded HMAC embed token. |
| `GET` | `/api/v1/artifacts/{id}/export?format=...` | Direct binary export (`docx`, `pdf`, `xlsx`, `pptx`). |
| `GET` | `/api/v1/artifacts/session/{session_id}` | List all artifacts created within a specific session. |
| `DELETE` | `/api/v1/artifacts/session/{session_id}` | Bulk delete all artifacts associated with a session. |

---

## 🔌 MCP & Skills Management

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/mcp_servers` | List all configured Model Context Protocol (MCP) servers. |
| `POST` | `/api/v1/mcp_servers` | Register a new MCP server (STDIO command or SSE URL). |
| `DELETE` | `/api/v1/mcp_servers/{id}` | Remove an MCP server registration. |
| `POST` | `/api/v1/mcp_servers/{id}/sync` | Ping MCP server and synchronize available tools into the engine. |
| `GET` | `/api/v1/skills` | List all loaded skills, active tools, and JSON function schemas. |

---

## 📊 Logs, Requests & Usage Analytics

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/logs` | Fetch sandbox execution logs (stdout, stderr, execution duration, sandbox provider). |
| `GET` | `/api/v1/requests` | Audit log of all incoming completions requests with token counts and calculated cost. |
| `GET` | `/api/v1/usage/summary` | Aggregated usage metrics grouped by model, tenant, and date range. |

---

## ⚙️ Storage & Sandbox System Configuration

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/system/storage-config` | View active storage provider settings (Local Disk, AWS S3, Azure Blob). |
| `POST` | `/api/v1/system/storage-config` | Update storage backend credentials and bucket/container targets. |
| `GET` | `/api/v1/system/sandbox-config` | View active execution sandbox backend (Docker, E2B, ACA, Fly.io, Lambda). |
| `POST` | `/api/v1/system/sandbox-config` | Update sandbox execution provider configurations and timeouts. |

---

## 🧭 Related Guides

- **[Canvas Headless REST & SSE](11-frontend-headless.md)** — Step-by-step cURL examples for building custom canvas viewers
- **[Skills & MCP Servers](17-skills-and-mcp.md)** — Configuring Model Context Protocol tools and custom skills
- **[Configuration & Settings](16-configuration.md)** — Environment variables and encryption settings
