# ⚡ Headless Canvas REST & SSE

If your application requires a custom user interface (e.g. your own Monaco editor wrapper, TipTap/ProseMirror rich-text editor, or native mobile app) instead of the pre-built Canvas iframe, you can interact directly with AI Skill Engine's headless Canvas endpoints.

All headless endpoints accept the time-bounded `?token={embed_token}` query parameter minted for the artifact.

---

## 1. Fetch Document Metadata & Block Outline

Retrieve the current document title, format, total version count, and the list of structured section block keys:

```bash
curl -X GET "http://localhost:8000/api/v1/artifacts/{artifact_id}?token={embed_token}"
```

### JSON Response

```json
{
  "id": "84419384-8e98-4b7f-bc21-8f2abe21f44c",
  "title": "Executive Modernization Plan",
  "filename": "exec_plan.md",
  "artifact_type": "document",
  "current_version": 2,
  "blocks": [
    { "key": "block_0", "type": "heading", "summary": "Executive Summary" },
    { "key": "block_1", "type": "body", "summary": "Current Infrastructure Bottlenecks" },
    { "key": "block_2", "type": "code", "summary": "Terraform Migration Script" }
  ]
}
```

---

## 2. Fetch Specific Section Block Content

Retrieve the full content of an individual section block:

```bash
curl -X GET "http://localhost:8000/api/v1/artifacts/{artifact_id}/blocks/{block_key}?token={embed_token}"
```

---

## 3. Save Inline User Edits (Surgical Commit)

When a user edits a paragraph or code block in your custom UI, send a `PUT` request to update only that block. The engine automatically creates a new diff commit in the artifact's version history:

```bash
curl -X PUT "http://localhost:8000/api/v1/artifacts/{artifact_id}/blocks/{block_key}?token={embed_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "## Updated Executive Summary\n\nCloud migration will complete by Q4 2026.",
    "summary": "User updated timeline to Q4 2026"
  }'
```

---

## 4. Subscribe to Real-Time SSE Stream (Live Typing & Surgical Patches)

Subscribe to an event stream to receive live keystroke typing as the LLM generates the document or when surgical diff patches are applied:

```bash
curl -N -X GET "http://localhost:8000/api/v1/artifacts/{artifact_id}/stream?token={embed_token}"
```

### SSE Stream Chunks

```text
data: {"type": "block_start", "block_key": "block_0", "heading": "Executive Summary"}
data: {"type": "block_delta", "block_key": "block_0", "content": "This proposal outlines..."}
data: {"type": "block_complete", "block_key": "block_0"}
```

---

## 5. Direct Binary Export Downloads

Trigger instant binary file conversions and downloads without any third-party conversion libraries on your frontend:

```bash
# Microsoft Word (.docx)
curl -O "http://localhost:8000/api/v1/artifacts/{artifact_id}/export?format=docx&token={embed_token}"

# Adobe PDF (.pdf)
curl -O "http://localhost:8000/api/v1/artifacts/{artifact_id}/export?format=pdf&token={embed_token}"

# Microsoft Excel (.xlsx)
curl -O "http://localhost:8000/api/v1/artifacts/{artifact_id}/export?format=xlsx&token={embed_token}"

# Microsoft PowerPoint (.pptx)
curl -O "http://localhost:8000/api/v1/artifacts/{artifact_id}/export?format=pptx&token={embed_token}"
```

---

## 6. Purge Artifacts for a Session

Clean up all documents created in a chat session:

```bash
curl -X DELETE "http://localhost:8000/api/v1/artifacts/session/{session_id}" \
  -H "X-API-Key: {TENANT_API_KEY}"
```

---

## 🧭 Related Guides

- **[Canvas Iframe & Embedding](frontend-canvas.md)** — Pre-built drop-in iframe component
- **[Security, Tokens & Uploaded Files](frontend-security.md)** — HMAC token lifecycle and client-side expiration checks
- **[Artifacts & Management APIs](backend-management.md)** — Complete REST endpoint matrix
