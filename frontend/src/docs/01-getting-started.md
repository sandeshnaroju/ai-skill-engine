# 🚀 Quickstart & Platform Overview

Welcome to **AI Skill Engine** — an enterprise AI gateway, agent execution harness, and multi-tenant skill hub. 

With AI Skill Engine, you can take standard LLM prompts and turn them into autonomous, tool-calling agents that can:
- **Execute Python code safely** in isolated Docker containers or micro-VM sandboxes.
- **Call your internal and third-party REST APIs** securely.
- **Connect external databases and filesystems** via Model Context Protocol (MCP).
- **Generate live interactive documents, spreadsheets, presentations, and CAD diagrams** with real-time co-editing.
- **Run automated background tasks** on repeating schedules (Cron / Interval / Date triggers).

---

## ⚡ 3-Minute First Request

AI Skill Engine is **100% wire-compatible with the standard OpenAI API**. You can use any official OpenAI SDK, LangChain, LlamaIndex, or plain cURL.

### 1. Get Your Tenant API Key
From the dashboard, navigate to **Tenants & Keys** (`/tenants`) and copy your API key (prefixed with `sk_mgr_`).

### 2. Make a Tool-Calling API Request

Here is a simple example asking the AI agent to calculate compound interest using Python in a sandboxed container:

#### Python (Official `openai` SDK)
```python
from openai import OpenAI

# Point the client to your AI Skill Engine server
client = OpenAI(
    base_url="http://localhost:2704/api/v1",
    api_key="sk_mgr_YOUR_TENANT_API_KEY"
)

response = client.chat.completions.create(
    model="gemini-2.5-flash",
    messages=[
        {"role": "user", "content": "Calculate the compound interest on $25,000 at 8.5% annual return for 12 years using Python."}
    ],
    extra_body={
        "skill_names": ["code_interpreter"]  # Enables Python sandbox tool
    }
)

print(response.choices[0].message.content)
```

#### Node.js / JavaScript
```javascript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:2704/api/v1",
  apiKey: "sk_mgr_YOUR_TENANT_API_KEY",
});

async function main() {
  const completion = await client.chat.completions.create({
    model: "gemini-2.5-flash",
    messages: [
      { role: "user", content: "Calculate 25,000 at 8.5% compound return for 12 years with Python." }
    ],
    skill_names: ["code_interpreter"]
  });

  console.log(completion.choices[0].message.content);
}

main();
```

#### cURL
```bash
curl -X POST http://localhost:2704/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY" \
  -d '{
    "model": "gemini-2.5-flash",
    "messages": [
      {"role": "user", "content": "Calculate $25,000 at 8.5% annual return for 12 years using Python."}
    ],
    "skill_names": ["code_interpreter"]
  }'
```

---

## 🧭 How the Execution Cycle Works

```
   User / Client App
          │
          ▼
   POST /api/v1/chat/completions
          │
          ▼
┌──────────────────────────────────────────────┐
│  AI Skill Engine Orchestrator                │
│                                              │
│  1. Analyzes User Query & Active Skills      │
│  2. Model determines required tool calls     │
│  3. Dispatches code / API to isolated sandbox│
│  4. Captures execution output / artifacts    │
│  5. Synthesizes clear, final response        │
└──────────────────────────────────────────────┘
          │
          ▼
   Returns Final Answer + Interactive Artifacts
```

---

## 🎯 What to Explore Next

| I want to... | Guide |
| :--- | :--- |
| **Authenticate and isolate multiple tenants/clients** | [02 - Authentication & Workspaces](02-authentication-and-tenants.md) |
| **Stream real-time thought traces and tool status** | [03 - Chat Completions & Real-Time Streaming](03-chat-completions.md) |
| **Embed live documents, spreadsheets, or slides in my app** | [04 - Embedding Artifacts & Universal Canvas](04-artifacts-and-canvas.md) |
| **Upload files and analyze documents** | [05 - File Uploads & Session Storage](05-files-and-storage.md) |
| **Schedule automated daily or weekly jobs** | [06 - Scheduled Background Tasks](06-scheduled-jobs.md) |
| **Connect my own REST APIs as AI skills** | [08 - Connecting Custom APIs as AI Skills](08-custom-skills.md) |
