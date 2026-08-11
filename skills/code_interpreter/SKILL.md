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

### ⚠️ Network Isolation Constraint
The sandbox environment has **NO internet connection**. 
* Do NOT attempt to run `pip install` or download external packages.
* Do NOT use libraries that make HTTP/network requests (like `urllib`, `requests`, `socket`, etc.) inside your code.
