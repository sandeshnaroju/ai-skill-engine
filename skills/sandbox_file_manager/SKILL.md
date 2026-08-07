---
name: sandbox_file_manager
description: Use this skill when you need to manage files inside the active remote or local sandbox, including listing sandbox files, downloading files from the sandbox to the local backend, or uploading local backend files to the sandbox.
tools:
  - name: list_sandbox_files
    description: List all files present in the active remote or local sandbox workspace.
    type: custom
    parameters:
      type: object
      properties: {}
  - name: download_sandbox_file
    description: Download a file from the active remote sandbox to the local server outputs folder.
    type: custom
    parameters:
      type: object
      properties:
        filename:
          type: string
          description: The name of the file to download from the sandbox (e.g. "report.pdf").
      required:
        - filename
  - name: upload_sandbox_file
    description: Upload a local server file to the active remote sandbox workspace.
    type: custom
    parameters:
      type: object
      properties:
        local_path:
          type: string
          description: The local server path of the file to upload (e.g., "sandbox/uploads/data.csv").
      required:
        - local_path
---

# Sandbox File Manager Skill
Allows listing, uploading, and downloading files directly to/from the execution sandbox environment (Docker, Process, E2B, Azure Container Apps, AWS Lambda, Fly.io).
