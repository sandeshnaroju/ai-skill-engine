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

### ⚠️ Sandbox Constraints
- **Network Isolation**: The sandbox environment has **NO internet connection**. 
  - Do NOT attempt to run `pip install` or download external packages.
  - Do NOT use libraries that make HTTP/network requests (like `urllib`, `requests`, `socket`, etc.) inside your code.
- **Environment Variables**: Do NOT query, read, or search for system environment variables (e.g. via `os.environ` or `os.getenv`). Credentials should only be passed explicitly via input arguments if required.
- **Empty File Workspace**: By default, there are **no readable files or document content** present in the sandbox workspace. Do NOT write scripts attempting to read pre-existing data files from the directory unless you are explicitly creating those files within the code or they have been uploaded and provided in the prompt context. This sandbox is strictly for executing logical computations to get answers.
- **Disposable Sandbox**: The sandbox is completely **disposable and ephemeral**. Any files created, modifications made, or in-memory variables set during a tool execution will NOT persist to subsequent tool calls. Treat each execution as a fresh, standalone run.
