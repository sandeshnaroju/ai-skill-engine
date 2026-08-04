---
name: cloud_storage
description: Skill for uploading and downloading files from cloud storage (AWS S3 or Azure Blob Storage).
tools:
  - name: upload_to_storage
    description: Upload a file from the local workspace (sandbox uploads/outputs) to active cloud storage. Returns the cloud URL.
    type: shell
    parameters:
      type: object
      properties:
        filename:
          type: string
          description: Name of the file to upload (e.g. data.csv).
      required:
        - filename
  - name: download_from_storage
    description: Download a file from cloud storage into the local sandbox uploads folder. Returns the local path.
    type: shell
    parameters:
      type: object
      properties:
        filename:
          type: string
          description: Name of the file to download (e.g. input_data.xlsx).
      required:
        - filename
---

# Cloud Storage Skill
Use this skill when you need to transfer generated outputs to the cloud storage or download existing input files from the tenant's cloud container so they can be processed locally in the isolated sandbox.

### ⚠️ Strict Link & Path Rules
* **Mandatory Cloud Upload**: If you generate any new files (e.g., PDFs, Excel sheets, images) that you want to share with the user, you **MUST first call** `upload_to_storage` to upload the file to cloud storage.
* **Prohibit Local Links**: Never share local paths (e.g., `/sandbox/outputs/...`, `/api/v1/files/download/...`) in your final chat responses. You must **only** share the secure cloud URLs returned in the stdout of the `upload_to_storage` tool.
* Always present the resulting cloud download URL in a user-friendly format (e.g., `[Download report.pdf](cloud_url)`).
