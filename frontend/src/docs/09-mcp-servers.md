# 🔌 Connecting External Tools with MCP

**Model Context Protocol (MCP)** is an open standard developed by Anthropic that allows AI applications to connect to external systems—such as **PostgreSQL databases, local filesystems, GitHub repositories, Slack channels, and browser engines**—without custom code.

AI Skill Engine acts as an **MCP Host**, automatically discovering and exposing tools from any registered MCP server to your agents.

---

## 1. Supported MCP Transport Modes

| Transport | How It Works | Common Use Cases |
| :--- | :--- | :--- |
| **`stdio`** | Launches a local CLI command as a subprocess (e.g. `npx -y @modelcontextprotocol/server-postgres`) | Direct PostgreSQL queries, SQLite, local filesystems, Git repos. |
| **`sse` / `http`** | Connects to a remote HTTP server streaming Server-Sent Events | Remote enterprise microservices, shared team tools, cloud agents. |

---

## 2. Connecting an MCP Server in 2 Minutes

### Example: Connecting a PostgreSQL Database

1. Navigate to **MCP Servers** (`/mcp`) in the dashboard.
2. Click **+ Add MCP Server**.
3. Fill in the details:
   - **Name**: `Production DB`
   - **Transport**: `stdio`
   - **Command**: `npx -y @modelcontextprotocol/server-postgres postgresql://user:pass@localhost:5432/mydb`
4. Click **Save & Discover Tools**.

The engine will launch the server, query its capabilities, and automatically expose tools such as `read_query`, `write_query`, and `list_tables` to your AI agents!

---

## 3. Using MCP Tools in Prompts

Once registered, MCP tools behave identically to built-in skills. In the **Chat Playground** or via **API**:

> **User**: *"Check our database and show the top 5 customers with the highest outstanding invoice balances."*

The model will:
1. Discover the `read_query` tool from your PostgreSQL MCP server.
2. Formulate a secure SQL `SELECT` query.
3. Execute it through the MCP server.
4. Return a clean formatted markdown table or spreadsheet artifact.

---

## 4. MCP Management REST API

You can also register and manage MCP servers programmatically:

```bash
# Register a remote SSE MCP server
curl -X POST http://localhost:2704/api/v1/mcp/servers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY" \
  -d '{
    "name": "Cloud Filesystem",
    "transport": "sse",
    "url": "http://mcp-server.internal:8080/sse"
  }'

# Trigger tool re-discovery
curl -X POST http://localhost:2704/api/v1/mcp/servers/{server_id}/sync \
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY"
```
