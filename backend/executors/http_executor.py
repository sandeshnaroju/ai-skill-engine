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
            parsed_url = httpx.URL(url)
            req_params = arguments

            if method in ["GET", "DELETE"]:
                parsed_url = parsed_url.copy_merge_params(arguments or {})
                req_params = None

            with httpx.Client(timeout=timeout) as client:
                if method == "GET":
                    res = client.get(parsed_url, headers=headers)
                elif method in ["POST", "PUT", "PATCH"]:
                    res = client.request(method, parsed_url, json=req_params, headers=headers)
                elif method == "DELETE":
                    res = client.delete(parsed_url, headers=headers)
                else:
                    res = client.request(method, parsed_url, params=req_params, headers=headers)

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
