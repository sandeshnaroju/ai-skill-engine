import json
import time
import subprocess
from typing import Dict, Any

class McpExecutor:
    def execute(self, tool_def: Dict[str, Any], arguments: Dict[str, Any], timeout: int = 30) -> Dict[str, Any]:
        """
        Executes a tool on an external MCP server via stdio JSON-RPC.
        """
        start_time = time.time()
        mcp_command = tool_def.get("mcp_command") or tool_def.get("command")
        tool_name = tool_def.get("name")

        if not mcp_command:
            return {
                "stdout": "",
                "stderr": "Error: No mcp_command specified in tool definition.",
                "exit_code": 1,
                "execution_time_ms": 0,
                "sandbox_type": "mcp_stdio"
            }

        # Format MCP JSON-RPC 2.0 tools/call request
        rpc_request = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments
            }
        }

        try:
            proc = subprocess.Popen(
                mcp_command,
                shell=True,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )

            input_data = json.dumps(rpc_request) + "\n"
            stdout_data, stderr_data = proc.communicate(input=input_data, timeout=timeout)
            exec_duration = int((time.time() - start_time) * 1000)

            # Try parsing JSON-RPC response
            try:
                rpc_response = json.loads(stdout_data.strip())
                if "result" in rpc_response:
                    content_items = rpc_response["result"].get("content", [])
                    output_text = "\n".join([item.get("text", "") for item in content_items if item.get("type") == "text"])
                    if not output_text:
                        output_text = json.dumps(rpc_response["result"])
                    return {
                        "stdout": output_text,
                        "stderr": stderr_data,
                        "exit_code": 0,
                        "execution_time_ms": exec_duration,
                        "sandbox_type": "mcp_stdio"
                    }
                elif "error" in rpc_response:
                    return {
                        "stdout": "",
                        "stderr": f"MCP Error: {rpc_response['error'].get('message')}",
                        "exit_code": 1,
                        "execution_time_ms": exec_duration,
                        "sandbox_type": "mcp_stdio"
                    }
            except Exception:
                pass

            return {
                "stdout": stdout_data,
                "stderr": stderr_data,
                "exit_code": proc.returncode,
                "execution_time_ms": exec_duration,
                "sandbox_type": "mcp_stdio"
            }

        except subprocess.TimeoutExpired:
            proc.kill()
            return {
                "stdout": "",
                "stderr": f"MCP tool execution timed out after {timeout} seconds.",
                "exit_code": 124,
                "execution_time_ms": timeout * 1000,
                "sandbox_type": "mcp_stdio"
            }
        except Exception as e:
            return {
                "stdout": "",
                "stderr": f"Failed to execute MCP tool: {str(e)}",
                "exit_code": 1,
                "execution_time_ms": int((time.time() - start_time) * 1000),
                "sandbox_type": "mcp_stdio"
            }

mcp_executor = McpExecutor()
