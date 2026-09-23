# ⚡ Quickstart Guide (5 Minutes)

This step-by-step walkthrough takes you from zero to running your first AI agent tool execution and calling the OpenAI-compatible API gateway.

---

## 🎯 What You Will Accomplish:
1. Access the web dashboard.
2. Register your first LLM provider (Gemini, OpenAI, or OpenRouter).
3. Test tool execution in the **Chat Playground**.
4. Send your first API request using **cURL**.

---

## Step 1: Open the Dashboard

After starting the server via Docker or local script:
1. Open your browser and navigate to **`http://localhost:2704`**.
2. If this is a fresh setup, log in with the initial administrator account or default workspace.
3. You will land on the **Chat Playground**.

---

## Step 2: Register an LLM Model

The engine does not hardcode global LLM keys into environment files; instead, models are registered **per-tenant** in the dashboard.

1. In the left navigation sidebar, click **Tenants & Keys** (under *Settings & Gateway*).
2. Locate the default tenant (or create a new one, e.g. `Default Workspace`) and click **Manage** (or the key icon).
3. In the **Registered LLM Models** section, click **+ Register Model**:
   - **Provider**: Select `gemini`, `openai`, or `openrouter`.
   - **Model Name**: Enter your preferred model ID:
     - For Gemini: `gemini-2.5-flash` or `gemini-2.0-flash`
     - For OpenAI: `gpt-4o` or `gpt-4o-mini`
     - For OpenRouter: `anthropic/claude-3.5-sonnet`
   - **API Key**: Paste your upstream API key from Google AI Studio, OpenAI, or OpenRouter.
   - **Set as Default**: Toggle ON so the engine uses this model when no model is explicitly specified in the client request.
4. Click **Save Model**.

---

## Step 3: Test Tool Execution in Chat Playground

Let's test the agent's ability to execute code and run tools:

1. In the left sidebar, click **Chat Playground**.
2. Select your registered model in the top toolbar dropdown.
3. Type the following prompt into the chat box:
   ```text
   Calculate the compound interest on $25,000 invested at 8.5% annual return for 15 years compounded monthly. Write a Python script to verify, calculate the final balance, and print each year's growth.
   ```
4. Press **Enter**.
5. **Watch the live agent execution**:
   - The assistant reasons about the problem.
   - It invokes the `code_interpreter` skill (`run_python` tool).
   - The Python code runs inside the isolated sandbox.
   - The assistant parses the output and returns the final verified financial calculations.

---

## Step 4: Test Universal Canvas Artifacts

Now test the Canvas document creation:

1. In the same Chat Playground, type:
   ```text
   Create an interactive project proposal document in Canvas titled 'Q4 Cloud Modernization'. Include a summary, milestones table, and budget breakdown.
   ```
2. Press **Enter**.
3. Notice the split-pane **Live Canvas** opens automatically on the right half of your screen!
4. You can edit the text directly inside the Canvas, preview headings, and export it to `.docx` or `.pdf`.

---

## Step 5: Make Your First API Call via cURL

Now let's call the gateway externally, just as your business backend or chatbot frontend will:

1. Retrieve your Tenant API key from **Tenants & Keys** (e.g. `sk_mgr_1234567890abcdef`).
2. Run this cURL command in your terminal:

```bash
curl -N -X POST http://localhost:2704/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY" \
  -d '{
    "messages": [
      {"role": "user", "content": "What is the square root of 144 multiplied by 25? Use Python to compute."}
    ],
    "model": "gemini-2.5-flash",
    "stream": true,
    "session_id": "quickstart_session_001",
    "skill_names": ["code_interpreter"]
  }'
```

You will see real-time Server-Sent Events (SSE) streaming back with live reasoning tokens and sandbox execution traces:

```text
data: {"choices":[{"delta":{"content":"Let me calculate this using Python."}}]}
data: {"choices":[{"delta":{"tool_call":{"name":"run_python","arguments":{"code":"import math\nprint(math.sqrt(144) * 25)"}}}}]}
data: {"choices":[{"delta":{"tool_result":{"output":"300.0\n"}}}]}
data: {"choices":[{"delta":{"content":"The square root of 144 is 12, and 12 * 25 = 300."}}]}
data: [DONE]
```

🎉 **Congratulations!** Your self-hosted AI Skill Engine is fully configured and ready for production integrations.

---

## 🧭 Next Steps

- **[Usage Guide & Workflows](04-usage-guide.md)**: Master the admin dashboard, skill grouping, and audit tools.
- **[API Reference](09-api-reference.md)**: Explore streaming parameters, multimodal routing, and SDK examples.
- **[Canvas Artifacts Integration](13-artifacts-canvas.md)**: Embed the interactive Canvas in your own web app.
