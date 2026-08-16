import React, { useState } from 'react';
import { BookOpen, Key, Terminal, Code, Check, Copy, Zap, Cpu, Server, ShieldCheck, Activity, Layers, Globe } from 'lucide-react';

export default function ApiDocs() {
  const [activeLang, setActiveLang] = useState('curl');
  const [activeMode, setActiveMode] = useState('stream');
  const [activeType, setActiveType] = useState('standard');
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
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
      {/* Header Banner */}
      <div className="glass-box" style={{ padding: '24px' }}>
        <h2 style={{ fontSize: '1.35rem', fontWeight: '700', color: '#fff', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <BookOpen size={24} color="var(--primary-cyan)" /> Unified Enterprise API Documentation
        </h2>
        <p style={{ color: 'var(--text-sub)', fontSize: '0.92rem', marginTop: '6px', lineHeight: '1.6' }}>
          `AI Skill Engine` acts as an MCP Client and Security Gateway. It connects to multiple external **MCP (Model Context Protocol) Servers** (Filesystem, Memory, Postgres DB, GitHub, etc.), auto-discovers their tools, and executes them safely when requested by your LLM.
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '10px', lineHeight: '1.5', background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: '8px', borderLeft: '3px solid var(--primary-cyan)' }}>
          <strong>Authentication Guide:</strong> Authenticate requests using standard HTTP Bearer token format with <code>Authorization: Bearer YOUR_TENANT_API_KEY</code>.
        </p>

        <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
          <div className="badge-tag tag-docker"><ShieldCheck size={14} /> Multi-Tenant API Key Auth</div>
          <div className="badge-tag tag-process"><Cpu size={14} /> Sandbox Docker & Process Drivers</div>
          <div className="badge-tag tag-http"><Globe size={14} /> Unified OpenAI Stream & Sync API</div>
          <div className="badge-tag tag-shell"><Layers size={14} /> Multi-MCP Client Connector</div>
        </div>
      </div>

      {/* Primary Unified Endpoint Card */}
      <div className="glass-box" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: 'var(--accent-emerald)', padding: '6px 12px', borderRadius: '8px', fontWeight: '700', fontSize: '0.88rem' }}>POST</span>
            <code style={{ fontSize: '1.15rem', fontWeight: '700', color: '#fff' }}>/api/v1/chat/completions</code>
          </div>

          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
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
            </div>

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
            ? activeType === 'prochat'
              ? 'Emits token-by-token OpenAI chunk events. When using a ProChat Generative UI model, it yields delta.content for text, delta.json for the parsed UI schema, and delta.code for the component code as they stream.'
              : 'Emits token-by-token OpenAI chunk events (chat.completion.chunk). Includes live reasoning steps (delta.reasoning), tool invocation calls (delta.tool_call), and sandbox execution outputs (delta.tool_result) as the model thinks.'
            : activeType === 'prochat'
              ? 'Returns a complete synchronous JSON response containing the final text message, prochat UI configuration JSON, and the React component code inside choices[0].message.'
              : 'Returns a complete synchronous JSON response containing the final message object, tenant information, and executed_tools audit log array.'}
        </p>

        {/* Language Switcher Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
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
            {copiedSection === 'unified' ? <Check size={14} color="var(--accent-emerald)" /> : <Copy size={14} />} Copy Code
          </button>
        </div>

        <pre className="code-display" style={{ maxHeight: '350px' }}>
          {codeSnippets[activeType][activeMode][activeLang]}
        </pre>
      </div>

      {/* Management Endpoints */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
        {/* MCP Connector */}
        <div className="glass-box" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <span style={{ background: 'rgba(168, 85, 247, 0.2)', color: 'var(--primary-purple)', padding: '4px 8px', borderRadius: '6px', fontWeight: '700', fontSize: '0.78rem' }}>GET / POST</span>
            <code style={{ fontSize: '0.92rem', fontWeight: '600', color: '#fff' }}>/api/v1/mcp_servers</code>
          </div>
          <p style={{ color: 'var(--text-sub)', fontSize: '0.86rem', lineHeight: '1.5' }}>
            Connect to external stdio or HTTP/SSE MCP servers and discover their tools.
          </p>
        </div>

        {/* Skills Discovery */}
        <div className="glass-box" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <span style={{ background: 'rgba(56, 189, 248, 0.2)', color: 'var(--primary-blue)', padding: '4px 8px', borderRadius: '6px', fontWeight: '700', fontSize: '0.78rem' }}>GET</span>
            <code style={{ fontSize: '0.92rem', fontWeight: '600', color: '#fff' }}>/api/v1/skills</code>
          </div>
          <p style={{ color: 'var(--text-sub)', fontSize: '0.86rem', lineHeight: '1.5' }}>
            Returns active skills, tool counts, and compiled OpenAI function schemas.
          </p>
        </div>

        {/* Audit Logs */}
        <div className="glass-box" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <span style={{ background: 'rgba(56, 189, 248, 0.2)', color: 'var(--primary-blue)', padding: '4px 8px', borderRadius: '6px', fontWeight: '700', fontSize: '0.78rem' }}>GET</span>
            <code style={{ fontSize: '0.92rem', fontWeight: '600', color: '#fff' }}>/api/v1/logs</code>
          </div>
          <p style={{ color: 'var(--text-sub)', fontSize: '0.86rem', lineHeight: '1.5' }}>
            Fetches sandbox execution logs (commands, stdout, stderr, execution duration, sandbox type).
          </p>
        </div>
      </div>
    </div>
  );
}
