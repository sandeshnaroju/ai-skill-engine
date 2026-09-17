# 💾 Session Storage & Cloud Files Lifecycle

AI Skill Engine allows client applications to upload documents and generate assets (charts, audio, video, spreadsheets) that automatically stream to your configured storage provider (**Azure Blob Storage**, **AWS S3 / MinIO / R2**, or **Local Disk**).

Every file is registered under the caller's `session_id`, enabling business applications to inspect, list, download, and cascade-purge storage blobs when users delete chat threads.

---

## 🏗️ Storage Architecture

```
                                  [ Client Application ]
                                             │
                   Uploads file with session_id="thread_101"
                                             │
                                             ▼
                                ┌──────────────────────────┐
                                │ POST /api/v1/files/upload│
                                └────────────┬─────────────┘
                                             │
                       ┌─────────────────────┴─────────────────────┐
                       ▼                                           ▼
             [ Active Storage Backend ]                  [ SessionFile Database ]
          • Azure Blob Container (SAS URL)            • Tenant ID: tenant_1
          • AWS S3 Bucket (Pre-signed URL)            • Session ID: thread_101
          • Local Server Filesystem                   • Storage Provider: azure
                                                      • Storage URL & Path
```

---

## 📤 1. Uploading Files with Session Tracking

When your users attach a file to a chat thread, upload it via `POST /api/v1/files/upload`:

```bash
curl -X POST http://localhost:2704/api/v1/files/upload \
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY" \
  -F "file=@financial_report.xlsx" \
  -F "session_id=user_chat_thread_101" \
  -F "origin=external_api"
```

### Form Parameters:
- `file`: The multipart file payload.
- `session_id` *(optional but recommended)*: The unique thread ID linking the file to a conversation.
- `origin` *(optional)*: Tag identifying origin (`external_api` vs `chat_playground`). Default is `external_api`.

### Response Payload:
```json
{
  "status": "success",
  "id": "7fa3b210-9c1a-45d2-b34e-01a2b3c4d5e6",
  "filename": "f8a9c2_financial_report.xlsx",
  "original_name": "financial_report.xlsx",
  "storage_provider": "azure",
  "url": "https://mystorage.blob.core.windows.net/sessions/f8a9c2_financial_report.xlsx?sv=...",
  "file_size": 24576,
  "file_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "session_id": "user_chat_thread_101"
}
```

---

## 📋 2. Listing Files for a Session

Retrieve metadata and download URLs for all files associated with a specific chat thread:

```bash
curl -X GET "http://localhost:2704/api/v1/files/session/user_chat_thread_101" \
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY"
```

### Optional Query Filters:
- `source`: Filter by `user_upload` or `tool_generated`.
- `origin`: Filter by `external_api` or `chat_playground`.

### Response:
```json
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
    },
    {
      "id": "8bc4d321-0d2b-46e3-c45f-12b3c4d5e6f7",
      "filename": "d4e5f6_quarterly_chart.png",
      "original_name": "quarterly_chart.png",
      "storage_provider": "azure",
      "url": "https://mystorage.blob.core.windows.net/sessions/d4e5f6_quarterly_chart.png?sv=...",
      "file_size": 1048576,
      "source": "tool_generated",
      "origin": "external_api",
      "created_at": "2026-09-17T12:02:15Z"
    }
  ]
}
```

---

## 🗑️ 3. Purging Entire Session Files (Cascade Cloud Deletion)

When an end-user or CRM system deletes a conversation or thread, call this endpoint to permanently clean up all storage blobs and sandbox caches:

```bash
curl -X DELETE "http://localhost:2704/api/v1/files/session/user_chat_thread_101" \
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY"
```

### Actions Executed:
1. Connects to the active cloud storage provider (Azure Blob Container, AWS S3 bucket, or Local Disk).
2. Permanently deletes all uploaded and tool-generated blobs for that session.
3. Clears local sandbox execution disk caches (`sandbox/uploads/` and `sandbox/outputs/`).
4. Removes all file metadata records from the database.

### Response:
```json
{
  "status": "success",
  "session_id": "user_chat_thread_101",
  "storage_provider": "azure",
  "deleted_count": 2,
  "deleted_files": [
    "f8a9c2_financial_report.xlsx",
    "d4e5f6_quarterly_chart.png"
  ]
}
```

---

## ❌ 4. Deleting a Single File

Permanently delete an individual file by its unique ID:

```bash
curl -X DELETE "http://localhost:2704/api/v1/files/7fa3b210-9c1a-45d2-b34e-01a2b3c4d5e6" \
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY"
```

### Response:
```json
{
  "status": "success",
  "deleted_file": "f8a9c2_financial_report.xlsx",
  "id": "7fa3b210-9c1a-45d2-b34e-01a2b3c4d5e6"
}
```

---

## ⚡ 5. Automated Cascade on Session Deletion

If your business backend already clears chat history via the standard sessions endpoint:

```http
DELETE /api/v1/sessions/{session_id}
```

AI Skill Engine **automatically cascade-purges** all tracked cloud storage files and sandbox caches associated with that session in the same transaction. No secondary call is required!

---

## 🧭 Next Steps

- **[Execution Sandboxes Guide](sandboxes.md)**: Explore Docker, Azure ACA, and E2B runtime sandboxes.
- **[Configuration Reference](configuration.md)**: Configure S3 and Azure Blob connection credentials.
