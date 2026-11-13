---
name: webhook
description: Send HTTP POST/GET requests and webhooks with custom JSON or string payloads and headers. Use this to notify external APIs, push data to webhooks, trigger Zapier/Make/Slack integrations, or send structured notifications.
tools:
  - name: send_webhook
    description: Send an HTTP request (default POST) to an external webhook URL or REST API with custom payload and headers.
    parameters:
      type: object
      properties:
        url:
          type: string
          description: The destination HTTP/HTTPS webhook URL.
        payload:
          type: object
          description: The JSON payload data to send in the request body.
        headers:
          type: object
          description: "Optional custom HTTP headers (e.g. {\"Authorization\": \"Bearer ...\", \"Content-Type\": \"application/json\"})."
        method:
          type: string
          enum: [POST, GET, PUT, PATCH]
          default: POST
          description: The HTTP method to use (defaults to POST).
      required:
        - url
---

# Webhook Skill
Use this skill when the task requires notifying an external endpoint, triggering a webhook, or posting custom structured data to an external API (Slack, Discord, Zapier, n8n, internal webhooks).

### Guidelines:
- Format the `payload` cleanly as a JSON object matching the destination's expected schema.
- For Slack incoming webhooks, pass `payload={"text": "Your message here"}` or block kit structure.
- Always include required authentication headers if calling a secured endpoint.
