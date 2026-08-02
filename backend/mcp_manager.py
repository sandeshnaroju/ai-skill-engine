import os
import json
import time
import subprocess
import urllib.request
from typing import Dict, Any, List

class McpManager:
    def list_tools(self, server_obj) -> List[Dict[str, Any]]:
        """
        Sends tools/list JSON-RPC 2.0 request to an external MCP server.
        """
        req_payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/list",
            "params": {}
        }

        transport = (server_obj.transport or "stdio").lower()

        if transport == "stdio":
            command = server_obj.command
            if not command:
                return []

            env_vars = os.environ.copy()
            if server_obj.env:
                try:
                    custom_env = json.loads(server_obj.env)
                    if isinstance(custom_env, dict):
                        env_vars.update({k: str(v) for k, v in custom_env.items()})
                except Exception:
                    pass

            try:
                proc = subprocess.Popen(
                    command,
                    shell=True,
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    env=env_vars
                )

                input_data = json.dumps(req_payload) + "\n"
                stdout_data, stderr_data = proc.communicate(input=input_data, timeout=15)

                try:
                    resp = json.loads(stdout_data.strip())
                    if "result" in resp and "tools" in resp["result"]:
                        return resp["result"]["tools"]
                except Exception:
                    pass
            except Exception as e:
                print(f"Failed to list tools from MCP server {server_obj.name}: {e}")
                return []

        elif transport in ["sse", "http"]:
            url = server_obj.url
            if not url:
                return []

            try:
                data = json.dumps(req_payload).encode("utf-8")
                req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
                with urllib.request.urlopen(req, timeout=15) as res:
                    resp = json.loads(res.read().decode("utf-8"))
                    if "result" in resp and "tools" in resp["result"]:
                        return resp["result"]["tools"]
            except Exception as e:
                print(f"Failed to list tools from HTTP MCP server {server_obj.name}: {e}")
                return []

        return []

    def call_tool(self, server_obj, tool_name: str, arguments: Dict[str, Any], timeout: int = 30) -> Dict[str, Any]:
        """
        Sends tools/call JSON-RPC 2.0 request to an external MCP server.
        """
        start_time = time.time()
        req_payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments
            }
        }

        transport = (server_obj.transport or "stdio").lower()

        if transport == "stdio":
            command = server_obj.command
            env_vars = os.environ.copy()
            if server_obj.env:
                try:
                    custom_env = json.loads(server_obj.env)
                    if isinstance(custom_env, dict):
                        env_vars.update({k: str(v) for k, v in custom_env.items()})
                except Exception:
                    pass

            try:
                proc = subprocess.Popen(
                    command,
                    shell=True,
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    env=env_vars
                )

                input_data = json.dumps(req_payload) + "\n"
                stdout_data, stderr_data = proc.communicate(input=input_data, timeout=timeout)
                exec_duration = int((time.time() - start_time) * 1000)

                try:
                    resp = json.loads(stdout_data.strip())
                    if "result" in resp:
                        content_items = resp["result"].get("content", [])
                        output_text = "\n".join([item.get("text", "") for item in content_items if item.get("type") == "text"])
                        if not output_text:
                            output_text = json.dumps(resp["result"])
                        return {
                            "stdout": output_text,
                            "stderr": stderr_data,
                            "exit_code": 0,
                            "execution_time_ms": exec_duration,
                            "sandbox_type": f"mcp_server_{server_obj.name}"
                        }
                    elif "error" in resp:
                        return {
                            "stdout": "",
                            "stderr": f"MCP Error: {resp['error'].get('message')}",
                            "exit_code": 1,
                            "execution_time_ms": exec_duration,
                            "sandbox_type": f"mcp_server_{server_obj.name}"
                        }
                except Exception:
                    pass

                return {
                    "stdout": stdout_data,
                    "stderr": stderr_data,
                    "exit_code": proc.returncode,
                    "execution_time_ms": exec_duration,
                    "sandbox_type": f"mcp_server_{server_obj.name}"
                }

            except Exception as e:
                return {
                    "stdout": "",
                    "stderr": f"Error calling MCP server {server_obj.name}: {str(e)}",
                    "exit_code": 1,
                    "execution_time_ms": int((time.time() - start_time) * 1000),
                    "sandbox_type": f"mcp_server_{server_obj.name}"
                }

        elif transport in ["sse", "http"]:
            url = server_obj.url
            try:
                data = json.dumps(req_payload).encode("utf-8")
                req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
                with urllib.request.urlopen(req, timeout=timeout) as res:
                    resp = json.loads(res.read().decode("utf-8"))
                    exec_duration = int((time.time() - start_time) * 1000)
                    if "result" in resp:
                        content_items = resp["result"].get("content", [])
                        output_text = "\n".join([item.get("text", "") for item in content_items if item.get("type") == "text"])
                        if not output_text:
                            output_text = json.dumps(resp["result"])
                        return {
                            "stdout": output_text,
                            "stderr": "",
                            "exit_code": 0,
                            "execution_time_ms": exec_duration,
                            "sandbox_type": f"mcp_server_{server_obj.name}"
                        }
                    elif "error" in resp:
                        return {
                            "stdout": "",
                            "stderr": f"MCP Error: {resp['error'].get('message')}",
                            "exit_code": 1,
                            "execution_time_ms": exec_duration,
                            "sandbox_type": f"mcp_server_{server_obj.name}"
                        }
            except Exception as e:
                return {
                    "stdout": "",
                    "stderr": f"Error calling HTTP MCP server {server_obj.name}: {str(e)}",
                    "exit_code": 1,
                    "execution_time_ms": int((time.time() - start_time) * 1000),
                    "sandbox_type": f"mcp_server_{server_obj.name}"
                }

        return {
            "stdout": "",
            "stderr": f"Unsupported MCP transport: {transport}",
            "exit_code": 1,
            "execution_time_ms": 0,
            "sandbox_type": f"mcp_server_{server_obj.name}"
        }

mcp_manager = McpManager()
