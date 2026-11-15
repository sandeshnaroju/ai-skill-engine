# 🔐 Secrets & User Data Profiles

When building AI workflows, your tools often require sensitive credentials—such as third-party API tokens (Stripe, GitHub, HubSpot, OpenAI), private database passwords, or customer environment variables.

AI Skill Engine uses **User Data Profiles** and **Runtime Placeholders** to ensure secrets are securely injected into tools **without ever leaking to the LLM model or prompt context**.

---

## 1. How Runtime Secret Injection Works

```
   1. User / Scheduled Task
             │
             ▼
   2. LLM selects tool to call (e.g. "charge_customer")
             │
             ▼
   3. Backend intercepts HTTP Request:
      Headers: { "Authorization": "Bearer {{user_data.stripe_key}}" }
             │
             ▼
   4. Resolves {{user_data.stripe_key}} -> "sk_live_99812..."
             │
             ▼
   5. Dispatches request securely to Stripe API
      (The LLM NEVER sees, stores, or generates the real key)
```

---

## 2. Managing Profiles in the Dashboard

1. Navigate to **User Data Profiles** (`/user-data`).
2. Click **+ New Profile**.
3. Give it a name (e.g. `Production CRM Secrets`) and enter your key-value pairs:
   ```json
   {
     "crm_api_key": "live_crm_token_88921",
     "stripe_secret": "sk_live_51A8c...",
     "database_url": "postgresql://usr:pwd@db.internal:5432"
   }
   ```
4. Click **Save Profile**.

---

## 3. Passing Custom User Data via REST API

External API callers can also supply runtime secrets or dynamic user metadata directly in the `/api/v1/chat/completions` request body using the `user_data` field:

```bash
curl -X POST http://localhost:2704/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY" \
  -d '{
    "messages": [
      {"role": "user", "content": "Fetch active user count from our analytics service."}
    ],
    "user_data": {
      "analytics_token": "secret_session_token_xyz"
    },
    "skill_names": ["analytics_skill"]
  }'
```

---

## 4. Zero-Downtime Key Rotation

When an API token expires or needs rotation:
1. Update the value inside **User Data Profiles**.
2. All skills, scheduled jobs, and agent sessions immediately pick up the new credential on their next execution.
3. No code redeployments, skill schema modifications, or job recreations are needed.
