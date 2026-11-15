# ⏰ Scheduled Background Tasks

AI Skill Engine includes a built-in background scheduler that runs tasks automatically on recurring or future schedules. 

Use this to automate **daily morning briefings**, **hourly health checks**, **weekly executive digests**, or **one-time future reminders** without keeping a client connection open.

---

## 1. Quick Example: Creating a Schedule via REST API

Tenants can create and manage schedules using standard Tenant API Key authentication (`Authorization: Bearer sk_mgr_...`):

```bash
curl -X POST http://localhost:2704/api/v1/scheduler/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY" \
  -d '{
    "name": "Daily Morning Market Summary",
    "prompt": "Fetch the latest tech market headlines. Format a clean HTML summary and email it to devops@company.com using the email skill. If the news API is unreachable, do not send any email.",
    "trigger_type": "cron",
    "cron_expression": "0 9 * * 1-5",
    "skill_names": ["http_fetcher", "email"]
  }'
```

---

## 2. Trigger Types & Cadence Recipes

You can choose between 3 trigger types:

### A. Cron Triggers (`trigger_type: "cron"`)
Uses standard 5-part cron syntax (`minute hour day-of-month month day-of-week`) evaluated in your tenant workspace's localized timezone:

| Recurrence Goal | Cron Expression |
| :--- | :--- |
| **Every day at 9:00 AM** | `0 9 * * *` |
| **Every weekday (Mon–Fri) at 8:30 AM** | `30 8 * * 1-5` |
| **Every Monday morning at 10:00 AM** | `0 10 * * 1` |
| **First day of every month at midnight** | `0 0 1 * *` |
| **Every 30 minutes** | `*/30 * * * *` |

### B. Interval Triggers (`trigger_type: "interval"`)
Fires repeatedly every $N$ seconds:
```json
{
  "trigger_type": "interval",
  "interval_seconds": 3600  // Runs every 1 hour
}
```

### C. One-Shot Date Triggers (`trigger_type: "date"`)
Fires once at an exact ISO datetime, then automatically deactivates:
```json
{
  "trigger_type": "date",
  "run_at": "2026-12-01T15:00:00Z"
}
```

---

## 3. Conversational Scheduling in Chat Playground

Users can also schedule jobs naturally during a chat conversation:

> **User**: *"Schedule a report every morning at 10 AM that checks our server uptime and emails alerts@example.com."*

The model will automatically invoke the built-in `scheduler__create_schedule` tool:
```json
{
  "name": "Daily Server Uptime Report",
  "prompt": "Inspect server health metrics. If normal or degraded, compile a summary and email alerts@example.com using the email skill. If credentials fail, log the error and do not email.",
  "trigger_type": "cron",
  "cron_expression": "0 10 * * *"
}
```

---

## 4. Managing Scheduled Jobs

| Action | Endpoint | Description |
| :--- | :--- | :--- |
| **List Jobs** | `GET /api/v1/scheduler/jobs` | View all jobs, active status, run counts, and next scheduled run time. |
| **Get Details** | `GET /api/v1/scheduler/jobs/{id}` | Inspect a single job and its latest execution output. |
| **Test Run Now** | `POST /api/v1/scheduler/jobs/{id}/trigger`| Instantly trigger an execution in the background to test your prompt. |
| **Pause Job** | `POST /api/v1/scheduler/jobs/{id}/pause` | Temporarily pause a job without deleting it. |
| **Resume Job** | `POST /api/v1/scheduler/jobs/{id}/resume` | Reactivate a paused job. |
| **Delete Job** | `DELETE /api/v1/scheduler/jobs/{id}` | Permanently remove a scheduled job. |

---

## 5. Error & Missing Secret Handling

To prevent user annoyance, the engine enforces strict background execution guardrails:
- **No Error Spam**: If an API key is missing, or an external API returns `401 Unauthorized` or `403 Forbidden`, the agent is restricted from calling `send_email`.
- **Audit Logging**: The error reason is captured in `ScheduledJob.last_error` and displayed in the dashboard under **Scheduled Jobs -> Inspect Output** so administrators can troubleshoot without end users receiving broken email alerts.
