import React, { useState } from 'react';
import {
  BookOpen, Key, Terminal, Code, Check, Copy, Zap, Cpu, Server,
  ShieldCheck, Activity, Layers, Globe, FileText, Layout, ExternalLink,
  ArrowRight, Sparkles, Download, Lock, CheckCircle2, Sliders, Eye
} from 'lucide-react';

export default function ApiDocs() {
  const [activeSection, setActiveSection] = useState('backend'); // 'backend' | 'frontend'
  const [activeLang, setActiveLang] = useState('curl');
  const [activeMode, setActiveMode] = useState('stream');
  const [activeType, setActiveType] = useState('standard');
  const [activeArtifactTab, setActiveArtifactTab] = useState('data_fetching');
  const [copiedSection, setCopiedSection] = useState(null);

  const copyCode = (code, id) => {
    navigator.clipboard.writeText(code);
    setCopiedSection(id);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const codeSnippets = {
    standard: {
      stream: {
        curl: `curl -N -X POST http://localhost:8000/api/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY" \\
  -d '{
    "messages": [
      {"role": "user", "content": "Calculate 20,000 RS at 12% interest for 20 years"}
    ],
    "model": "gemini-2.5-flash",
    "stream": true,
    "session_id": "chatbot_user_session_101",
    "app_id": "customer_support_prod",
    "skill_names": ["weather_fetcher", "math_solver"]
  }'`,
        python: `from openai import OpenAI

# Connect official OpenAI Python SDK directly to AI Skill Engine gateway
client = OpenAI(
    base_url="http://localhost:8000/api/v1",
    api_key="sk_mgr_YOUR_TENANT_API_KEY"
)

response_stream = client.chat.completions.create(
    model="gemini-2.5-flash",
    messages=[{"role": "user", "content": "Calculate compound interest for 20k @ 12% for 20 yrs"}],
    stream=True,
    extra_body={
        "session_id": "chatbot_user_session_101",
        "app_id": "customer_support_prod",
        "skill_names": ["weather_fetcher", "math_solver"]
    }
)

for chunk in response_stream:
    # 1. Handle top-level Done/Error event structures
    raw = chunk.model_dump() if hasattr(chunk, "model_dump") else dict(chunk)
    if raw.get("type") == "done":
        print(f"\n[DONE] Tools called: {raw.get('tools_called')}")
        continue
    elif raw.get("type") == "error":
        print(f"\n[ERROR] {raw.get('detail')}")
        continue

    if not chunk.choices:
        continue
    delta = chunk.choices[0].delta

    # 2. Extract standard chat text assistant response
    if delta.content:
        print(delta.content, end="", flush=True)

    # 3. Extract reasoning/thinking steps
    reasoning = getattr(delta, "reasoning", None) or (delta.model_extra or {}).get("reasoning")
    if reasoning:
        print(f"\n[Reasoning] {reasoning}")

    # 4. Extract tool execution calls
    tool_call = getattr(delta, "tool_call", None) or (delta.model_extra or {}).get("tool_call")
    if tool_call:
        print(f"\n[Tool Call] {tool_call.get('name')} with args: {tool_call.get('arguments')}")

    # 5. Extract sandbox execution results
    tool_result = getattr(delta, "tool_result", None) or (delta.model_extra or {}).get("tool_result")
    if tool_result:
        print(f"\n[Tool Result] {tool_result.get('tool_name')} exit: {tool_result.get('exit_code')}")
        print(f"Stdout: {tool_result.get('stdout')}")

    # 6. Extract ProChat UI components if present
    p_json = getattr(delta, "json", None) or (delta.model_extra or {}).get("json")
    p_code = getattr(delta, "code", None) or (delta.model_extra or {}).get("code")
    if p_json:
        print("\nProChat JSON Schema:", p_json)
    if p_code:
        print("\nProChat React Code:", p_code)`,
        javascript: `const response = await fetch("http://localhost:8000/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer sk_mgr_YOUR_TENANT_API_KEY"
  },
  body: JSON.stringify({
    messages: [{ role: "user", content: "Calculate compound interest for 20k @ 12% for 20 yrs" }],
    stream: true,
    session_id: "user_session_202",
    app_id: "customer_support_prod",
    skill_names: ["weather_fetcher", "math_solver"]
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder("utf-8");
let buffer = "";

while (true) {
  const { value, done } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split("\n");
  buffer = lines.pop();

  for (const line of lines) {
    const cleanLine = line.trim();
    if (!cleanLine.startsWith("data: ")) continue;
    const rawData = cleanLine.substring(6);
    if (rawData === "[DONE]") break;

    try {
      const dataJson = JSON.parse(rawData);

      // 1. Handle top-level control events (done / error)
      if (dataJson.type === "done") {
        console.log(\`\n[DONE] Tools called: \${dataJson.tools_called}\`);
        continue;
      }
      if (dataJson.type === "error") {
        console.error(\`\n[ERROR] \${dataJson.detail}\`);
        continue;
      }

      const delta = dataJson.choices[0]?.delta;
      if (!delta) continue;

      // 2. Read natural language response
      if (delta.content) {
        process.stdout.write(delta.content);
      }

      // 3. Read status / reasoning logs
      if (delta.reasoning) {
        console.log(\`\n[Status] \${delta.reasoning}\`);
      }

      // 4. Read tool triggers / arguments
      if (delta.tool_call) {
        console.log(\`\n[Tool Call] \${delta.tool_call.name}\`, delta.tool_call.arguments);
      }

      // 5. Read sandbox output / tool results
      if (delta.tool_result) {
        console.log(\`\n[Tool Result] \${delta.tool_result.tool_name} exit=\${delta.tool_result.exit_code}\`);
        console.log(\`Stdout: \${delta.tool_result.stdout}\`);
      }

      // 6. Read ProChat UI component (if configured)
      if (delta.json) {
        console.log("\nProChat JSON Component:", delta.json);
      }
      if (delta.code) {
        console.log("\nProChat React Code:", delta.code);
      }
    } catch (err) {}
  }
}`,
      },
      sync: {
        curl: `curl -X POST http://localhost:8000/api/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY" \\
  -d '{
    "messages": [
      {"role": "user", "content": "Check server disk space"}
    ],
    "stream": false,
    "session_id": "user_session_404",
    "app_id": "customer_support_prod",
    "skill_names": ["weather_fetcher", "math_solver"]
  }'`,
        python: `import requests

url = "http://localhost:8000/api/v1/chat/completions"
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer sk_mgr_YOUR_TENANT_API_KEY"
}
payload = {
    "messages": [{"role": "user", "content": "Check server disk space"}],
    "stream": False,
    "session_id": "user_session_404",
    "app_id": "customer_support_prod",
    "skill_names": ["weather_fetcher", "math_solver"]
}

response = requests.post(url, headers=headers, json=payload).json()
print("Chatbot Answer:", response["choices"][0]["message"]["content"])
print("Executed Tools:", response["executed_tools"])`,
        javascript: `const response = await fetch("http://localhost:8000/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer sk_mgr_YOUR_TENANT_API_KEY"
  },
  body: JSON.stringify({
    messages: [{ role: "user", content: "Check server disk space" }],
    stream: false,
    session_id: "user_session_505",
    app_id: "customer_support_prod",
    skill_names: ["weather_fetcher", "math_solver"]
  })
});

const data = await response.json();
console.log("Answer:", data.choices[0].message.content);
console.log("Sandbox Audit Runs:", data.executed_tools);`,
      },
    },
    prochat: {
      stream: {
        curl: `curl -N -X POST http://localhost:8000/api/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY" \\
  -d '{
    "messages": [
      {"role": "user", "content": "Generate a sales dashboard chart"}
    ],
    "model": "gemini-2.5-flash",
    "stream": true,
    "prochat_model": "genui-mars-0.1",
    "session_id": "prochat_stream_session_001"
  }'`,
        python: `from openai import OpenAI

# Connect official OpenAI Python SDK directly to AI Skill Engine gateway
client = OpenAI(
    base_url="http://localhost:8000/api/v1",
    api_key="sk_mgr_YOUR_TENANT_API_KEY"
)

# Pass custom parameters via extra_body when using OpenAI SDK
response_stream = client.chat.completions.create(
    model="gemini-2.5-flash",
    messages=[{"role": "user", "content": "Generate a sales dashboard chart"}],
    stream=True,
    extra_body={
        "prochat_model": "genui-mars-0.1",
        "session_id": "prochat_stream_session_001"
    }
)

for chunk in response_stream:
    # 1. Handle top-level Done/Error event structures
    raw = chunk.model_dump() if hasattr(chunk, "model_dump") else dict(chunk)
    if raw.get("type") == "done":
        print(f"\n[DONE] Tools called: {raw.get('tools_called')}")
        continue
    elif raw.get("type") == "error":
        print(f"\n[ERROR] {raw.get('detail')}")
        continue

    if not chunk.choices:
        continue
    delta = chunk.choices[0].delta

    # 2. Extract standard chat text assistant response
    if delta.content:
        print(delta.content, end="", flush=True)

    # 3. Extract reasoning/thinking steps
    reasoning = getattr(delta, "reasoning", None) or (delta.model_extra or {}).get("reasoning")
    if reasoning:
        print(f"\n[Reasoning] {reasoning}")

    # 4. Extract tool execution calls
    tool_call = getattr(delta, "tool_call", None) or (delta.model_extra or {}).get("tool_call")
    if tool_call:
        print(f"\n[Tool Call] {tool_call.get('name')} with args: {tool_call.get('arguments')}")

    # 5. Extract sandbox execution results
    tool_result = getattr(delta, "tool_result", None) or (delta.model_extra or {}).get("tool_result")
    if tool_result:
        print(f"\n[Tool Result] {tool_result.get('tool_name')} exit: {tool_result.get('exit_code')}")
        print(f"Stdout: {tool_result.get('stdout')}")

    # 6. Extract ProChat UI components if present
    p_json = getattr(delta, "json", None) or (delta.model_extra or {}).get("json")
    p_code = getattr(delta, "code", None) or (delta.model_extra or {}).get("code")
    if p_json:
        print("\nProChat JSON Schema:", p_json)
    if p_code:
        print("\nProChat React Code:", p_code)`,
        javascript: `const response = await fetch("http://localhost:8000/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer sk_mgr_YOUR_TENANT_API_KEY"
  },
  body: JSON.stringify({
    messages: [{ role: "user", content: "Generate a sales dashboard chart" }],
    stream: true,
    prochat_model: "genui-mars-0.1",
    session_id: "prochat_stream_session_002"
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder("utf-8");
let buffer = "";

while (true) {
  const { value, done } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split("\n");
  buffer = lines.pop(); // Keep partial line in buffer

  for (const line of lines) {
    const cleanLine = line.trim();
    if (!cleanLine.startsWith("data: ")) continue;
    const rawData = cleanLine.substring(6);
    if (rawData === "[DONE]") break;

    try {
      const dataJson = JSON.parse(rawData);

      // 1. Handle top-level control events (done / error)
      if (dataJson.type === "done") {
        console.log(\`\n[DONE] Tools called: \${dataJson.tools_called}\`);
        continue;
      }
      if (dataJson.type === "error") {
        console.error(\`\n[ERROR] \${dataJson.detail}\`);
        continue;
      }

      const delta = dataJson.choices[0]?.delta;
      if (!delta) continue;

      // 2. Read natural language response
      if (delta.content) {
        process.stdout.write(delta.content);
      }

      // 3. Read status / reasoning logs
      if (delta.reasoning) {
        console.log(\`\n[Status] \${delta.reasoning}\`);
      }

      // 4. Read tool triggers / arguments
      if (delta.tool_call) {
        console.log(\`\n[Tool Call] \${delta.tool_call.name}\`, delta.tool_call.arguments);
      }

      // 5. Read sandbox output / tool results
      if (delta.tool_result) {
        console.log(\`\n[Tool Result] \${delta.tool_result.tool_name} exit=\${delta.tool_result.exit_code}\`);
        console.log(\`Stdout: \${delta.tool_result.stdout}\`);
      }

      // 6. Read ProChat UI component (if configured)
      if (delta.json) {
        console.log("\nProChat JSON Component:", delta.json);
      }
      if (delta.code) {
        console.log("\nProChat React Code:", delta.code);
      }
    } catch (err) {}
  }
}`,
      },
      sync: {
        curl: `curl -X POST http://localhost:8000/api/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY" \\
  -d '{
    "messages": [
      {"role": "user", "content": "Generate a sales dashboard chart"}
    ],
    "stream": false,
    "prochat_model": "genui-mars-0.1",
    "session_id": "prochat_sync_session_001"
  }'`,
        python: `import requests

url = "http://localhost:8000/api/v1/chat/completions"
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer sk_mgr_YOUR_TENANT_API_KEY"
}
payload = {
    "messages": [{"role": "user", "content": "Generate a sales dashboard chart"}],
    "stream": False,
    "prochat_model": "genui-mars-0.1",
    "session_id": "prochat_sync_session_002"
}

response = requests.post(url, headers=headers, json=payload).json()
message = response["choices"][0]["message"]

# Retrieve all elements returned by the UI model in non-stream mode
print("Chatbot Answer (Text):", message["content"])
print("ProChat UI Configuration (JSON):", message.get("json"))
print("ProChat UI Component Code (Code):", message.get("code"))`,
        javascript: `const response = await fetch("http://localhost:8000/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer sk_mgr_YOUR_TENANT_API_KEY"
  },
  body: JSON.stringify({
    messages: [{ role: "user", content: "Generate a sales dashboard chart" }],
    stream: false,
    prochat_model: "genui-mars-0.1",
    session_id: "prochat_sync_session_003"
  })
});

const data = await response.json();
const message = data.choices[0].message;

// Retrieve all elements returned by the UI model in non-stream mode
console.log("Chatbot Answer (Text):", message.content);
console.log("ProChat UI Configuration (JSON):", message.json);
console.log("ProChat UI Component Code (Code):", message.code);`,
      },
    },
    artifacts: {
      stream: {
        curl: `curl -N -X POST http://localhost:8000/api/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY" \\
  -d '{
    "messages": [
      {"role": "user", "content": "Draft an Executive Modernization Plan in Canvas with Tech Architecture and Financials"}
    ],
    "model": "gemini-2.5-flash",
    "stream": true,
    "session_id": "client_session_801",
    "skill_names": ["artifact_editor"]
  }'`,
        python: `from openai import OpenAI

# Connect official OpenAI Python SDK directly to AI Skill Engine gateway
client = OpenAI(
    base_url="http://localhost:8000/api/v1",
    api_key="sk_mgr_YOUR_TENANT_API_KEY"
)

response_stream = client.chat.completions.create(
    model="gemini-2.5-flash",
    messages=[{"role": "user", "content": "Draft an Executive Modernization Plan in Canvas"}],
    stream=True,
    extra_body={
        "session_id": "client_session_801",
        "skill_names": ["artifact_editor"]
    }
)

for chunk in response_stream:
    if not chunk.choices:
        continue
    delta = chunk.choices[0].delta

    # 1. Stream natural language chat response text
    if delta.content:
        print(delta.content, end="", flush=True)

    # 2. Extract real-time artifact payload
    artifact = getattr(delta, "artifact", None) or (delta.model_extra or {}).get("artifact")
    if artifact:
        print(f"\\n\\n[NEW ARTIFACT GENERATED]")
        print(f"Artifact ID: {artifact['artifact_id']}")
        print(f"Title: {artifact['title']}")
        print(f"Format: {artifact['artifact_type']}")
        print(f"Embed URL: {artifact['embed_url']}") # Pass this directly to your website's <iframe>!
        print(f"Token: {artifact['token']}")`,
        javascript: `// Call AI Skill Engine SSE gateway from your customer web application
const response = await fetch("http://localhost:8000/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer sk_mgr_YOUR_TENANT_API_KEY"
  },
  body: JSON.stringify({
    messages: [{ role: "user", content: "Draft an Executive Modernization Plan in Canvas" }],
    stream: true,
    session_id: "client_session_801",
    skill_names: ["artifact_editor"]
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder("utf-8");
let buffer = "";

while (true) {
  const { value, done } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split("\\n");
  buffer = lines.pop();

  for (const line of lines) {
    const clean = line.trim();
    if (!clean.startsWith("data: ") || clean === "data: [DONE]") continue;

    try {
      const data = JSON.parse(clean.substring(6));
      const delta = data.choices[0]?.delta;
      if (!delta) continue;

      // 1. Text token streaming
      if (delta.content) {
        appendChatText(delta.content);
      }

      // 2. Real-time Artifact Detection
      if (delta.artifact) {
        const { artifact_id, title, embed_url, token, artifact_type } = delta.artifact;
        // Mount interactive Canvas iframe in your customer website drawer:
        openCanvasDrawer(embed_url, title);
      }
    } catch (e) {}
  }
}`,
      },
      sync: {
        curl: `curl -X POST http://localhost:8000/api/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY" \\
  -d '{
    "messages": [
      {"role": "user", "content": "Draft an Executive Modernization Plan in Canvas"}
    ],
    "stream": false,
    "session_id": "client_session_802",
    "skill_names": ["artifact_editor"]
  }'`,
        python: `import requests

url = "http://localhost:8000/api/v1/chat/completions"
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer sk_mgr_YOUR_TENANT_API_KEY"
}
payload = {
    "messages": [{"role": "user", "content": "Draft an Executive Modernization Plan in Canvas"}],
    "stream": False,
    "session_id": "client_session_802",
    "skill_names": ["artifact_editor"]
}

response = requests.post(url, headers=headers, json=payload).json()
msg = response["choices"][0]["message"]

print("Assistant Text:", msg["content"])

# Extract artifact data for website embedding
if "artifact" in msg:
    art = msg["artifact"]
    print("Artifact Title:", art["title"])
    print("Embed URL:", art["embed_url"]) # e.g. /embed/canvas?token=...`,
        javascript: `const response = await fetch("http://localhost:8000/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer sk_mgr_YOUR_TENANT_API_KEY"
  },
  body: JSON.stringify({
    messages: [{ role: "user", content: "Draft an Executive Modernization Plan in Canvas" }],
    stream: false,
    session_id: "client_session_802",
    skill_names: ["artifact_editor"]
  })
});

const data = await response.json();
const message = data.choices[0].message;

console.log("Chat text:", message.content);

if (message.artifact) {
  const { artifact_id, title, embed_url, token } = message.artifact;
  // Embed in customer web page
  renderArtifactCard({ title, embed_url });
}`,
      },
    },
  };

  const responseExamples = {
    standard: {
      sync: `{
  "id": "chatcmpl-client_session_101",
  "request_id": "req_8f1a23e9a",
  "object": "chat.completion",
  "created": 1700000000,
  "model": "gemini-2.5-flash",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Compound Interest Calculation:\\nPrincipal: 20,000 RS\\nRate: 12% per annum\\nTime: 20 years\\n\\nTotal Accrued Amount: ₹192,925.86\\nTotal Interest Earned: ₹172,925.86",
        "json": null,
        "code": null
      },
      "finish_reason": "stop"
    }
  ],
  "executed_tools": [
    {
      "tool_name": "run_python_calculation",
      "skill_name": "math_solver",
      "exit_code": 0,
      "execution_time_ms": 42,
      "generated_files": []
    }
  ]
}`,
      stream: `data: {"id": "chatcmpl-101", "object": "chat.completion.chunk", "created": 1700000000, "model": "gemini-2.5-flash", "choices": [{"index": 0, "delta": {"reasoning": "Invoking Run Python Calculation (Skill: Math Solver)...", "tool_call": {"name": "Run Python Calculation", "arguments": {"formula": "20000 * (1 + 0.12)**20"}}}, "finish_reason": null}]}

data: {"id": "chatcmpl-101", "object": "chat.completion.chunk", "created": 1700000000, "model": "gemini-2.5-flash", "choices": [{"index": 0, "delta": {"reasoning": "Run Python Calculation finished in 42ms.", "tool_result": {"tool_name": "Run Python Calculation", "skill_name": "Math Solver", "stdout": "192925.86", "stderr": null, "sandbox_type": "process", "execution_time_ms": 42, "exit_code": 0, "generated_files": [], "artifact_data": null}}, "finish_reason": null}]}

data: {"id": "chatcmpl-101", "object": "chat.completion.chunk", "created": 1700000000, "model": "gemini-2.5-flash", "choices": [{"index": 0, "delta": {"content": "Compound "}, "finish_reason": null}]}

data: {"id": "chatcmpl-101", "object": "chat.completion.chunk", "created": 1700000000, "model": "gemini-2.5-flash", "choices": [{"index": 0, "delta": {"content": "Interest Calculation: Total ₹192,925.86."}, "finish_reason": null}]}

data: {"type": "done", "request_id": "req_8f1a23e9a", "tools_called": 1}

data: [DONE]`
    },
    prochat: {
      sync: `{
  "id": "chatcmpl-prochat_session_505",
  "request_id": "req_b29c011e4",
  "object": "chat.completion",
  "created": 1700000000,
  "model": "gemini-2.5-flash",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Here is the interactive budget breakdown visualization.",
        "json": {
          "component": "InteractiveBarChart",
          "title": "Quarterly Expenditure Analysis",
          "data": [
            { "category": "R&D", "amount": 45000 },
            { "category": "Marketing", "amount": 28000 },
            { "category": "Operations", "amount": 19000 }
          ]
        },
        "code": "function BudgetChart({ data }) {\\n  return (\\n    <div className='p-4 rounded-xl bg-slate-900 border border-slate-800'>\\n      <h3>Quarterly Breakdown</h3>\\n      {/* React generative UI component */}\\n    </div>\\n  );\\n}"
      },
      "finish_reason": "stop"
    }
  ],
  "executed_tools": []
}`,
      stream: `data: {"id": "chatcmpl-505", "object": "chat.completion.chunk", "created": 1700000000, "model": "gemini-2.5-flash", "choices": [{"index": 0, "delta": {"content": "Here is the interactive budget breakdown visualization."}, "finish_reason": null}]}

data: {"id": "chatcmpl-505", "object": "chat.completion.chunk", "created": 1700000000, "model": "gemini-2.5-flash", "choices": [{"index": 0, "delta": {"reasoning": "Generating dynamic user interface components..."}, "finish_reason": null}]}

data: {"id": "chatcmpl-505", "object": "chat.completion.chunk", "created": 1700000000, "model": "gemini-2.5-flash", "choices": [{"index": 0, "delta": {"json": {"component": "InteractiveBarChart", "title": "Quarterly Expenditure Analysis", "data": [{"category": "R&D", "amount": 45000}, {"category": "Marketing", "amount": 28000}]}, "code": "function BudgetChart({ data }) { return <div>Chart</div>; }"}, "finish_reason": null}]}

data: {"type": "done", "request_id": "req_b29c011e4", "tools_called": 0}

data: [DONE]`
    },
    artifacts: {
      sync: `{
  "id": "chatcmpl-client_session_802",
  "request_id": "req_993e7f22a",
  "object": "chat.completion",
  "created": 1700000000,
  "model": "gemini-2.5-flash",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "I have created the Executive Modernization Plan in Canvas. You can view, co-edit, or export the document directly.",
        "artifact": {
          "artifact_id": "84419384-8e98-4b7f-bc21-8f2abe21f44c",
          "title": "Executive Modernization Plan",
          "filename": "executive_modernization_plan.md",
          "artifact_type": "document",
          "current_version": 1,
          "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJartIjoiODQ0MTkzODQtOGU5OC00YjdmLWJjMjEtOGYyYWJlMjFmNDRjIiwidGVuIjoidGVuYW50XzEwMSIsImV4cCI6MTcwMDAwMTgwMH0...",
          "embed_url": "/embed/canvas?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
        }
      },
      "finish_reason": "stop"
    }
  ],
  "executed_tools": [
    {
      "tool_name": "create_artifact",
      "skill_name": "artifact_editor",
      "exit_code": 0,
      "execution_time_ms": 58,
      "generated_files": ["executive_modernization_plan.md"]
    }
  ]
}`,
      stream: `data: {"id": "chatcmpl-802", "object": "chat.completion.chunk", "created": 1700000000, "model": "gemini-2.5-flash", "choices": [{"index": 0, "delta": {"reasoning": "Invoking Create Artifact (Skill: Artifact Editor)...", "tool_call": {"name": "Create Artifact", "arguments": {"title": "Executive Modernization Plan", "artifact_type": "document", "filename": "executive_modernization_plan.md"}}}, "finish_reason": null}]}

data: {"id": "chatcmpl-802", "object": "chat.completion.chunk", "created": 1700000000, "model": "gemini-2.5-flash", "choices": [{"index": 0, "delta": {"reasoning": "Create Artifact finished in 58ms.", "tool_result": {"tool_name": "Create Artifact", "skill_name": "Artifact Editor", "exit_code": 0, "execution_time_ms": 58, "artifact_data": {"id": "84419384-8e98-4b7f-bc21-8f2abe21f44c", "title": "Executive Modernization Plan", "filename": "executive_modernization_plan.md", "artifact_type": "document", "current_version": 1, "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...", "embed_url": "/embed/canvas?token=eyJhbGci..."}}}, "finish_reason": null}]}

data: {"id": "chatcmpl-802", "object": "chat.completion.chunk", "created": 1700000000, "model": "gemini-2.5-flash", "choices": [{"index": 0, "delta": {"artifact": {"artifact_id": "84419384-8e98-4b7f-bc21-8f2abe21f44c", "title": "Executive Modernization Plan", "filename": "executive_modernization_plan.md", "artifact_type": "document", "current_version": 1, "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...", "embed_url": "/embed/canvas?token=eyJhbGci..."}}, "finish_reason": null}]}

data: {"id": "chatcmpl-802", "object": "chat.completion.chunk", "created": 1700000000, "model": "gemini-2.5-flash", "choices": [{"index": 0, "delta": {"content": "I have created the Executive Modernization Plan in Canvas. You can view, co-edit, or export the document directly."}, "finish_reason": null}]}

data: {"type": "done", "request_id": "req_993e7f22a", "tools_called": 1}

data: [DONE]`
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
      {/* Header Banner */}
      <div className="glass-box" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <BookOpen size={24} color="var(--primary-cyan)" /> Unified Enterprise API Documentation
            </h2>
            <p style={{ color: 'var(--text-sub)', fontSize: '0.92rem', marginTop: '6px', lineHeight: '1.6' }}>
              <code>AI Skill Engine</code> acts as an MCP Client and Security Gateway. It connects to external <strong>MCP Servers</strong>, auto-discovers tools, executes them safely, and delivers interactive generative UI &amp; Universal Artifacts.
            </p>
          </div>

          <a
            href="/swagger"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-outline"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '6px 12px', textDecoration: 'none' }}
          >
            <ExternalLink size={14} /> Interactive Swagger UI (/swagger)
          </a>
        </div>

        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '14px', lineHeight: '1.5', background: 'var(--bg-input)', padding: '10px 14px', borderRadius: '8px', borderLeft: '3px solid var(--primary-cyan)', border: '1px solid var(--border-subtle)' }}>
          <strong>Authentication:</strong> Authenticate all requests using standard HTTP Bearer token format: <code>Authorization: Bearer YOUR_TENANT_API_KEY</code>
        </p>

        {/* Top-Level Section Switcher: Backend vs Frontend */}
        <div style={{ marginTop: '20px', display: 'flex', gap: '12px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '16px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveSection('backend')}
            className={activeSection === 'backend' ? 'btn-gradient' : 'btn-outline'}
            style={{
              padding: '10px 20px',
              fontSize: '0.92rem',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            <Server size={18} />
            <span>1. Backend API (Modes, Model Types &amp; SDKs)</span>
          </button>

          <button
            onClick={() => setActiveSection('frontend')}
            className={activeSection === 'frontend' ? 'btn-gradient' : 'btn-outline'}
            style={{
              padding: '10px 20px',
              fontSize: '0.92rem',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            <Layout size={18} />
            <span>2. Frontend Integration (Canvas Artifacts &amp; Iframe)</span>
          </button>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '14px', flexWrap: 'wrap' }}>
          <div className="badge-tag tag-docker"><ShieldCheck size={14} /> Multi-Tenant API Key Auth</div>
          <div className="badge-tag tag-process"><Cpu size={14} /> Sandbox Docker &amp; Process Drivers</div>
          <div className="badge-tag tag-http"><Globe size={14} /> OpenAI Stream &amp; Sync Compatible</div>
          <div className="badge-tag tag-shell"><Layers size={14} /> Universal Artifacts &amp; Canvas</div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 1: BACKEND API (MODES, MODEL TYPES & SDKs)                     */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeSection === 'backend' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Primary Unified Endpoint Card */}
          <div className="glass-box" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: 'var(--accent-emerald)', padding: '6px 12px', borderRadius: '8px', fontWeight: '700', fontSize: '0.88rem' }}>POST</span>
                <code style={{ fontSize: '1.15rem', fontWeight: '700', color: 'var(--text-main)' }}>/api/v1/chat/completions</code>
              </div>

              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Model Type Selector */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Model Type:</span>
                  <button
                    className={activeType === 'standard' ? 'btn-gradient' : 'btn-outline'}
                    onClick={() => setActiveType('standard')}
                    style={{ padding: '5px 12px', fontSize: '0.8rem' }}
                  >
                    Standard Model
                  </button>
                  <button
                    className={activeType === 'prochat' ? 'btn-gradient' : 'btn-outline'}
                    onClick={() => setActiveType('prochat')}
                    style={{ padding: '5px 12px', fontSize: '0.8rem' }}
                  >
                    ProChat UI Model
                  </button>
                  <button
                    className={activeType === 'artifacts' ? 'btn-gradient' : 'btn-outline'}
                    onClick={() => setActiveType('artifacts')}
                    style={{ padding: '5px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <FileText size={14} /> Universal Artifacts
                  </button>
                </div>

                {/* Mode Selector */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Mode:</span>
                  <button
                    className={activeMode === 'stream' ? 'btn-gradient' : 'btn-outline'}
                    onClick={() => setActiveMode('stream')}
                    style={{ padding: '5px 12px', fontSize: '0.8rem' }}
                  >
                    Streaming (stream: true)
                  </button>
                  <button
                    className={activeMode === 'sync' ? 'btn-gradient' : 'btn-outline'}
                    onClick={() => setActiveMode('sync')}
                    style={{ padding: '5px 12px', fontSize: '0.8rem' }}
                  >
                    Synchronous (stream: false)
                  </button>
                </div>
              </div>
            </div>

            <p style={{ color: 'var(--text-sub)', fontSize: '0.92rem', marginBottom: '16px', lineHeight: '1.6' }}>
              {activeMode === 'stream'
                ? activeType === 'artifacts'
                  ? 'Emits token-by-token OpenAI chunk events along with real-time delta.artifact payloads. Clients receive the artifact ID, format, cryptographic HMAC token, and embed URL to mount an interactive Document Canvas directly in their web apps.'
                  : activeType === 'prochat'
                    ? 'Emits token-by-token OpenAI chunk events. When using a ProChat Generative UI model, it yields delta.content for text, delta.json for the parsed UI schema, and delta.code for the component code as they stream.'
                    : 'Emits token-by-token OpenAI chunk events (chat.completion.chunk). Includes live reasoning steps (delta.reasoning), tool invocation calls (delta.tool_call), and sandbox execution outputs (delta.tool_result) as the model thinks.'
                : activeType === 'artifacts'
                  ? 'Returns a complete synchronous JSON response containing the assistant text message and the full choices[0].message.artifact metadata object with title, block count, token, and ready-to-embed Canvas URL.'
                  : activeType === 'prochat'
                    ? 'Returns a complete synchronous JSON response containing the final text message, prochat UI configuration JSON, and the React component code inside choices[0].message.'
                    : 'Returns a complete synchronous JSON response containing the final message object, tenant information, and executed_tools audit log array.'}
            </p>

            {/* Language & View Switcher Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '600' }}>Language:</span>
                {['curl', 'python', 'javascript'].map((lang) => (
                  <button
                    key={lang}
                    className={activeLang === lang ? 'btn-gradient' : 'btn-outline'}
                    onClick={() => setActiveLang(lang)}
                    style={{ padding: '4px 10px', fontSize: '0.78rem', textTransform: 'uppercase' }}
                  >
                    {lang}
                  </button>
                ))}
              </div>

              <button className="btn-outline" onClick={() => copyCode(codeSnippets[activeType][activeMode][activeLang], 'unified')} style={{ padding: '4px 10px', fontSize: '0.78rem' }}>
                {copiedSection === 'unified' ? <Check size={14} color="var(--accent-emerald)" /> : <Copy size={14} />} Copy Request
              </button>
            </div>

            <pre className="code-display" style={{ maxHeight: '350px' }}>
              {codeSnippets[activeType][activeMode][activeLang]}
            </pre>

            {/* ── RESPONSE STRUCTURE & LIVE PAYLOAD VIEWER ── */}
            <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.84rem', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Activity size={15} color="var(--accent-emerald)" />
                    Expected Response ({activeType.toUpperCase()} - {activeMode === 'stream' ? 'SSE STREAM' : 'SYNCHRONOUS JSON'}):
                  </span>
                  <span style={{
                    fontSize: '0.72rem',
                    background: activeMode === 'stream' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                    color: activeMode === 'stream' ? '#38bdf8' : '#10b981',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontWeight: 600
                  }}>
                    {activeMode === 'stream' ? 'text/event-stream' : 'application/json'}
                  </span>
                </div>

                <button
                  className="btn-outline"
                  onClick={() => copyCode(responseExamples[activeType][activeMode], 'resp_copy')}
                  style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                >
                  {copiedSection === 'resp_copy' ? <Check size={14} color="var(--accent-emerald)" /> : <Copy size={14} />} Copy Response Payload
                </button>
              </div>

              <pre className="code-display" style={{ maxHeight: '320px', background: 'var(--bg-input)' }}>
                {responseExamples[activeType][activeMode]}
              </pre>
            </div>
          </div>

          {/* Backend Management Endpoints */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
            {/* Artifacts REST & SSE API */}
            <div className="glass-box" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <span style={{ background: 'rgba(99, 102, 241, 0.2)', color: 'var(--primary-indigo)', padding: '4px 8px', borderRadius: '6px', fontWeight: '700', fontSize: '0.78rem' }}>GET / PUT</span>
                <code style={{ fontSize: '0.92rem', fontWeight: '600', color: 'var(--text-main)' }}>/api/v1/artifacts/{'{id}'}</code>
              </div>
              <p style={{ color: 'var(--text-sub)', fontSize: '0.86rem', lineHeight: '1.5' }}>
                Universal Canvas REST &amp; SSE API: retrieve block outlines, surgical updates, real-time live typing streams, and multi-format binary compilation (DOCX, PDF, XLSX, PPTX).
              </p>
            </div>

            {/* MCP Connector */}
            <div className="glass-box" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <span style={{ background: 'rgba(168, 85, 247, 0.2)', color: 'var(--primary-purple)', padding: '4px 8px', borderRadius: '6px', fontWeight: '700', fontSize: '0.78rem' }}>GET / POST</span>
                <code style={{ fontSize: '0.92rem', fontWeight: '600', color: 'var(--text-main)' }}>/api/v1/mcp_servers</code>
              </div>
              <p style={{ color: 'var(--text-sub)', fontSize: '0.86rem', lineHeight: '1.5' }}>
                Connect to external stdio or HTTP/SSE MCP servers and auto-discover their tools.
              </p>
            </div>

            {/* Skills Discovery */}
            <div className="glass-box" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <span style={{ background: 'rgba(56, 189, 248, 0.2)', color: 'var(--primary-indigo)', padding: '4px 8px', borderRadius: '6px', fontWeight: '700', fontSize: '0.78rem' }}>GET</span>
                <code style={{ fontSize: '0.92rem', fontWeight: '600', color: 'var(--text-main)' }}>/api/v1/skills</code>
              </div>
              <p style={{ color: 'var(--text-sub)', fontSize: '0.86rem', lineHeight: '1.5' }}>
                Returns active skills, tool counts, and compiled OpenAI function schemas.
              </p>
            </div>

            {/* Audit Logs */}
            <div className="glass-box" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <span style={{ background: 'rgba(56, 189, 248, 0.2)', color: 'var(--primary-indigo)', padding: '4px 8px', borderRadius: '6px', fontWeight: '700', fontSize: '0.78rem' }}>GET</span>
                <code style={{ fontSize: '0.92rem', fontWeight: '600', color: 'var(--text-main)' }}>/api/v1/logs</code>
              </div>
              <p style={{ color: 'var(--text-sub)', fontSize: '0.86rem', lineHeight: '1.5' }}>
                Fetches sandbox execution logs (commands, stdout, stderr, execution duration, sandbox type).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 2: FRONTEND INTEGRATION (CANVAS ARTIFACTS & IFRAME)             */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeSection === 'frontend' && (
        <div className="glass-box" style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'rgba(99, 102, 241, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--primary-indigo)'
                }}>
                  <Layout size={20} />
                </div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-main)' }}>
                  Embedding Interactive Canvas Artifacts in Customer Websites
                </h3>
              </div>
              <p style={{ color: 'var(--text-sub)', fontSize: '0.9rem', marginTop: '6px', lineHeight: '1.6' }}>
                Give your users a <strong>Claude Artifacts</strong> and <strong>ChatGPT Canvas</strong> experience inside your own SaaS product or website. When your chatbot writes contracts, code scripts, spreadsheets, or presentations, users can interactively view, co-edit, and export them.
              </p>
            </div>

            {/* Strategy Tabs Bar - Premium Redesign */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '10px',
              width: '100%',
              marginTop: '12px'
            }}>
              {[
                {
                  id: 'data_fetching',
                  step: '01',
                  label: 'Response Schema',
                  sub: 'Extract artifact metadata',
                  icon: <FileText size={18} />,
                  accent: 'var(--accent-emerald)'
                },
                {
                  id: 'iframe_params',
                  step: '02',
                  label: 'Iframe Mounting',
                  sub: 'URL parameters & postMessage',
                  icon: <Layout size={18} />,
                  accent: 'var(--primary-indigo)'
                },
                {
                  id: 'headless',
                  step: '03',
                  label: 'Headless REST & SSE',
                  sub: 'Custom editor & live stream',
                  icon: <Terminal size={18} />,
                  accent: 'var(--primary-purple)'
                },
                {
                  id: 'security',
                  step: '04',
                  label: 'Security & Token Proxy',
                  sub: 'HMAC signature patterns',
                  icon: <Lock size={18} />,
                  accent: 'var(--accent-rose)'
                }
              ].map(tab => {
                const isActive = activeArtifactTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveArtifactTab(tab.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 14px',
                      borderRadius: '12px',
                      background: isActive
                        ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.15))'
                        : 'var(--bg-input)',
                      border: isActive
                        ? '1.5px solid var(--primary-violet)'
                        : '1px solid var(--border-subtle)',
                      boxShadow: isActive
                        ? '0 6px 18px rgba(139, 92, 246, 0.2)'
                        : 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      transform: isActive ? 'translateY(-1px)' : 'none'
                    }}
                  >
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: isActive ? tab.accent : 'rgba(255, 255, 255, 0.05)',
                      color: isActive ? '#ffffff' : 'var(--text-muted)',
                      flexShrink: 0,
                      transition: 'all 0.2s ease'
                    }}>
                      {tab.icon}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          color: isActive ? 'var(--primary-violet)' : 'var(--text-muted)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em'
                        }}>
                          STEP {tab.step}
                        </span>
                      </div>
                      <span style={{
                        fontSize: '0.84rem',
                        fontWeight: isActive ? 700 : 600,
                        color: isActive ? 'var(--text-main)' : 'var(--text-sub)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {tab.label}
                      </span>
                      <span style={{
                        fontSize: '0.72rem',
                        color: 'var(--text-muted)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {tab.sub}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tab 1: Reading Response & Data Fetching */}
          {activeArtifactTab === 'data_fetching' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: 'rgba(16, 185, 129, 0.08)', borderLeft: '3px solid var(--accent-emerald)', padding: '14px 18px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <h4 style={{ fontSize: '0.96rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '6px' }}>
                  💡 Reading &amp; Extracting Artifact Data from the API Response
                </h4>
                <p style={{ fontSize: '0.86rem', color: 'var(--text-sub)', lineHeight: '1.6' }}>
                  When your users prompt the LLM to create or modify a document, code script, or presentation, AI Skill Engine includes a structured <code>artifact</code> object in the response. You only need to read this payload and store it in your application state.
                </p>

                {/* Exact JSON Payload Inspection */}
                <div style={{ marginTop: '12px', background: 'var(--bg-input)', padding: '12px 14px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--primary-purple)', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                    Artifact Payload Schema (Available in <code>delta.artifact</code> or <code>message.artifact</code>):
                  </span>
                  <pre style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-main)', fontFamily: 'var(--font-mono)', lineHeight: '1.5' }}>
                    {`{
  "artifact_id": "84419384-8e98-4b7f-bc21-8f2abe21f44c", // Unique UUID of the artifact
  "title": "Application for Leave of Absence",         // Human-readable title
  "filename": "leave_application.md",                 // File name & format extension
  "artifact_type": "document",                        // 'document' | 'code' | 'spreadsheet' | 'presentation' | 'svg'
  "current_version": 1,                               // Version counter (increments on every edit)
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",  // Ephemeral HMAC security token
  "embed_url": "/embed/canvas?token=eyJhbGci..."      // Pre-signed iframe path ready to mount
}`}
                  </pre>
                </div>

                <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' }}>
                  <div style={{ background: 'var(--bg-input)', padding: '12px 14px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--primary-indigo)', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                      Method A: Streaming (stream: true)
                    </span>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0, lineHeight: '1.5' }}>
                      In SSE chunks, inspect <code>chunk.choices[0].delta.artifact</code>. When present, attach it to the current message in your chat state.
                    </p>
                  </div>
                  <div style={{ background: 'var(--bg-input)', padding: '12px 14px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--accent-emerald)', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                      Method B: Synchronous (stream: false)
                    </span>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0, lineHeight: '1.5' }}>
                      In the JSON response, inspect <code>response.choices[0].message.artifact</code>. It is directly accessible on the assistant message object.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Iframe URL & Query Parameters */}
          {activeArtifactTab === 'iframe_params' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: 'rgba(99, 102, 241, 0.08)', borderLeft: '3px solid var(--primary-indigo)', padding: '14px 18px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <h4 style={{ fontSize: '0.96rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '6px' }}>
                  🖥️ What to Pass Into the Iframe
                </h4>
                <p style={{ fontSize: '0.86rem', color: 'var(--text-sub)', lineHeight: '1.6' }}>
                  You can mount the interactive Canvas anywhere in your app (side drawer, dialog modal, tab, or embedded panel) by pointing an <code>&lt;iframe&gt;</code> to the engine's host URL combined with the artifact's <code>embed_url</code>.
                </p>

                {/* Table of parameters */}
                <div style={{ marginTop: '12px', overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '8px 10px' }}>Parameter</th>
                        <th style={{ padding: '8px 10px' }}>Location</th>
                        <th style={{ padding: '8px 10px' }}>Type / Values</th>
                        <th style={{ padding: '8px 10px' }}>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '8px 10px', color: 'var(--primary-violet)', fontFamily: 'var(--font-mono)' }}>token</td>
                        <td style={{ padding: '8px 10px' }}>Query param (in embed_url)</td>
                        <td style={{ padding: '8px 10px' }}>JWT string (Required)</td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-sub)' }}>
                          Pre-signed HMAC token returned in <code>artifact.token</code>. Authorizes access without exposing your master API key.
                        </td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '8px 10px', color: 'var(--primary-indigo)', fontFamily: 'var(--font-mono)' }}>theme</td>
                        <td style={{ padding: '8px 10px' }}>Query param</td>
                        <td style={{ padding: '8px 10px' }}><code>"dark"</code> | <code>"light"</code></td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-sub)' }}>
                          Sets the Canvas color theme to match your application styling (defaults to <code>dark</code>).
                        </td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '8px 10px', color: 'var(--primary-indigo)', fontFamily: 'var(--font-mono)' }}>THEME_CHANGE</td>
                        <td style={{ padding: '8px 10px' }}>window.postMessage</td>
                        <td style={{ padding: '8px 10px' }}><code>{`{ type: 'THEME_CHANGE', theme: 'dark'|'light' }`}</code></td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-sub)' }}>
                          PostMessage sent to the iframe window to update theme dynamically without reloading the iframe.
                        </td>
                      </tr>
                      <tr>
                        <td style={{ padding: '8px 10px', color: 'var(--primary-indigo)', fontFamily: 'var(--font-mono)' }}>allow="clipboard-write"</td>
                        <td style={{ padding: '8px 10px' }}>Iframe attribute</td>
                        <td style={{ padding: '8px 10px' }}>HTML attribute</td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-sub)' }}>
                          Required if you want users to use the one-click copy buttons inside the Canvas.
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Iframe Mounting Code Snippet */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Iframe Mount Example (HTML &amp; JavaScript):
                </span>
                <button
                  className="btn-outline"
                  onClick={() => copyCode(`<!-- HTML Iframe Embed Example -->
<iframe
  id="canvas-frame"
  src="https://api.yourdomain.com\${artifact.embed_url}&theme=dark"
  style="width: 100%; height: 100%; border: none;"
  title="Document Canvas"
  allow="clipboard-write"
></iframe>

<script>
  // Dynamically switch theme without reloading the iframe
  function setCanvasTheme(theme) {
    const iframe = document.getElementById("canvas-frame");
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: "THEME_CHANGE", theme }, "*");
    }
  }
</script>`, 'snippet_iframe_mount')}
                  style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                >
                  {copiedSection === 'snippet_iframe_mount' ? <Check size={14} color="var(--accent-emerald)" /> : <Copy size={14} />} Copy Iframe Code
                </button>
              </div>

              <pre className="code-display" style={{ maxHeight: '280px' }}>
                {`<!-- 1. Mount iframe with full URL + theme query parameter -->
<iframe
  id="canvas-frame"
  src={\`https://api.yourdomain.com\${artifact.embed_url}&theme=\${currentTheme}\`}
  style="width: 100%; height: 100%; border: none;"
  title="Document Canvas"
  allow="clipboard-write"
/>

<!-- 2. (Optional) Switch theme dynamically via postMessage -->
<script>
  iframeRef.contentWindow.postMessage({
    type: "THEME_CHANGE",
    theme: "light" // or "dark"
  }, "*");
</script>`}
              </pre>
            </div>
          )}

          {/* Tab 3: Headless REST & SSE */}
          {activeArtifactTab === 'headless' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: 'rgba(56, 189, 248, 0.08)', borderLeft: '3px solid var(--primary-indigo)', padding: '12px 16px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                <h4 style={{ fontSize: '0.92rem', fontWeight: '600', color: 'var(--text-main)', marginBottom: '4px' }}>
                  🛠️ Headless REST &amp; Live SSE API (cURL Reference)
                </h4>
                <p style={{ fontSize: '0.84rem', color: 'var(--text-sub)', lineHeight: '1.5' }}>
                  If you are building your own custom rich-text editor, canvas viewer, or document viewer instead of using the pre-built iframe, use these standard HTTP REST &amp; SSE endpoints to read outline trees, fetch section blocks, send inline user edits, subscribe to real-time keystroke updates, and compile binary files.
                </p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Headless REST &amp; Streaming cURL Specifications:
                </span>
                <button
                  className="btn-outline"
                  onClick={() => copyCode(`# 1. Fetch Document Metadata, Title & Block Outline
curl -X GET "http://localhost:8000/api/v1/artifacts/84419384-8e98-4b7f-bc21-8f2abe21f44c?token=SIGNED_EMBED_TOKEN"

# 2. Fetch Specific Section Block Content
curl -X GET "http://localhost:8000/api/v1/artifacts/84419384-8e98-4b7f-bc21-8f2abe21f44c/blocks/sec_1?token=SIGNED_EMBED_TOKEN"

# 3. Save Inline Block Edits from User (Creates Diff Commit)
curl -X PUT "http://localhost:8000/api/v1/artifacts/84419384-8e98-4b7f-bc21-8f2abe21f44c/blocks/sec_1?token=SIGNED_EMBED_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "content": "## Updated Section Heading\\n\\nModified paragraph text by user.",
    "summary": "User updated section 1 via custom website"
  }'

# 4. Subscribe to Real-Time SSE Stream (Live Typing & Surgical Patches)
curl -N -X GET "http://localhost:8000/api/v1/artifacts/84419384-8e98-4b7f-bc21-8f2abe21f44c/stream?token=SIGNED_EMBED_TOKEN"

# 5. Direct Binary File Export & Download Links (DOCX, PDF, XLSX, PPTX, MD)
# Word Document:
curl -O "http://localhost:8000/api/v1/artifacts/84419384-8e98-4b7f-bc21-8f2abe21f44c/export?format=docx&token=SIGNED_EMBED_TOKEN"
# PDF Document:
curl -O "http://localhost:8000/api/v1/artifacts/84419384-8e98-4b7f-bc21-8f2abe21f44c/export?format=pdf&token=SIGNED_EMBED_TOKEN"
# Excel Spreadsheet:
curl -O "http://localhost:8000/api/v1/artifacts/84419384-8e98-4b7f-bc21-8f2abe21f44c/export?format=xlsx&token=SIGNED_EMBED_TOKEN"
# PowerPoint Presentation:
curl -O "http://localhost:8000/api/v1/artifacts/84419384-8e98-4b7f-bc21-8f2abe21f44c/export?format=pptx&token=SIGNED_EMBED_TOKEN"`, 'snippet_headless')}
                  style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                >
                  {copiedSection === 'snippet_headless' ? <Check size={14} color="var(--accent-emerald)" /> : <Copy size={14} />} Copy All cURL Commands
                </button>
              </div>

              <pre className="code-display" style={{ maxHeight: '380px' }}>
                {`# ═══════════════════════════════════════════════════════════════════════
# 1. FETCH DOCUMENT METADATA & SECTION OUTLINE
# Returns: title, filename, format, version counter, and list of section blocks
# ═══════════════════════════════════════════════════════════════════════
curl -X GET "http://localhost:8000/api/v1/artifacts/{artifact_id}?token={embed_token}"

# ═══════════════════════════════════════════════════════════════════════
# 2. FETCH SPECIFIC SECTION BLOCK CONTENT
# Returns: block_key, title, content (markdown/code/table), and current version
# ═══════════════════════════════════════════════════════════════════════
curl -X GET "http://localhost:8000/api/v1/artifacts/{artifact_id}/blocks/{block_key}?token={embed_token}"

# ═══════════════════════════════════════════════════════════════════════
# 3. SAVE INLINE USER EDITS (SURGICAL BLOCK PATCH)
# Creates a forward-only diff commit and triggers live SSE notifications
# ═══════════════════════════════════════════════════════════════════════
curl -X PUT "http://localhost:8000/api/v1/artifacts/{artifact_id}/blocks/{block_key}?token={embed_token}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "content": "## Section Heading\\n\\nUpdated paragraph content written by user.",
    "summary": "User updated section text via custom UI"
  }'

# ═══════════════════════════════════════════════════════════════════════
# 4. SUBSCRIBE TO REAL-TIME SSE STREAM
# Yields: type="artifact_patch" on surgical edits & type="artifact_updated" on full updates
# ═══════════════════════════════════════════════════════════════════════
curl -N -X GET "http://localhost:8000/api/v1/artifacts/{artifact_id}/stream?token={embed_token}"

# ═══════════════════════════════════════════════════════════════════════
# 5. DIRECT BINARY FILE EXPORT & INSTANT DOWNLOAD LINKS
# Formats supported: docx | pdf | xlsx | pptx | md
# ═══════════════════════════════════════════════════════════════════════
curl -O "http://localhost:8000/api/v1/artifacts/{artifact_id}/export?format=docx&token={embed_token}"
curl -O "http://localhost:8000/api/v1/artifacts/{artifact_id}/export?format=pdf&token={embed_token}"
curl -O "http://localhost:8000/api/v1/artifacts/{artifact_id}/export?format=xlsx&token={embed_token}"
curl -O "http://localhost:8000/api/v1/artifacts/{artifact_id}/export?format=pptx&token={embed_token}"`}
              </pre>
            </div>
          )}

          {/* Tab 4: Security & Tokens */}
          {activeArtifactTab === 'security' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: 'rgba(239, 68, 68, 0.08)', borderLeft: '3px solid var(--accent-rose)', padding: '12px 16px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                <h4 style={{ fontSize: '0.92rem', fontWeight: '600', color: 'var(--text-main)', marginBottom: '4px' }}>
                  🔒 Production Security Pattern: Protecting Master API Keys
                </h4>
                <p style={{ fontSize: '0.84rem', color: 'var(--text-sub)', lineHeight: '1.5' }}>
                  Never expose your master tenant key (<code>sk_mgr_...</code>) in customer browsers. Instead, your backend proxies the chat request to AI Skill Engine and forwards only the signed, time-bounded <strong>HMAC embed token</strong> to the end user.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                <div style={{ background: 'var(--bg-input)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <ShieldCheck size={16} color="var(--primary-emerald)" />
                    <span style={{ fontWeight: 650, fontSize: '0.86rem', color: 'var(--text-main)' }}>Tamper-Proof HMAC Signatures</span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                    Tokens are signed using HMAC-SHA256 with an ephemeral expiry (default: 30 minutes). End users cannot manipulate or access artifacts belonging to other tenants.
                  </p>
                </div>

                <div style={{ background: 'var(--bg-input)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <Zap size={16} color="var(--accent-amber)" />
                    <span style={{ fontWeight: 650, fontSize: '0.86rem', color: 'var(--text-main)' }}>Silent Background Token Refresh</span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                    The Canvas iframe silently calls <code>POST /api/v1/artifacts/{'{id}'}/refresh-token</code> every 22 minutes, ensuring seamless editing sessions that never time out.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
