# 18 - Scheduled Jobs & Automated Background Tasks

AI Skill Engine includes an enterprise-grade, distributed scheduling engine powered by APScheduler and SQLAlchemy. It allows tenants and external API clients to automate prompt execution, data gathering, and report compilation on recurring or exact future schedules.

---

## 1. Overview & Capabilities

Automated jobs run independently in the background without needing an open browser or active user session:

- **Cron Expressions**: Schedule repeating jobs on standard 5-part cron syntax (e.g. `0 10 * * 1-5` for every weekday at 10:00 AM) in the tenant's localized timezone.
- **Interval Triggers**: Fire every $N$ seconds or minutes (e.g. every 3600 seconds for hourly health monitoring).
- **One-Shot Date Triggers**: Execute once at an exact future ISO datetime (e.g. `2026-12-01T09:00:00Z`).
- **Dynamic Secrets & User Data Isolation**: Link specific User Data / Secrets profiles or pass custom parameters. Secrets are resolved dynamically at the exact millisecond of trigger, supporting zero-downtime key rotation.
- **Agentic Skill-Driven Actions**: Delivery and updates are 100% tool-driven by the AI agent (e.g. invoking `email__send_email` or custom HTTP API skills) based on instructions in your prompt.
- **Error Email Suppression**: Built-in guardrails ensure users never receive technical failure emails or 401/403 missing secret errors; errors are securely retained in the audit history.

---

## 2. Dynamic Secret & User Data Resolution

When a job fires at a future time, the execution engine dynamically resolves credentials and environment variables using strict user-controlled binding:

| Binding Method | Source | Use Case |
| :--- | :--- | :--- |
| **None (Default)** | Empty / None | Public skills or jobs requiring no secrets. No workspace profiles are touched. |
| **Bound Profile Template** | `user_data_template_id` | Production vs. Staging credentials. Supports key rotation without updating schedules. |
| **Direct Custom Overrides** | `user_data` (JSON dict) | Caller-specific arguments or runtime overrides passed via API. |

```
   APScheduler Worker Fires
             │
             ▼
   Checks user_data_template_id & user_data
             │
             ├──► If user_data_template_id: Dynamically loads latest secrets from UserDataTemplate
             └──► If user_data: Merges explicit caller parameter overrides
             │
             ▼
   Passes resolved dictionary to SkillEngine
             │
             ▼
   Replaces {{user_data.api_key}} in HTTP headers/skills at runtime
   (Secrets are NEVER leaked to LLM context or prompts)
```

---

## 3. Creating Scheduled Jobs via REST API

Tenants and external systems can manage schedules programmatically via the Scheduler API using standard Bearer API key authorization (`Authorization: Bearer sk_mgr_...`).

### Endpoint
`POST /api/v1/scheduler/jobs`

### Request Headers
```http
Content-Type: application/json
Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY
```

### Request Payload Example
```json
{
  "name": "Daily Perth Weather Briefing",
  "prompt": "Fetch current weather conditions for Perth. If successful, construct a clean HTML summary and send it to alerts@example.com using the email skill. If data cannot be fetched, do not send any email.",
  "trigger_type": "cron",
  "cron_expression": "0 8 * * *",
  "user_data_template_id": "tpl_f8a923b0-1234-4567-89ab",
  "skill_names": ["weather_fetcher", "email"],
  "model_name": "gemini-2.5-flash",
  "store_in_session": true
}
```

### Parameters Reference

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `name` | string | **Yes** | Human-readable title for the job. |
| `prompt` | string | **Yes** | Detailed instructions the AI agent will execute on every trigger. Specify your delivery instructions (e.g. email recipient or API action) directly in the prompt. |
| `trigger_type` | string | **Yes** | `cron`, `interval`, or `date`. |
| `cron_expression` | string | Optional | Standard 5-field cron (`min hour dom month dow`). Required for `cron`. |
| `interval_seconds`| integer | Optional | Interval duration in seconds. Required for `interval`. |
| `run_at` | string | Optional | ISO 8601 datetime (`YYYY-MM-DDTHH:MM:SSZ`). Required for `date`. |
| `user_data_template_id` | string | Optional | ID of the User Data / Secrets profile template to attach. |
| `user_data` | object | Optional | Key-value dictionary of runtime overrides/parameters. |
| `skill_names` | array | Optional | Array of skill names permitted for execution. If empty, all active tenant skills are enabled. |
| `model_name` | string | Optional | LLM model to run (defaults to tenant default model). |
| `store_in_session` | boolean | Optional | Whether to persist execution transcripts to chat sessions (default: `true`). |

---

## 4. Scheduler Management Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/scheduler/jobs` | List all scheduled jobs for the authenticated tenant with pagination and status filters. |
| `POST` | `/api/v1/scheduler/jobs` | Create a new recurring or one-shot schedule. |
| `GET` | `/api/v1/scheduler/jobs/{id}` | Retrieve details, execution count, next run time, and last run result. |
| `PUT` | `/api/v1/scheduler/jobs/{id}` | Update prompt, cadence, bound secrets profile, or active status. |
| `DELETE`| `/api/v1/scheduler/jobs/{id}` | Permanently remove a scheduled job from APScheduler and the database. |
| `POST` | `/api/v1/scheduler/jobs/{id}/run-now` | Manually force-trigger an execution immediately for testing. |
| `POST` | `/api/v1/scheduler/jobs/{id}/pause` | Temporarily pause an active schedule without deleting it. |
| `POST` | `/api/v1/scheduler/jobs/{id}/resume` | Resume a paused schedule. |

---

## 5. Conversational Scheduling in Chat Playground

Users can schedule tasks naturally during a chat session. The AI Skill Engine exposes built-in scheduling tools to the agent:

> **User**: *"Schedule a report every Monday at 9 AM that checks our server uptime and emails devops@mycompany.com."*

The model will automatically invoke `scheduler__create_schedule`:
```json
{
  "name": "Weekly Uptime Audit",
  "prompt": "Inspect server health metrics. If normal or degraded, compile a summary and email devops@mycompany.com using the email skill. If credentials or network fails, log the error and do not email.",
  "trigger_type": "cron",
  "cron_expression": "0 9 * * 1"
}
```

---

## 6. Error & Missing Secret Handling Guardrails

Scheduled agents operate under strict safety guidelines:
1. **No Error Spam**: If an API key is missing or an external API returns `401 Unauthorized` or `403 Forbidden`, the agent is restricted from calling `send_email`.
2. **Audit Logging**: The error is captured in `ScheduledJob.last_error` and logged in execution traces viewable via the Dashboard at **Scheduled Jobs -> Inspect Output**.
3. **Automatic Deactivation of One-Off Tasks**: Date-triggered jobs (`trigger_type="date"`) automatically set `is_active=false` after running, preventing duplicate runs upon server restarts.
