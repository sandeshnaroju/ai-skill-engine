# 🛡️ Code Execution Sandboxes Guide

When an LLM triggers a skill that runs Python code or shell commands (e.g. `code_interpreter`, `math_solver`), AI Skill Engine dispatches that execution to an **isolated code sandbox**.

You can switch sandbox providers directly from the **Sandbox Config** (`/sandbox`) page in the dashboard per tenant.

---

## 📊 Sandbox Comparison Matrix

| Sandbox Provider | Isolation Level | Persistence | Setup Requirements | Best For |
|---|---|---|---|---|
| **Docker** *(default)* | Local Container (`ai-sandbox-python:latest`) | Ephemeral | Local Docker socket access (`/var/run/docker.sock`) | Local development, on-prem servers, private hardware |
| **Azure Container Apps (ACA)** | Hyper-V Isolated Cloud Pods | Ephemeral / Session Pool | Azure Subscription, Entra ID credentials, Session Pool Endpoint | Enterprise Azure environments, strict security compliance |
| **E2B** | Agentic Micro-VM | Stateful / Persistent | E2B API Key | Long-running analysis, multi-step filesystem workflows |
| **Fly.io** | Serverless Micro-VM | Ephemeral | Fly API Token & App Name | Lightweight cloud execution with minimal latency |
| **AWS Lambda** | Serverless Function | Ephemeral | AWS Access/Secret Keys, Region, Function Name | Serverless cloud execution within AWS VPCs |
| **Process** | Host OS Subprocess | Ephemeral | None | Trusted private testing only (not recommended for production) |

---

## 🔒 Strict Isolation Guarantee

> [!IMPORTANT]
> If a remote cloud sandbox (Azure ACA, E2B, Fly.io, or AWS Lambda) is configured for a tenant, execution **strictly targets that cloud environment**. The engine will **never** silently fall back to host process execution if the remote sandbox fails.

---

## 1. Local Docker Sandbox (Default)

The Docker sandbox launches ephemeral sibling containers on your host machine to run Python code.

### How It Works:
1. When code is submitted, the engine uses the mounted `/var/run/docker.sock` to start a temporary container using the pre-built image:
   ```text
   sandeshnaroju/ai-sandbox-python:latest
   ```
2. The code, input datasets, and dependencies are mounted into the container.
3. The command executes under non-root permissions with strict memory/CPU limits.
4. Output and generated files (charts, images) are collected, and the container is cleanly destroyed.

---

## 2. Azure Container Apps (Dynamic Sessions)

Azure Dynamic Sessions provides fast, Hyper-V isolated container execution pools managed entirely by Microsoft Azure.

### Setup Steps:
1. Create a **Session Pool** in Azure Container Apps:
   - Environment: Dynamic Sessions
   - Runtime: Python 3.11
2. In the AI Skill Engine dashboard, go to **Sandbox Config** → select **Azure Container Apps**.
3. Fill in the following credentials:
   - **Session Pool Endpoint**: `https://<region>.dynamicsessions.io/subscriptions/<sub-id>/...`
   - **Azure Client ID**: Entra ID Application (Client) ID.
   - **Azure Client Secret**: Application Secret Key.
   - **Azure Tenant ID**: Entra ID Directory (Tenant) ID.
4. Click **Test Connection**, then click **Save Configuration**.

---

## 3. E2B Micro-VMs

[E2B](https://e2b.dev) is built specifically for AI agents, providing isolated, full Linux micro-VMs that start in under 200ms.

### Setup Steps:
1. Sign up at [e2b.dev](https://e2b.dev) and generate an API key.
2. In the AI Skill Engine dashboard, go to **Sandbox Config** → select **E2B**.
3. Enter:
   - **E2B API Key**: `e2b_...`
   - **Template ID** *(optional)*: `base` (or your custom Python template).
4. Click **Test Connection** and **Save Configuration**.

---

## 4. Fly.io & AWS Lambda

- **Fly.io**: Executes ephemeral Fly Machines on demand. Provide your Fly API Token and App identifier.
- **AWS Lambda**: Dispatches code to a dedicated AWS Lambda function packaging Python with NumPy/Pandas. Provide AWS Access Key, Secret Key, Region, and Function ARN.

---

## 🧭 Next Steps

- **[Configuration Reference](16-configuration.md)**: Environment variables and encryption settings.
- **[Skills & MCP Servers](17-skills-and-mcp.md)**: Explore how skills interact with sandboxes.
