# 🧩 Skills & Model Context Protocol (MCP) Guide

Skills and MCP servers extend your LLM with custom tools, external APIs, and sandboxed code execution.

---

## 📝 Anatomy of a `SKILL.md` File

Skills are defined as Markdown files containing **YAML frontmatter** (defining tool schemas and execution parameters) followed by **Markdown instructions** (guiding the LLM when and how to call the tools).

Skills are placed in the `skills/<skill_name>/SKILL.md` directory or created visually in the dashboard:

```yaml
---
name: currency_converter
description: Converts monetary amounts between international currencies using live exchange rates.
tools:
  - name: get_exchange_rate
    description: Retrieves the current exchange rate between two currency codes.
    type: http
    method: GET
    url: https://api.exchangerate.host/convert
    parameters:
      type: object
      properties:
        from_currency:
          type: string
          description: 3-letter source currency code (e.g. USD, EUR, INR).
        to_currency:
          type: string
          description: 3-letter target currency code.
        amount:
          type: number
          description: Numeric monetary amount to convert.
      required: [from_currency, to_currency, amount]

  - name: calculate_fx_fee
    description: Calculates banking wire conversion fees using a Python script.
    type: code
    command: python3 -c "{{code}}"
    parameters:
      type: object
      properties:
        code:
          type: string
          description: Python code snippet calculating percentage fees.
      required: [code]
---

# Currency Converter Instructions

1. Always check exchange rates first using `get_exchange_rate` before calculating conversions.
2. If the user asks about wire transfer spreads or percentage fees, run the calculation in `calculate_fx_fee`.
3. Format output currency symbols clearly in the final assistant answer.
```

---

## 🛠️ Supported Tool Types

| Tool Type | Execution Location | Description |
|---|---|---|
| `http` / `rest_api` / `api` | Gateway Server | Dispatches an HTTP request (`GET`, `POST`, `PUT`, `DELETE`) to an external REST endpoint with query params, headers, and JSON body. |
| `code` | Code Sandbox | Executes dynamic programming code passed by the LLM as a parameter (Python, Node.js, Bash). |
| `shell` | Code Sandbox | Runs a predefined shell command or script inside the isolated sandbox. |
| `mcp` / `mcp_stdio` | MCP Server Process | Invokes a tool exposed by an active Model Context Protocol server. |

---

## 🤖 AI Skill Generator

Don't want to author `SKILL.md` YAML schemas manually? Use the built-in **AI Skill Generator**:

1. In the dashboard, navigate to **Skills Catalog** (`/skills`).
2. Click **+ Generate Skill**.
3. Provide high-level details:
   - **Skill Name**: e.g. `slack_notifier`
   - **Description**: What problem this skill solves.
   - **Target Endpoints**: Any API URLs, authentication tokens, or headers.
   - **Behavioral Notes**: Instructions on how the agent should handle edge cases.
4. Click **Generate with AI**.
5. The engine uses your active LLM to generate the complete, production-ready `SKILL.md` definition — including tool schemas, parameters, and system prompts.
6. Click **Save & Activate** to hot-reload the skill immediately without restarting the server!

---

## 🔌 Model Context Protocol (MCP) Hub

AI Skill Engine acts as an **MCP Host**, allowing your models to connect to external MCP servers and automatically discover their tools.

Both **stdio** and **HTTP/SSE** transports are supported:

### 1. Registering an MCP Server:
1. In the dashboard, go to **MCP Servers** (`/mcp`).
2. Click **+ Add MCP Server**:
   - **Server Name**: `github_mcp`
   - **Transport**: `stdio`
   - **Command**: `npx`
   - **Arguments**: `-y @modelcontextprotocol/server-github`
   - **Environment Variables**: `GITHUB_PERSONAL_ACCESS_TOKEN=ghp_...`
3. Click **Connect & Discover Tools**.

### 2. Auto-Discovery:
The engine connects to the MCP process, queries its tool definitions, and automatically translates them into OpenAI function calling schemas available to the model.

---

## 🧭 Next Steps

- **[API Reference](api-reference.md)**: Pass skill names in chat completions requests.
- **[Usage Guide](usage-guide.md)**: Explore the Chat Playground and App groupings.
