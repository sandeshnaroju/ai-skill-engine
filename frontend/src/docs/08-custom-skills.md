# 🧩 Connecting Custom APIs as AI Skills

AI Skill Engine allows you to turn any REST API, webhook, or script into an AI tool called a **Skill**. 

Once defined, the LLM reads the skill's parameter schema and description, automatically decides when to call it, and extracts the right arguments from the user's natural language request.

---

## 1. Anatomy of a Skill (`SKILL.md`)

A skill is defined in a standard Markdown file with a YAML frontmatter header:

```yaml
---
name: crm_lead_creator
description: Use this skill to create a new customer lead in our CRM system.
tools:
  - name: create_lead
    description: Creates a sales lead with contact details and company name.
    type: http
    method: POST
    url: https://api.mycompany.com/v1/leads
    headers:
      Content-Type: application/json
      Authorization: "Bearer {{user_data.crm_api_token}}"
    parameters:
      type: object
      properties:
        full_name:
          type: string
          description: Customer's full name.
        email:
          type: string
          description: Valid email address.
        company:
          type: string
          description: Company or organization name.
      required:
        - full_name
        - email
---
# CRM Lead Creator Skill
Instructions for the AI on when to recommend or trigger lead creation.
```

---

## 2. Creating a Skill in 2 Steps

### Step 1: Open the Skills Catalog
1. In the Dashboard, click **Skills Catalog** (`/skills`).
2. Click **+ New Skill** (or use the **AI Skill Generator** to generate one from a description).

### Step 2: Define Tool Schema
- Set `type: http` for REST API endpoints.
- Define `url`, `method`, `headers`, and parameters.
- Click **Save Skill**. The tool is immediately available to your agents without restarting the server!

---

## 3. Protecting Secrets with `{{user_data.key}}`

Notice the header in the example above:
```yaml
headers:
  Authorization: "Bearer {{user_data.crm_api_token}}"
```

### Why this is critical:
- **Zero LLM Leaks**: The raw API token is **never** placed into the prompt context or exposed to the model.
- **Runtime Injection**: When the model calls `create_lead`, the backend execution layer intercepts the request, replaces `{{user_data.crm_api_token}}` with the real secret, and dispatches the HTTP call.
- **Key Rotation**: When you update your token in **User Data Profiles**, all skills immediately use the updated token with zero downtime.

---

## 4. Testing Your Custom Skill

Once saved, open the **Chat Playground** (`/playground`):
1. In the right-hand panel, ensure your new skill (`crm_lead_creator`) is checked.
2. Send a natural prompt:
   > *"Add a new lead for Sarah Connor at Cyberdyne Systems, email sarah@cyberdyne.com"*
3. The agent will analyze your request, formulate the JSON payload, call your API, and report the result!
