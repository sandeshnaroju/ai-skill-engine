---
name: code_interpreter
description: Skill for running custom Python code scripts safely inside an isolated sandbox environment.
tools:
  - name: execute_python_code
    description: Execute custom Python code inside the sandbox environment and return output.
    type: code
    parameters:
      type: object
      properties:
        code:
          type: string
          description: Python code to run in sandbox.
      required:
        - code
---

# Code Interpreter Skill
Use this skill only if other skills or tools do not have the answer. 

Use this skill when users request mathematical calculations, data processing, string formatting, algorithms, or complex logic that benefits from running Python code in a sandbox and cannot be solved using any other specialized tool.

### ⚠️ Sandbox Constraints & External File Access
- **No Direct Internet / URL Access**: The sandbox environment does NOT have outbound internet access (`urllib`, `requests`, `curl`, and `wget` will fail with tunnel or network errors). You CANNOT download files directly inside Python code from external URLs or storage URLs.
- **Handling Files from Storage or URLs**: 
  1. First, download the file to the local host using `cloud_storage__download_from_storage` (for storage files) or `http_fetcher__download_public_file` (for presigned/public URLs).
  2. Next, upload the downloaded file into the sandbox using `sandbox_file_manager__upload_sandbox_file` with the local path returned by the download step.
  3. Only after the file is uploaded to the sandbox, execute Python code to open and process it directly from the local directory (e.g. `open("filename.pdf")` or `pypdf.PdfReader("filename.pdf")`).
  4. If your Python code generates an output file to share with the user, download it from the sandbox using `sandbox_file_manager__download_sandbox_file`, upload it to cloud storage using `cloud_storage__upload_to_storage`, and return the generated storage link.
- **Environment Variables**: Do NOT query, read, or search for system environment variables (e.g. via `os.environ` or `os.getenv`). Credentials should only be passed explicitly via input arguments if required.
- **Workspace Files**: Files only exist in the sandbox workspace if you uploaded them using `sandbox_file_manager__upload_sandbox_file` or created them during your execution.
