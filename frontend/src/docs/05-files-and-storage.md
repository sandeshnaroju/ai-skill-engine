# 📁 File Uploads & Session Storage

AI Skill Engine allows you to upload documents (PDFs, spreadsheets, CSVs, raw code, images) directly into a conversation session. The AI agent can inspect, read, parse, and reference these files during tool execution.

---

## 1. Uploading Files to a Session

To make a file accessible to an agent turn, upload it to the `/api/v1/files/upload` endpoint and associate it with a `session_id`:

### cURL
```bash
curl -X POST http://localhost:2704/api/v1/files/upload \
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY" \
  -F "file=@financial_report.pdf" \
  -F "session_id=user_session_42"
```

### Python
```python
import requests

url = "http://localhost:2704/api/v1/files/upload"
headers = {"Authorization": "Bearer sk_mgr_YOUR_TENANT_API_KEY"}

files = {"file": open("financial_report.pdf", "rb")}
data = {"session_id": "user_session_42"}

response = requests.post(url, headers=headers, files=files, data=data)
print(response.json())
```

**Response:**
```json
{
  "id": "file_88a91c",
  "filename": "financial_report.pdf",
  "content_type": "application/pdf",
  "size_bytes": 1048576,
  "session_id": "user_session_42"
}
```

---

## 2. Asking the Agent to Process the Uploaded File

Once uploaded, simply trigger a chat completion with that same `session_id`. The agent automatically has access to the file in its workspace:

```bash
curl -X POST http://localhost:2704/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY" \
  -d '{
    "session_id": "user_session_42",
    "messages": [
      {"role": "user", "content": "Extract the balance sheet from financial_report.pdf and summarize the liabilities."}
    ],
    "skill_names": ["code_interpreter"]
  }'
```

---

## 3. Downloading Agent-Generated Files

When a tool or Python script generates new files (e.g. processed CSVs, charts, cropped images, generated PDFs), they are saved to persistent session storage.

### List Files in a Session
```bash
curl -X GET http://localhost:2704/api/v1/files/session/user_session_42 \
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY"
```

### Download a File
```bash
curl -X GET http://localhost:2704/api/v1/files/download/file_88a91c \
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY" \
  -o "downloaded_result.pdf"
```

---

## 4. Session Cascade Cleanup

When a user closes a thread or requests deletion of their data, you can purge the conversation and all attached files in one call:

```bash
# Deletes all session files from cloud storage (S3 / Azure Blob / Local)
curl -X DELETE http://localhost:2704/api/v1/files/session/user_session_42 \
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY"

# Deletes message history
curl -X DELETE http://localhost:2704/api/v1/sessions/user_session_42 \
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY"
```
