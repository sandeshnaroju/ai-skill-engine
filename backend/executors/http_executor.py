import time
import httpx

class HttpExecutor:
    def execute(self, tool_def: dict, arguments: dict, timeout: int = 15) -> dict:
        start_time = time.time()
        url = tool_def.get("url")
        method = (tool_def.get("method") or "GET").upper()
        headers = tool_def.get("headers") or {}
        
        if not url:
            return {
                "stdout": "",
                "stderr": "Error: REST API tool definition missing 'url' parameter.",
                "exit_code": 1,
                "execution_time_ms": 0,
                "sandbox_type": "http_api"
            }

        try:
            with httpx.Client(timeout=timeout) as client:
                if method == "GET":
                    res = client.get(url, params=arguments, headers=headers)
                elif method in ["POST", "PUT", "PATCH"]:
                    res = client.request(method, url, json=arguments, headers=headers)
                elif method == "DELETE":
                    res = client.delete(url, params=arguments, headers=headers)
                else:
                    res = client.request(method, url, params=arguments, headers=headers)

                elapsed_ms = int((time.time() - start_time) * 1000)

                return {
                    "stdout": res.text,
                    "stderr": "" if res.is_success else f"HTTP Status {res.status_code}",
                    "exit_code": 0 if res.is_success else 1,
                    "execution_time_ms": elapsed_ms,
                    "sandbox_type": "http_api"
                }

        except Exception as e:
            elapsed_ms = int((time.time() - start_time) * 1000)
            return {
                "stdout": "",
                "stderr": f"REST API Execution Error: {str(e)}",
                "exit_code": 1,
                "execution_time_ms": elapsed_ms,
                "sandbox_type": "http_api"
            }

http_executor = HttpExecutor()
