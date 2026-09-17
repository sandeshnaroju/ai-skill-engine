import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen, Key, Terminal, Code, Check, Copy, Zap, Cpu, Server,
  ShieldCheck, Activity, Layers, Globe, FileText, Layout, ExternalLink,
  ArrowRight, Sparkles, Download, Lock, CheckCircle2, Sliders, Eye,
  Sun, Moon, LayoutDashboard, LogIn, Image, Video, Mic, Film, Play, Upload,
  HardDrive, Trash2
} from 'lucide-react';
import DocumentationBrowser from './DocumentationBrowser';

export default function ApiDocs({ isStandalone = false, theme: propTheme, toggleTheme: propToggleTheme, isAuthenticated }) {
  const navigate = useNavigate();
  // Self-contained theme management with parent sync & fallback
  const [internalTheme, setInternalTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('app_theme') || document.documentElement.getAttribute('data-theme') || 'dark';
    }
    return 'dark';
  });

  const currentTheme = propTheme || internalTheme;

  const handleToggleTheme = () => {
    if (propToggleTheme) {
      propToggleTheme();
    } else {
      const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
      setInternalTheme(nextTheme);
      document.documentElement.setAttribute('data-theme', nextTheme);
      localStorage.setItem('app_theme', nextTheme);
      window.dispatchEvent(new CustomEvent('app-theme-change', { detail: { theme: nextTheme } }));
    }
  };

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

    # 2. Extract real-time artifacts list (Array)
    artifacts = getattr(delta, "artifacts", None) or (delta.model_extra or {}).get("artifacts") or []
    if artifacts:
        for artifact in artifacts:
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

      // 2. Real-time Artifacts Array Detection
      if (delta.artifacts && Array.isArray(delta.artifacts)) {
        for (const artifact of delta.artifacts) {
          const { artifact_id, title, embed_url, token, artifact_type } = artifact;
          // Mount interactive Canvas iframe in your customer website drawer:
          openCanvasDrawer(embed_url, title);
        }
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

# Extract artifacts array for website embedding
artifacts = msg.get("artifacts") or response.get("artifacts") or []
for art in artifacts:
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

const artifacts = message.artifacts || data.artifacts || [];
for (const art of artifacts) {
  const { artifact_id, title, embed_url, token } = art;
  // Embed in customer web page
  renderArtifactCard({ title, embed_url });
}`,
      },
    },
    multimodal: {
      stream: {
        curl: `curl -N -X POST http://localhost:8000/api/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY" \\
  -d '{
    "messages": [
      {
        "role": "user",
        "content": [
          {"type": "text", "text": "Generate a futuristic cyberpunk skyline image and analyze the composition of this uploaded architectural sketch."},
          {
            "type": "image_url",
            "image_url": {
              "url": "https://example.com/assets/sketch_blueprint.png"
            }
          }
        ]
      }
    ],
    "model": "gemini-2.5-flash",
    "image_gen_model": "gemini-2.5-flash-image",
    "video_gen_model": "veo-3.1-generate-preview",
    "image_model": "gemini-2.5-flash",
    "audio_model": "gemini-2.5-flash",
    "video_model": "gemini-2.5-flash",
    "stream": true,
    "session_id": "multimodal_stream_session_901",
    "skill_names": ["image_and_video_generation", "multimodal_analyst"]
  }'`,
        python: `from openai import OpenAI

# Connect official OpenAI Python SDK to AI Skill Engine gateway
client = OpenAI(
    base_url="http://localhost:8000/api/v1",
    api_key="sk_mgr_YOUR_TENANT_API_KEY"
)

# Route tasks across specialized multimodal & generative sub-agents
response_stream = client.chat.completions.create(
    model="gemini-2.5-flash",  # Primary orchestrator & planner
    messages=[
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "Generate a 16:9 cinematic video of a spaceship entering warp speed and analyze this mission audio briefing."},
                {
                    "type": "image_url",
                    "image_url": {"url": "https://example.com/assets/briefing_diagram.jpg"}
                }
            ]
        }
    ],
    stream=True,
    extra_body={
        "image_gen_model": "gemini-2.5-flash-image",
        "video_gen_model": "veo-3.1-generate-preview",
        "image_model": "gemini-2.5-flash",
        "audio_model": "gemini-2.5-flash",
        "video_model": "gemini-2.5-flash",
        "session_id": "multimodal_stream_session_901",
        "skill_names": ["image_and_video_generation", "multimodal_analyst"]
    }
)

for chunk in response_stream:
    if not chunk.choices:
        continue
    delta = chunk.choices[0].delta

    # 1. Stream natural language assistant response
    if delta.content:
        print(delta.content, end="", flush=True)

    # 2. Extract live sub-agent status & reasoning logs
    reasoning = getattr(delta, "reasoning", None) or (delta.model_extra or {}).get("reasoning")
    if reasoning:
        print(f"\\n[Reasoning] {reasoning}")

    # 3. Extract sub-agent tool execution calls (e.g. generate_image, generate_video, analyze_image)
    tool_call = getattr(delta, "tool_call", None) or (delta.model_extra or {}).get("tool_call")
    if tool_call:
        print(f"\\n[Sub-Agent Tool Call] {tool_call.get('name')} with args: {tool_call.get('arguments')}")

    # 4. Extract generated media assets & sandbox execution outputs
    tool_result = getattr(delta, "tool_result", None) or (delta.model_extra or {}).get("tool_result")
    if tool_result:
        print(f"\\n[Tool Result] {tool_result.get('tool_name')} exit: {tool_result.get('exit_code')}")
        if tool_result.get("generated_files"):
            print(f"Generated Media Files: {tool_result.get('generated_files')}")
        print(f"Output: {tool_result.get('stdout')}")`,
        javascript: `const response = await fetch("http://localhost:8000/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer sk_mgr_YOUR_TENANT_API_KEY"
  },
  body: JSON.stringify({
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Generate a marketing poster image and review the uploaded product mockup." },
          { type: "image_url", image_url: { url: "https://example.com/mockup.png" } }
        ]
      }
    ],
    model: "gemini-2.5-flash", // Primary orchestrator
    image_gen_model: "gemini-2.5-flash-image", // Image generation sub-agent
    video_gen_model: "veo-3.1-generate-preview", // Video generation sub-agent
    image_model: "gemini-2.5-flash", // Vision analyst sub-agent
    audio_model: "gemini-2.5-flash", // Audio analyst sub-agent
    video_model: "gemini-2.5-flash", // Video analyst sub-agent
    stream: true,
    session_id: "multimodal_stream_session_902",
    skill_names: ["image_and_video_generation", "multimodal_analyst"]
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
    const cleanLine = line.trim();
    if (!cleanLine.startsWith("data: ")) continue;
    const rawData = cleanLine.substring(6);
    if (rawData === "[DONE]") break;

    try {
      const dataJson = JSON.parse(rawData);
      const delta = dataJson.choices?.[0]?.delta;
      if (!delta) continue;

      // 1. Text token streaming
      if (delta.content) process.stdout.write(delta.content);

      // 2. Sub-agent status & reasoning logs
      if (delta.reasoning) console.log(\`\\n[Status]: \${delta.reasoning}\`);

      // 3. Generated media outputs & file assets
      if (delta.tool_result?.generated_files?.length > 0) {
        console.log("\\n[Generated Assets]:", delta.tool_result.generated_files);
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
      {
        "role": "user",
        "content": [
          {"type": "text", "text": "Generate a 1080p photorealistic landscape image of the Swiss Alps at sunrise."},
          {"type": "image_url", "image_url": {"url": "https://example.com/reference_lighting.jpg"}}
        ]
      }
    ],
    "model": "gemini-2.5-flash",
    "image_gen_model": "gemini-2.5-flash-image",
    "video_gen_model": "veo-3.1-generate-preview",
    "image_model": "gemini-2.5-flash",
    "audio_model": "gemini-2.5-flash",
    "video_model": "gemini-2.5-flash",
    "stream": false,
    "session_id": "multimodal_sync_session_903",
    "skill_names": ["image_and_video_generation", "multimodal_analyst"]
  }'`,
        python: `import requests

url = "http://localhost:8000/api/v1/chat/completions"
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer sk_mgr_YOUR_TENANT_API_KEY"
}
payload = {
    "messages": [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "Generate a futuristic sports car render and analyze the aerodynamic curves in this sketch."},
                {"type": "image_url", "image_url": {"url": "https://example.com/sketch.png"}}
            ]
        }
    ],
    "model": "gemini-2.5-flash",
    "image_gen_model": "gemini-2.5-flash-image",
    "video_gen_model": "veo-3.1-generate-preview",
    "image_model": "gemini-2.5-flash",
    "audio_model": "gemini-2.5-flash",
    "video_model": "gemini-2.5-flash",
    "stream": False,
    "session_id": "multimodal_sync_session_904",
    "skill_names": ["image_and_video_generation", "multimodal_analyst"]
}

response = requests.post(url, headers=headers, json=payload).json()
msg = response["choices"][0]["message"]

print("Assistant Reply:", msg["content"])
print("Executed Sub-Agent Tools:", response.get("executed_tools", []))

# Access generated image/video files:
for tool in response.get("executed_tools", []):
    if tool.get("generated_files"):
        for filename in tool["generated_files"]:
            download_url = f"http://localhost:8000/api/v1/files/download/{response.get('tenant', 'default')}/{filename}"
            print(f"Generated Asset Link: {download_url}")`,
        javascript: `const response = await fetch("http://localhost:8000/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer sk_mgr_YOUR_TENANT_API_KEY"
  },
  body: JSON.stringify({
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Generate a concept art image of a cybernetic tiger." }
        ]
      }
    ],
    model: "gemini-2.5-flash",
    image_gen_model: "gemini-2.5-flash-image",
    video_gen_model: "veo-3.1-generate-preview",
    image_model: "gemini-2.5-flash",
    stream: false,
    session_id: "multimodal_sync_session_905",
    skill_names: ["image_and_video_generation"]
  })
});

const data = await response.json();
console.log("Chat Reply:", data.choices[0].message.content);
console.log("Sub-Agent Executions:", data.executed_tools);`,
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
        "artifacts": [
          {
            "artifact_id": "84419384-8e98-4b7f-bc21-8f2abe21f44c",
            "title": "Executive Modernization Plan",
            "filename": "executive_modernization_plan.md",
            "artifact_type": "document",
            "current_version": 1,
            "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJartIjoiODQ0MTkzODQtOGU5OC00YjdmLWJjMjEtOGYyYWJlMjFmNDRjIiwidGVuIjoidGVuYW50XzEwMSIsImV4cCI6MTcwMDAwMTgwMH0...",
            "embed_url": "/embed/canvas?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
          }
        ]
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
  ],
  "artifacts": [
    {
      "artifact_id": "84419384-8e98-4b7f-bc21-8f2abe21f44c",
      "title": "Executive Modernization Plan",
      "filename": "executive_modernization_plan.md",
      "artifact_type": "document",
      "current_version": 1,
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJartIjoiODQ0MTkzODQtOGU5OC00YjdmLWJjMjEtOGYyYWJlMjFmNDRjIiwidGVuIjoidGVuYW50XzEwMSIsImV4cCI6MTcwMDAwMTgwMH0...",
      "embed_url": "/embed/canvas?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  ]
}`,
      stream: `data: {"id": "chatcmpl-802", "object": "chat.completion.chunk", "created": 1700000000, "model": "gemini-2.5-flash", "choices": [{"index": 0, "delta": {"reasoning": "Invoking Create Artifact (Skill: Artifact Editor)...", "tool_call": {"name": "Create Artifact", "arguments": {"title": "Executive Modernization Plan", "artifact_type": "document", "filename": "executive_modernization_plan.md"}}}, "finish_reason": null}]}

data: {"id": "chatcmpl-802", "object": "chat.completion.chunk", "created": 1700000000, "model": "gemini-2.5-flash", "choices": [{"index": 0, "delta": {"reasoning": "Create Artifact finished in 58ms.", "tool_result": {"tool_name": "Create Artifact", "skill_name": "Artifact Editor", "exit_code": 0, "execution_time_ms": 58, "artifact_data": {"id": "84419384-8e98-4b7f-bc21-8f2abe21f44c", "title": "Executive Modernization Plan", "filename": "executive_modernization_plan.md", "artifact_type": "document", "current_version": 1, "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...", "embed_url": "/embed/canvas?token=eyJhbGci..."}}}, "finish_reason": null}]}

data: {"id": "chatcmpl-802", "object": "chat.completion.chunk", "created": 1700000000, "model": "gemini-2.5-flash", "choices": [{"index": 0, "delta": {"artifacts": [{"artifact_id": "84419384-8e98-4b7f-bc21-8f2abe21f44c", "title": "Executive Modernization Plan", "filename": "executive_modernization_plan.md", "artifact_type": "document", "current_version": 1, "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...", "embed_url": "/embed/canvas?token=eyJhbGci..."}]}}, "finish_reason": null}]}

data: {"id": "chatcmpl-802", "object": "chat.completion.chunk", "created": 1700000000, "model": "gemini-2.5-flash", "choices": [{"index": 0, "delta": {"content": "I have created the Executive Modernization Plan in Canvas. You can view, co-edit, or export the document directly."}, "finish_reason": null}]}

data: {"type": "done", "request_id": "req_993e7f22a", "tools_called": 1, "artifacts": [{"artifact_id": "84419384-8e98-4b7f-bc21-8f2abe21f44c", "title": "Executive Modernization Plan", "filename": "executive_modernization_plan.md", "artifact_type": "document", "current_version": 1, "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...", "embed_url": "/embed/canvas?token=eyJhbGci..."}]}

data: [DONE]`
    },
    multimodal: {
      sync: `{
  "id": "chatcmpl-multimodal_session_903",
  "request_id": "req_f4a91b23c",
  "object": "chat.completion",
  "created": 1700000000,
  "model": "gemini-2.5-flash",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "I have analyzed your reference sketch and generated the 1080p high-resolution concept image of the Swiss Alps at sunrise.\\n\\n**Generated Asset:** [Download Image](/api/v1/files/download/acme_corp/generated_image_1700000012.png)\\n\\n**Visual Analysis:** The lighting composition matches the golden hour gradient with dramatic mountain ridge reflections.",
        "json": null,
        "code": null
      },
      "finish_reason": "stop"
    }
  ],
  "executed_tools": [
    {
      "tool_name": "generate_image",
      "skill_name": "image_and_video_generation",
      "exit_code": 0,
      "execution_time_ms": 1840,
      "generated_files": ["generated_image_1700000012.png"],
      "stdout": "Image successfully generated with model gemini-2.5-flash-image and saved to sandbox/outputs/acme_corp/generated_image_1700000012.png"
    },
    {
      "tool_name": "analyze_image",
      "skill_name": "multimodal_analyst",
      "exit_code": 0,
      "execution_time_ms": 720,
      "generated_files": [],
      "stdout": "Visual Analysis complete: Lighting vector (45 deg east), High dynamic range terrain features."
    }
  ]
}`,
      stream: `data: {"id": "chatcmpl-901", "object": "chat.completion.chunk", "created": 1700000000, "model": "gemini-2.5-flash", "choices": [{"index": 0, "delta": {"reasoning": "Delegating vision inspection to Vision Analyst sub-agent (Model: gemini-2.5-flash)...", "tool_call": {"name": "Analyze Image", "arguments": {"image_url": "https://example.com/assets/sketch_blueprint.png"}}}, "finish_reason": null}]}

data: {"id": "chatcmpl-901", "object": "chat.completion.chunk", "created": 1700000000, "model": "gemini-2.5-flash", "choices": [{"index": 0, "delta": {"reasoning": "Analyze Image finished in 720ms.", "tool_result": {"tool_name": "Analyze Image", "skill_name": "Multimodal Analyst", "exit_code": 0, "execution_time_ms": 720, "stdout": "Blueprint contains 4 architectural zones with neon grid patterns."}}, "finish_reason": null}]}

data: {"id": "chatcmpl-901", "object": "chat.completion.chunk", "created": 1700000000, "model": "gemini-2.5-flash", "choices": [{"index": 0, "delta": {"reasoning": "Delegating image generation to Image Sub-Agent (Model: gemini-2.5-flash-image)...", "tool_call": {"name": "Generate Image", "arguments": {"prompt": "Futuristic cyberpunk skyline, 16:9, cybernetic architecture", "aspect_ratio": "16:9"}}}, "finish_reason": null}]}

data: {"id": "chatcmpl-901", "object": "chat.completion.chunk", "created": 1700000000, "model": "gemini-2.5-flash", "choices": [{"index": 0, "delta": {"reasoning": "Generate Image completed in 1840ms.", "tool_result": {"tool_name": "Generate Image", "skill_name": "Image and Video Generation", "exit_code": 0, "execution_time_ms": 1840, "generated_files": ["generated_image_1700000012.png"], "stdout": "Image saved to sandbox/outputs/acme_corp/generated_image_1700000012.png"}}, "finish_reason": null}]}

data: {"id": "chatcmpl-901", "object": "chat.completion.chunk", "created": 1700000000, "model": "gemini-2.5-flash", "choices": [{"index": 0, "delta": {"content": "I have created the cyberpunk skyline concept visual and analyzed your architectural sketch.\\n\\n**Generated Asset:** [Download Image](/api/v1/files/download/acme_corp/generated_image_1700000012.png)"}, "finish_reason": null}]}

data: {"type": "done", "request_id": "req_f4a91b23c", "tools_called": 2}

data: [DONE]`
    }
  };

  const content = (
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

          <button
            onClick={() => setActiveSection('guides')}
            className={activeSection === 'guides' ? 'btn-gradient' : 'btn-outline'}
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
            <BookOpen size={18} />
            <span>3. Complete Knowledge Base &amp; Guides</span>
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
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Model Type:</span>
                  <button
                    className={activeType === 'standard' ? 'btn-gradient' : 'btn-outline'}
                    onClick={() => setActiveType('standard')}
                    style={{ padding: '5px 12px', fontSize: '0.8rem' }}
                  >
                    Standard Model
                  </button>
                  <button
                    className={activeType === 'multimodal' ? 'btn-gradient' : 'btn-outline'}
                    onClick={() => setActiveType('multimodal')}
                    style={{ padding: '5px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Sparkles size={14} color="var(--primary-cyan)" /> Multimodal Sub-Agents
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
                ? activeType === 'multimodal'
                  ? 'Emits token-by-token OpenAI chunk events while delegating specialized image/video generation and vision/audio/video analysis to sub-agent models (image_gen_model, video_gen_model, image_model, audio_model, video_model). Yields live sub-agent reasoning steps, tool calls, and generated asset links in real time.'
                  : activeType === 'artifacts'
                    ? 'Emits token-by-token OpenAI chunk events along with real-time delta.artifacts array payloads. Clients receive an array of artifact objects containing the artifact ID, format, cryptographic HMAC token, and embed URL to mount interactive Document Canvases directly in their web apps.'
                    : activeType === 'prochat'
                      ? 'Emits token-by-token OpenAI chunk events. When using a ProChat Generative UI model, it yields delta.content for text, delta.json for the parsed UI schema, and delta.code for the component code as they stream.'
                      : 'Emits token-by-token OpenAI chunk events (chat.completion.chunk). Includes live reasoning steps (delta.reasoning), tool invocation calls (delta.tool_call), and sandbox execution outputs (delta.tool_result) as the model thinks.'
                : activeType === 'multimodal'
                  ? 'Returns a complete synchronous JSON response containing the assistant text reply, executed sub-agent tools audit log, and sandbox file paths for all generated media assets.'
                  : activeType === 'artifacts'
                    ? 'Returns a complete synchronous JSON response containing the assistant text message and the full choices[0].message.artifacts array (and top-level artifacts array) with title, block count, token, and ready-to-embed Canvas URL.'
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

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* MULTIMODAL & GENERATIVE SUB-AGENTS ARCHITECTURAL GUIDE             */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <div className="glass-box" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Sparkles size={22} color="var(--primary-cyan)" /> Multimodal &amp; Sub-Agent Routing Architecture
                </h3>
                <p style={{ color: 'var(--text-sub)', fontSize: '0.9rem', marginTop: '6px', lineHeight: '1.6' }}>
                  AI Skill Engine introduces <strong>Sub-Agent Modality Routing</strong>. Rather than forcing a single model to do everything, the engine routes image generation, video generation, vision analysis, audio comprehension, and video reasoning to specialized sub-agents with dedicated models.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span className="badge-tag tag-process" style={{ fontSize: '0.75rem' }}><Image size={13} /> Image Gen</span>
                <span className="badge-tag tag-docker" style={{ fontSize: '0.75rem' }}><Video size={13} /> Video Gen</span>
                <span className="badge-tag tag-http" style={{ fontSize: '0.75rem' }}><Eye size={13} /> Vision Analyst</span>
                <span className="badge-tag tag-shell" style={{ fontSize: '0.75rem' }}><Mic size={13} /> Audio &amp; Video Analyst</span>
              </div>
            </div>

            {/* Parameter Reference Table */}
            <div style={{ background: 'var(--bg-input)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sliders size={16} color="var(--primary-violet)" /> Request Parameters for Modality &amp; Sub-Agent Routing
              </h4>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-sub)', marginBottom: '12px', lineHeight: '1.5' }}>
                Pass these fields in the root JSON request body (or inside <code>extra_body</code> when using the official OpenAI Python/Node SDKs):
              </p>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '8px 10px' }}>Parameter</th>
                      <th style={{ padding: '8px 10px' }}>Target Modality / Sub-Agent</th>
                      <th style={{ padding: '8px 10px' }}>Skill / Tool Executed</th>
                      <th style={{ padding: '8px 10px' }}>Example Compatible Models</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '8px 10px', color: 'var(--primary-cyan)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>model</td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-main)' }}>Primary Orchestrator &amp; Logical Planner</td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-sub)' }}>Main conversation, intent reasoning &amp; sub-agent dispatch</td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}><code>gemini-2.5-flash</code>, <code>gpt-4o</code>, <code>claude-3-5-sonnet</code></td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '8px 10px', color: 'var(--primary-violet)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>image_gen_model</td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-main)' }}>AI Image Generation Sub-Agent</td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-sub)' }}><code>image_and_video_generation</code> (<code>generate_image</code>)</td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}><code>gemini-2.5-flash-image</code>, <code>dall-e-3</code>, <code>imagen-3.0</code></td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '8px 10px', color: 'var(--accent-emerald)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>video_gen_model</td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-main)' }}>AI Video Generation Sub-Agent</td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-sub)' }}><code>image_and_video_generation</code> (<code>generate_video</code>)</td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}><code>veo-3.1-generate-preview</code>, <code>veo-3.1-fast-generate-preview</code></td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '8px 10px', color: 'var(--primary-indigo)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>image_model</td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-main)' }}>Vision Analyst Sub-Agent</td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-sub)' }}><code>multimodal_analyst</code> (<code>analyze_image</code>)</td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}><code>gemini-2.5-flash</code>, <code>gpt-4o</code>, <code>claude-3-5-sonnet</code></td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '8px 10px', color: 'var(--accent-amber)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>audio_model</td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-main)' }}>Audio Analyst Sub-Agent</td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-sub)' }}><code>multimodal_analyst</code> (<code>analyze_audio</code>)</td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}><code>gemini-2.5-flash</code>, <code>gemini-2.5-pro</code></td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '8px 10px', color: 'var(--accent-rose)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>video_model</td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-main)' }}>Video Frame &amp; Timeline Analyst</td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-sub)' }}><code>multimodal_analyst</code> (<code>analyze_video</code>)</td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}><code>gemini-2.5-flash</code>, <code>gemini-2.5-pro</code></td>
                    </tr>
                    <tr>
                      <td style={{ padding: '8px 10px', color: 'var(--primary-purple)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>prochat_model</td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-main)' }}>Generative UI Sub-Agent</td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-sub)' }}>ProChat Dynamic React &amp; JSON generation</td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}><code>genui-mars-0.1</code>, <code>gemini-2.5-flash</code></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Multimodal Inputs & File Handling Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
              {/* Card 1: Passing Multimodal Inputs */}
              <div style={{ background: 'var(--bg-input)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
                <h5 style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Eye size={16} color="var(--primary-cyan)" /> 1. Passing Images &amp; Multimodal Payloads
                </h5>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-sub)', lineHeight: '1.5', marginBottom: '10px' }}>
                  Send multimodal content inside standard OpenAI-format <code>messages[].content</code> arrays or upload files directly:
                </p>
                <pre style={{ margin: 0, fontSize: '0.74rem', background: 'var(--bg-dark)', padding: '10px', borderRadius: '6px', color: 'var(--text-main)', fontFamily: 'var(--font-mono)', lineHeight: '1.4' }}>
{`"content": [
  { "type": "text", "text": "Analyze this architecture" },
  {
    "type": "image_url",
    "image_url": {
      "url": "https://example.com/blueprint.png"
    }
  }
]`}
                </pre>
              </div>

              {/* Card 2: REST File Upload API & Session Tracking */}
              <div style={{ background: 'var(--bg-input)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
                <h5 style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Upload size={16} color="var(--accent-emerald)" /> 2. Uploading Files Tied to Chat Sessions
                </h5>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-sub)', lineHeight: '1.5', marginBottom: '10px' }}>
                  Upload documents, spreadsheets, images, or media files with a <code>session_id</code>. Files automatically stream to your configured storage (Azure Blob, AWS S3, or Local Disk) and are tracked:
                </p>
                <pre style={{ margin: 0, fontSize: '0.74rem', background: 'var(--bg-dark)', padding: '10px', borderRadius: '6px', color: 'var(--text-main)', fontFamily: 'var(--font-mono)', lineHeight: '1.4' }}>
{`curl -X POST http://localhost:8000/api/v1/files/upload \\
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY" \\
  -F "file=@financial_report.xlsx" \\
  -F "session_id=user_chat_thread_101" \\
  -F "origin=external_api"

# Response:
# {
#   "status": "success",
#   "id": "file_uuid_456",
#   "filename": "uuid_financial_report.xlsx",
#   "url": "https://<storage>/...",
#   "session_id": "user_chat_thread_101"
# }`}
                </pre>
              </div>

              {/* Card 3: Generated Media Retrieval & URLs */}
              <div style={{ background: 'var(--bg-input)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-subtle)', gridColumn: '1 / -1' }}>
                <h5 style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Download size={16} color="var(--primary-violet)" /> 3. Generated Media Assets &amp; Tenant Isolation Paths
                </h5>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-sub)', lineHeight: '1.6', marginBottom: '8px' }}>
                  Generated images and videos are securely written to isolated per-tenant sandbox folders (<code>sandbox/outputs/&lt;tenant_name&gt;/&lt;filename&gt;</code>) and can be accessed or embedded directly:
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px' }}>
                  <div style={{ background: 'var(--bg-dark)', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                    <span style={{ fontSize: '0.74rem', color: 'var(--primary-cyan)', fontWeight: 700, display: 'block' }}>Direct Download / Stream URL:</span>
                    <code style={{ fontSize: '0.78rem', color: 'var(--text-main)' }}>GET /api/v1/files/download/{'{tenant_name}'}/{'{filename}'}</code>
                  </div>
                  <div style={{ background: 'var(--bg-dark)', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                    <span style={{ fontSize: '0.74rem', color: 'var(--accent-emerald)', fontWeight: 700, display: 'block' }}>Frontend Embedding:</span>
                    <code style={{ fontSize: '0.78rem', color: 'var(--text-main)' }}>&lt;img src="/api/v1/files/download/tenant/generated.png" /&gt;</code>
                  </div>
                </div>
              </div>
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

            {/* Session Files Lifecycle & Purge APIs */}
            <div className="glass-box" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <span style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', padding: '4px 8px', borderRadius: '6px', fontWeight: '700', fontSize: '0.78rem' }}>GET / DELETE</span>
                <code style={{ fontSize: '0.92rem', fontWeight: '600', color: 'var(--text-main)' }}>/api/v1/files/session/{'{id}'}</code>
              </div>
              <p style={{ color: 'var(--text-sub)', fontSize: '0.86rem', lineHeight: '1.5' }}>
                List and purge files across cloud storage (Azure Blob, AWS S3, Local) tied to chat threads when deleted by end users.
              </p>
            </div>
          </div>

          {/* Business Backend: Session Storage & Cloud Files Lifecycle Deep Dive */}
          <div className="glass-box" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', border: '1px solid rgba(139, 92, 246, 0.25)' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <HardDrive size={20} color="var(--primary-violet)" />
                <h4 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)', margin: 0 }}>
                  Business Backend Guide: Managing &amp; Purging Session Storage Files
                </h4>
              </div>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-sub)', lineHeight: '1.6', margin: 0 }}>
                When your business application calls the AI Skill Engine with user sessions, files uploaded by users or generated during tool execution (e.g. Python matplotlib charts, generated reports, CSV exports) are automatically tracked under that <code>session_id</code> and stored in your configured cloud storage (Azure Blob container, AWS S3 bucket, or Local Disk). When a user deletes a chat thread in your CRM, SaaS app, or customer portal, your backend should invoke these lifecycle APIs to permanently clean up cloud assets.
              </p>
            </div>

            {/* Endpoint 1: List Files for a Session */}
            <div style={{ background: 'var(--bg-input)', padding: '16px 20px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6', padding: '4px 8px', borderRadius: '6px', fontWeight: '700', fontSize: '0.78rem' }}>GET</span>
                  <code style={{ fontSize: '0.90rem', fontWeight: '600', color: 'var(--text-main)' }}>/api/v1/files/session/{'{session_id}'}</code>
                </div>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Query params: <code>source</code> (upload | tool_generated), <code>origin</code></span>
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-sub)', lineHeight: '1.5', marginBottom: '10px' }}>
                Retrieves metadata and storage download URLs for all files associated with a specific chat thread or session.
              </p>
              <pre style={{ margin: 0, fontSize: '0.74rem', background: 'var(--bg-dark)', padding: '12px', borderRadius: '6px', color: 'var(--text-main)', fontFamily: 'var(--font-mono)', lineHeight: '1.4' }}>
{`curl -X GET "http://localhost:8000/api/v1/files/session/user_chat_thread_101" \\
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY"

# Response:
{
  "session_id": "user_chat_thread_101",
  "total": 2,
  "files": [
    {
      "id": "7fa3b210-9c1a-45d2-b34e-01a2b3c4d5e6",
      "filename": "f8a9c2_financial_report.xlsx",
      "original_name": "financial_report.xlsx",
      "storage_provider": "azure",
      "url": "https://mystorage.blob.core.windows.net/sessions/f8a9c2_financial_report.xlsx?sv=...",
      "file_size": 24576,
      "source": "user_upload",
      "origin": "external_api",
      "created_at": "2026-09-17T12:00:00Z"
    }
  ]
}`}
              </pre>
            </div>

            {/* Endpoint 2: Purge Entire Session Storage (Cascade Delete) */}
            <div style={{ background: 'var(--bg-input)', padding: '16px 20px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', padding: '4px 8px', borderRadius: '6px', fontWeight: '700', fontSize: '0.78rem' }}>DELETE</span>
                  <code style={{ fontSize: '0.90rem', fontWeight: '600', color: 'var(--text-main)' }}>/api/v1/files/session/{'{session_id}'}</code>
                </div>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Cascade purges cloud storage blobs + DB records</span>
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-sub)', lineHeight: '1.5', marginBottom: '10px' }}>
                Permanently deletes all storage blobs from your active cloud backend (Azure Blob Storage, AWS S3, or Local Disk), clears local execution sandbox caches, and removes database records for that chat session.
              </p>
              <pre style={{ margin: 0, fontSize: '0.74rem', background: 'var(--bg-dark)', padding: '12px', borderRadius: '6px', color: 'var(--text-main)', fontFamily: 'var(--font-mono)', lineHeight: '1.4' }}>
{`curl -X DELETE "http://localhost:8000/api/v1/files/session/user_chat_thread_101" \\
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY"

# Response:
{
  "status": "success",
  "session_id": "user_chat_thread_101",
  "storage_provider": "azure",
  "deleted_count": 2,
  "deleted_files": [
    "f8a9c2_financial_report.xlsx",
    "d4e5f6_quarterly_chart.png"
  ]
}`}
              </pre>
            </div>

            {/* Endpoint 3: Delete a Single File */}
            <div style={{ background: 'var(--bg-input)', padding: '16px 20px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', padding: '4px 8px', borderRadius: '6px', fontWeight: '700', fontSize: '0.78rem' }}>DELETE</span>
                  <code style={{ fontSize: '0.90rem', fontWeight: '600', color: 'var(--text-main)' }}>/api/v1/files/{'{file_id}'}</code>
                </div>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Single file permanent deletion</span>
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-sub)', lineHeight: '1.5', marginBottom: '10px' }}>
                Permanently deletes an individual file from cloud storage and DB by its unique ID.
              </p>
              <pre style={{ margin: 0, fontSize: '0.74rem', background: 'var(--bg-dark)', padding: '12px', borderRadius: '6px', color: 'var(--text-main)', fontFamily: 'var(--font-mono)', lineHeight: '1.4' }}>
{`curl -X DELETE "http://localhost:8000/api/v1/files/7fa3b210-9c1a-45d2-b34e-01a2b3c4d5e6" \\
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY"

# Response:
{
  "status": "success",
  "deleted_file": "f8a9c2_financial_report.xlsx",
  "id": "7fa3b210-9c1a-45d2-b34e-01a2b3c4d5e6"
}`}
              </pre>
            </div>

            {/* Automatic Session Thread Purge Integration */}
            <div style={{ padding: '14px 18px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
              <div style={{ fontWeight: '700', fontSize: '0.86rem', color: 'var(--primary-emerald)', marginBottom: '4px' }}>
                💡 Automated Cascading Deletion with Session API:
              </div>
              <p style={{ fontSize: '0.80rem', color: 'var(--text-sub)', margin: 0, lineHeight: '1.5' }}>
                If you already call <code>DELETE /api/v1/sessions/{'{session_id}'}</code> to clear chat history threads, cloud storage files associated with that session are <strong>automatically purged simultaneously</strong> in the same transaction!
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
                },
                {
                  id: 'uploaded_files',
                  step: '05',
                  label: 'Uploaded File Canvas',
                  sub: 'Open Word, Excel, PPTX, CAD',
                  icon: <Download size={18} />,
                  accent: 'var(--primary-cyan)'
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
                  When your users prompt the LLM to create or modify a document, code script, or presentation, AI Skill Engine includes a structured <code>artifacts</code> array in the response (available in <code>delta.artifacts</code> during streaming, or <code>message.artifacts</code> and top-level <code>response.artifacts</code> in synchronous responses). You only need to read this list and store it in your application state.
                </p>

                {/* Exact JSON Payload Inspection */}
                <div style={{ marginTop: '12px', background: 'var(--bg-input)', padding: '12px 14px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--primary-purple)', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                    Artifacts Array Schema (Available in <code>delta.artifacts</code> or <code>message.artifacts</code>):
                  </span>
                  <pre style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-main)', fontFamily: 'var(--font-mono)', lineHeight: '1.5' }}>
                    {`[
  {
    "artifact_id": "84419384-8e98-4b7f-bc21-8f2abe21f44c", // Unique UUID of the artifact
    "title": "Application for Leave of Absence",         // Human-readable title
    "filename": "leave_application.md",                 // File name & format extension
    "artifact_type": "document",                        // 'document' | 'code' | 'spreadsheet' | 'presentation' | 'svg'
    "current_version": 1,                               // Version counter (increments on every edit)
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",  // Ephemeral HMAC security token
    "embed_url": "/embed/canvas?token=eyJhbGci..."      // Pre-signed iframe path ready to mount
  }
]`}
                  </pre>
                </div>

                <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' }}>
                  <div style={{ background: 'var(--bg-input)', padding: '12px 14px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--primary-indigo)', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                      Method A: Streaming (stream: true)
                    </span>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0, lineHeight: '1.5' }}>
                      In SSE chunks, inspect <code>chunk.choices[0].delta.artifacts</code> (array). When present, iterate over the list and attach each artifact to your chat state.
                    </p>
                  </div>
                  <div style={{ background: 'var(--bg-input)', padding: '12px 14px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--accent-emerald)', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                      Method B: Synchronous (stream: false)
                    </span>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0, lineHeight: '1.5' }}>
                      In the JSON response, inspect <code>response.choices[0].message.artifacts</code> (or top-level <code>response.artifacts</code>). It is directly accessible as an array of artifact objects.
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
                        <td style={{ padding: '8px 10px' }}>window.postMessage (Host ➔ Iframe)</td>
                        <td style={{ padding: '8px 10px' }}><code>{`{ type: 'THEME_CHANGE', theme: 'dark'|'light' }`}</code></td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-sub)' }}>
                          Sent to the iframe window to dynamically update theme without reloading.
                        </td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '8px 10px', color: 'var(--primary-indigo)', fontFamily: 'var(--font-mono)' }}>CANVAS_FULLSCREEN_CHANGE</td>
                        <td style={{ padding: '8px 10px' }}>window.postMessage (Iframe ➔ Host)</td>
                        <td style={{ padding: '8px 10px' }}><code>{`{ type: 'CANVAS_FULLSCREEN_CHANGE', isFullscreen: boolean }`}</code></td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-sub)' }}>
                          Emitted when the user toggles Fullscreen or presses Esc. Allows the host page to expand the iframe across the page DOM.
                        </td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '8px 10px', color: 'var(--primary-indigo)', fontFamily: 'var(--font-mono)' }}>CANVAS_CLOSE</td>
                        <td style={{ padding: '8px 10px' }}>window.postMessage (Iframe ➔ Host)</td>
                        <td style={{ padding: '8px 10px' }}><code>{`{ type: 'CANVAS_CLOSE', artifactId: string }`}</code></td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-sub)' }}>
                          Emitted when the user clicks the close <strong>(X)</strong> button in the Canvas header. Allows the host page to close the drawer, modal, or unmount the iframe.
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
                  onClick={() => copyCode(`<!-- HTML Iframe Embed Example with DOM Fullscreen & Close -->
<iframe
  id="canvas-frame"
  src="https://api.yourdomain.com\${artifact.embed_url}&theme=dark"
  style="width: 100%; height: 100%; border: none; transition: all 0.2s ease;"
  title="Document Canvas"
  allow="clipboard-write"
></iframe>

<script>
  // Listen for Canvas events (DOM Fullscreen, Close, etc.)
  window.addEventListener("message", (e) => {
    const iframe = document.getElementById("canvas-frame");
    if (!iframe) return;

    // 1. Close button clicked inside Canvas header
    if (e.data?.type === "CANVAS_CLOSE") {
      iframe.style.display = "none";
      // or close your drawer/modal in your host framework
    }

    // 2. Expand iframe across DOM when Canvas fullscreen button is clicked
    if (e.data?.type === "CANVAS_FULLSCREEN_CHANGE") {
      if (e.data.isFullscreen) {
        iframe.style.position = "fixed";
        iframe.style.top = "0";
        iframe.style.left = "0";
        iframe.style.width = "100vw";
        iframe.style.height = "100vh";
        iframe.style.zIndex = "99999";
      } else {
        iframe.style.position = "static";
        iframe.style.width = "100%";
        iframe.style.height = "100%";
        iframe.style.zIndex = "auto";
      }
    }
  });

  // 3. Dynamically switch theme without reloading the iframe
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

              <pre className="code-display" style={{ maxHeight: '420px' }}>
                {`<!-- 1. Mount iframe with full URL + theme query parameter -->
<iframe
  id="canvas-frame"
  src={\`https://api.yourdomain.com\${artifact.embed_url}&theme=\${currentTheme}\`}
  style="width: 100%; height: 100%; border: none; transition: all 0.2s ease;"
  title="Document Canvas"
  allow="clipboard-write"
/>

<!-- 2. Handle Canvas Close & DOM Fullscreen events -->
<script>
  window.addEventListener("message", (e) => {
    const iframe = document.getElementById("canvas-frame");
    if (!iframe) return;

    // Handle user clicking the (X) Close button inside Canvas
    if (e.data?.type === "CANVAS_CLOSE") {
      iframe.style.display = "none"; // or close your drawer/modal
    }

    // Handle user clicking the Fullscreen button or pressing Esc
    if (e.data?.type === "CANVAS_FULLSCREEN_CHANGE") {
      if (e.data.isFullscreen) {
        iframe.style.position = "fixed";
        iframe.style.top = "0";
        iframe.style.left = "0";
        iframe.style.width = "100vw";
        iframe.style.height = "100vh";
        iframe.style.zIndex = "99999";
      } else {
        iframe.style.position = "static";
        iframe.style.width = "100%";
        iframe.style.height = "100%";
        iframe.style.zIndex = "auto";
      }
    }
  });

  // (Optional) Switch theme dynamically via postMessage
  function setCanvasTheme(theme) {
    const iframe = document.getElementById("canvas-frame");
    iframe?.contentWindow?.postMessage({ type: "THEME_CHANGE", theme }, "*");
  }
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
curl -O "http://localhost:8000/api/v1/artifacts/{artifact_id}/export?format=pptx&token={embed_token}"

# ═══════════════════════════════════════════════════════════════════════
# 6. DELETE ALL ARTIFACTS FOR A SESSION (Business Backend API)
# Deletes all artifacts, blocks, and commits belonging to a session
# ═══════════════════════════════════════════════════════════════════════
curl -X DELETE "http://localhost:8000/api/v1/artifacts/session/{session_id}" \\
  -H "X-API-Key: {TENANT_API_KEY}"`}
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
                    The Canvas iframe silently calls <code>POST /api/v1/artifacts/{'{id}'}/refresh-token</code> every 22 minutes, ensuring active editing sessions never time out.
                  </p>
                </div>

                <div style={{ background: 'var(--bg-input)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-subtle)', gridColumn: '1 / -1' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <ShieldCheck size={16} color="var(--primary-cyan)" />
                    <span style={{ fontWeight: 650, fontSize: '0.86rem', color: 'var(--text-main)' }}>Expired Token & Historical Chat Renewal Flow</span>
                  </div>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-sub)', lineHeight: '1.6', marginBottom: '10px' }}>
                    When users browse older chat sessions, their stream embed tokens may already be expired. Rather than exposing master tenant keys to the frontend, your <strong>business backend</strong> requests a fresh embed token on demand and supplies it to the client:
                  </p>
                  <pre style={{
                    background: 'var(--bg-dark)',
                    border: '1px solid var(--border-subtle)',
                    padding: '12px',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    color: 'var(--text-main)',
                    overflowX: 'auto',
                    fontFamily: 'monospace',
                    lineHeight: '1.5'
                  }}>
{`# 1. Frontend detects expired token (or user clicks an old artifact) -> calls YOUR backend
# 2. Your backend requests a fresh token from AI Skill Engine with master key:
curl -X POST "http://localhost:8000/api/v1/artifacts/{artifact_id}/embed-token?expires_in_minutes=60" \\
  -H "X-API-Key: {TENANT_API_KEY}"

# Response:
{
  "token": "eyJhbGciOi...",
  "expires_in_seconds": 3600,
  "artifact_id": "{artifact_id}",
  "embed_url": "/embed/canvas?token=eyJhbGciOi..."
}

# 3. Your backend forwards only this fresh "token" or "embed_url" to your frontend client.`}
                  </pre>
                </div>

                <div style={{ background: 'var(--bg-input)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-subtle)', gridColumn: '1 / -1' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <Zap size={16} color="var(--primary-violet)" />
                    <span style={{ fontWeight: 650, fontSize: '0.86rem', color: 'var(--text-main)' }}>Client-Side Expiration Check (JavaScript / React)</span>
                  </div>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-sub)', lineHeight: '1.6', marginBottom: '10px' }}>
                    Embed tokens are signed two-part URL-safe tokens (<code>payload.signature</code>). You can verify if a token is expired directly in your frontend without making any network requests:
                  </p>
                  <pre style={{
                    background: 'var(--bg-dark)',
                    border: '1px solid var(--border-subtle)',
                    padding: '12px',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    color: 'var(--text-main)',
                    overflowX: 'auto',
                    fontFamily: 'monospace',
                    lineHeight: '1.5'
                  }}>
{`// Decode embed token payload without external libraries
function decodeEmbedToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  try {
    const rawB64 = token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
    const padded = rawB64.padEnd(rawB64.length + ((4 - (rawB64.length % 4)) % 4), '=');
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

// Returns true if token is expired or expiring within bufferSeconds (e.g. 60s)
export function isEmbedTokenExpired(token, bufferSeconds = 0) {
  const payload = decodeEmbedToken(token);
  if (!payload || !payload.exp) return true;
  const now = Math.floor(Date.now() / 1000);
  return payload.exp <= (now + bufferSeconds);
}

// React usage example:
if (isEmbedTokenExpired(artifact.token)) {
  // Token has expired -> request fresh token from your backend before mounting iframe
  fetchFreshToken(artifact.id);
}`}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* Tab 5: Opening Uploaded Files in Canvas */}
          {activeArtifactTab === 'uploaded_files' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: 'rgba(6, 182, 212, 0.08)', borderLeft: '3px solid var(--primary-cyan)', padding: '14px 18px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <h4 style={{ fontSize: '0.96rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '6px' }}>
                  📂 Opening Existing Uploaded Files in Canvas (Skill-Driven)
                </h4>
                <p style={{ fontSize: '0.86rem', color: 'var(--text-sub)', lineHeight: '1.6' }}>
                  When chatbot users upload an existing document, spreadsheet, or presentation and ask to inspect, edit, or view it in the Canvas (e.g. <em>"open this report in canvas"</em>, <em>"edit slide 2"</em>, <em>"review this spreadsheet"</em>), the <code>artifact_editor</code> skill invokes <code>open_uploaded_file_as_artifact</code>. Files are <strong>not</strong> opened automatically upon upload; opening is <strong>intent-driven</strong> via the AI model.
                </p>
              </div>

              {/* Supported Formats Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                {[
                  { title: 'Documents & PDFs', badge: 'document / pdf', exts: '.docx, .doc, .pdf, .md, .txt', desc: 'Parses headings into surgical sections; extracts full tables and page blocks.' },
                  { title: 'Spreadsheets', badge: 'spreadsheet', exts: '.xlsx, .xls, .csv, .tsv', desc: 'Converts sheets, formulas, and cells into the Canvas interactive SheetGrid.' },
                  { title: 'Presentations', badge: 'presentation', exts: '.pptx, .ppt', desc: 'Parses slides, titles, bullet hierarchy, and speaker notes into SlidePlayer.' },
                  { title: 'Engineering & CAD', badge: 'cad_2d / cad_3d', exts: '.dxf, .dwg, .step, .stl, .obj', desc: 'Parses DXF entity layers and 3D solids for WebGL/Three.js CAD viewports.' },
                  { title: 'GIS & Industrial', badge: 'gis / engineering_data', exts: '.geojson, .kml, .l5x, .xer', desc: 'Spatial feature inspection, Rockwell PLC logic rungs, and Primavera P6 schedules.' },
                  { title: 'Code & Media', badge: 'code / audio / video', exts: '.py, .js, .ts, .mp3, .mp4', desc: 'Monaco code editor with syntax highlighting or embedded media player.' },
                ].map((f, i) => (
                  <div key={i} style={{ background: 'var(--bg-input)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontWeight: 650, fontSize: '0.84rem', color: 'var(--text-main)' }}>{f.title}</span>
                      <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(99, 102, 241, 0.15)', color: 'var(--primary-violet)', fontFamily: 'var(--font-mono)' }}>{f.badge}</span>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--primary-cyan)', fontFamily: 'var(--font-mono)', marginBottom: '4px' }}>{f.exts}</div>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0, lineHeight: '1.4' }}>{f.desc}</p>
                  </div>
                ))}
              </div>

              {/* Chat Request & Python / cURL Examples */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Conversational Prompting Flow:
                </span>
                <button
                  className="btn-outline"
                  onClick={() => copyCode(`# Step 1: User uploads a file via the standard file upload API
# POST /api/v1/files/upload -> returns {"filename": "a1b2c3..._sales_q3.xlsx", "sandbox_path": "sandbox/uploads/tenant/..."}

# Step 2: User says in chat: "Open sales_q3.xlsx in canvas so I can review it"
curl -N -X POST http://localhost:8000/api/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY" \\
  -d '{
    "messages": [
      {"role": "user", "content": "I uploaded sales_q3.xlsx. Please open it in the canvas editor."}
    ],
    "model": "gemini-2.5-flash",
    "stream": true,
    "session_id": "client_session_801",
    "skill_names": ["artifact_editor"]
  }'`, 'snippet_uploaded_file')}
                  style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                >
                  {copiedSection === 'snippet_uploaded_file' ? <Check size={14} color="var(--accent-emerald)" /> : <Copy size={14} />} Copy Prompting Example
                </button>
              </div>

              <pre className="code-display" style={{ maxHeight: '340px' }}>
{`# ═══════════════════════════════════════════════════════════════════════
# STEP 1: UPLOAD FILE VIA REST API
# ═══════════════════════════════════════════════════════════════════════
curl -X POST http://localhost:8000/api/v1/files/upload \\
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY" \\
  -F "file=@financial_report.docx"

# Response:
# {
#   "filename": "7a3f9e42_financial_report.docx",
#   "original_name": "financial_report.docx",
#   "sandbox_path": "sandbox/uploads/tenant/7a3f9e42_financial_report.docx"
# }

# ═══════════════════════════════════════════════════════════════════════
# STEP 2: CHATBOT CALLS open_uploaded_file_as_artifact ON USER REQUEST
# ═══════════════════════════════════════════════════════════════════════
# The user types: "Open financial_report.docx in canvas and show me the executive summary"
# The assistant invokes open_uploaded_file_as_artifact(filename="financial_report.docx")
# It returns the active Canvas iframe embed URL with real-time editing enabled!

# SSE Response Chunk:
# data: {"choices": [{"delta": {"artifacts": [{
#   "artifact_id": "b182ef01-382a-4421-99af-2c8b8813098e",
#   "title": "Financial Report",
#   "filename": "financial_report.docx",
#   "artifact_type": "document",
#   "current_version": 1,
#   "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
#   "embed_url": "/embed/canvas?token=eyJhbGci..."
# }]}}]}`}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 3: KNOWLEDGE BASE & DETAILED GUIDES BROWSER                     */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeSection === 'guides' && (
        <DocumentationBrowser />
      )}
    </div>
  );

  if (!isStandalone) {
    return content;
  }

  return (
    <div style={{
      minHeight: '100vh',
      width: '100%',
      background: 'var(--bg-dark, #0a0f1d)',
      color: 'var(--text-main, #f8fafc)',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Standalone Public Header Navbar */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        background: currentTheme === 'light' ? 'rgba(255, 255, 255, 0.85)' : 'rgba(10, 15, 29, 0.85)',
        borderBottom: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer' }} onClick={() => navigate(isAuthenticated ? '/playground' : '/')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img
              src="/logo_navbar.svg"
              alt="AI Skill Engine"
              style={{
                height: '50px',
                width: 'auto',
                display: 'block',
                filter: 'drop-shadow(0 2px 12px rgba(0, 242, 254, 0.3))'
              }}
            />
            <span style={{
              background: 'rgba(6, 182, 212, 0.15)',
              color: 'var(--primary-cyan, #06b6d4)',
              border: '1px solid rgba(6, 182, 212, 0.3)',
              fontSize: '0.7rem',
              fontWeight: '700',
              padding: '2px 8px',
              borderRadius: '999px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Docs
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={handleToggleTheme}
            className="btn-outline"
            style={{
              padding: '8px 12px',
              borderRadius: '9px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.82rem',
              cursor: 'pointer'
            }}
            title={currentTheme === 'dark' ? 'Switch to Day (Light) Mode' : 'Switch to Night (Dark) Mode'}
          >
            {currentTheme === 'dark' ? (
              <>
                <Sun size={15} color="var(--accent-amber, #f59e0b)" />
                <span>Day Mode</span>
              </>
            ) : (
              <>
                <Moon size={15} color="var(--primary-violet, #8b5cf6)" />
                <span>Night Mode</span>
              </>
            )}
          </button>

          <button
            onClick={() => navigate(isAuthenticated ? '/playground' : '/')}
            className="btn-gradient"
            style={{
              padding: '8px 16px',
              borderRadius: '9px',
              fontSize: '0.85rem',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              textDecoration: 'none'
            }}
          >
            {isAuthenticated ? (
              <>
                <LayoutDashboard size={16} />
                <span>Go to Dashboard</span>
              </>
            ) : (
              <>
                <LogIn size={16} />
                <span>Sign In / Console</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Public Docs Body */}
      <main style={{ flex: 1, padding: '28px 24px 60px', width: '100%', boxSizing: 'border-box' }}>
        {content}
      </main>
    </div>
  );
}
