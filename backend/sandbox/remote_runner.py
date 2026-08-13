import os
import json
import time
import httpx
import uuid
import boto3
import msal

class RemoteRunner:
    def execute_e2b(self, api_key: str, command: str, code: str = None, timeout: int = 30) -> dict:
        start_time = time.time()
        try:
            # Set the API key env var for E2B SDK
            os.environ["E2B_API_KEY"] = api_key
            from e2b_code_interpreter import Sandbox

            # If there's no code but a command, we construct python equivalent or run bash command
            # But usually LLMs call python code execution.
            code_to_run = code or f"import subprocess; print(subprocess.check_output({json.dumps(command)}, shell=True).decode('utf-8'))"

            with Sandbox() as sandbox:
                execution = sandbox.run_code(code_to_run)
                elapsed_ms = int((time.time() - start_time) * 1000)

                # Collect outputs
                stdout = execution.text
                stderr = ""
                if execution.error:
                    stderr = f"{execution.error.name}: {execution.error.value}\n{execution.error.traceback}"

                # E2B doesn't have traditional exit codes but 0 for success, 1 for error
                exit_code = 1 if execution.error else 0

                # Capture generated files from E2B
                generated_files = []
                for result in execution.results:
                    if hasattr(result, "formats"):
                        # If E2B generated charts or plots, they are available in formats (e.g. png, svg)
                        for fmt in result.formats():
                            data_base64 = getattr(result, fmt)
                            import base64
                            file_data = base64.b64decode(data_base64)
                            unique_name = f"{uuid.uuid4().hex}_output.{fmt}"
                            
                            # Save to outputs directory
                            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
                            outputs_dir = os.path.join(base_dir, "sandbox", "outputs")
                            os.makedirs(outputs_dir, exist_ok=True)
                            
                            with open(os.path.join(outputs_dir, unique_name), "wb") as f:
                                f.write(file_data)
                                
                            generated_files.append({
                                "filename": unique_name,
                                "original_name": f"output.{fmt}",
                                "url": f"/api/v1/files/download/{unique_name}",
                                "sandbox_path": f"sandbox/outputs/{unique_name}"
                            })

                return {
                    "stdout": stdout,
                    "stderr": stderr,
                    "exit_code": exit_code,
                    "execution_time_ms": elapsed_ms,
                    "sandbox_type": "e2b",
                    "generated_files": generated_files
                }
        except Exception as e:
            elapsed_ms = int((time.time() - start_time) * 1000)
            return {
                "stdout": "",
                "stderr": f"E2B Remote Sandbox Error: {str(e)}",
                "exit_code": 1,
                "execution_time_ms": elapsed_ms,
                "sandbox_type": "e2b"
            }

    def execute_azure(self, client_id: str, client_secret: str, tenant_id: str, pool_endpoint: str, command: str, code: str = None, timeout: int = 30, session_id: str = None) -> dict:
        start_time = time.time()
        try:
            # 1. Authenticate with Microsoft Entra ID
            app = msal.ConfidentialClientApplication(
                client_id,
                authority=f"https://login.microsoftonline.com/{tenant_id}",
                client_credential=client_secret
            )
            auth_result = app.acquire_token_for_client(scopes=["https://dynamicsessions.io/.default"])
            
            if "access_token" not in auth_result:
                raise Exception(f"Failed to acquire Microsoft Entra token: {auth_result.get('error_description', auth_result.get('error'))}")
                
            token = auth_result["access_token"]
            
            # 2. Invoke Azure Container Apps Dynamic Session REST API
            active_session_id = session_id or uuid.uuid4().hex
            api_version = "2024-02-02-preview"
            
            code_to_run = code or f"import subprocess; print(subprocess.check_output({json.dumps(command)}, shell=True).decode('utf-8'))"
            
            # Strip trailing slash from pool endpoint
            base_url = pool_endpoint.rstrip("/")
            url = f"{base_url}/code/execute?api-version={api_version}&identifier={active_session_id}"
            
            payload = {
                "properties": {
                    "code": code_to_run,
                    "codeInput": code_to_run,
                    "codeInputType": "Inline",
                    "codeType": "Inline",
                    "executionType": "Synchronous"
                }
            }
            
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }
            
            with httpx.Client(timeout=timeout) as client:
                res = client.post(url, json=payload, headers=headers)
                
            elapsed_ms = int((time.time() - start_time) * 1000)
            
            if res.status_code != 200:
                raise Exception(f"Azure Dynamic Session API returned status {res.status_code}: {res.text}")
                
            res_data = res.json()
            props = res_data.get("properties", {})
            stdout = props.get("stdout", "")
            stderr = props.get("stderr", "")
            
            # Auto-download generated files from Azure Dynamic Sessions files endpoint
            generated_files = []
            try:
                list_url = f"{base_url}/files?api-version={api_version}&identifier={active_session_id}"
                with httpx.Client(timeout=10) as client:
                    list_res = client.get(list_url, headers=headers)
                if list_res.status_code == 200:
                    files_list = list_res.json().get("value", [])
                    for f in files_list:
                        f_props = f.get("properties", {})
                        filename = f_props.get("filename")
                        if not filename or filename == "script.py" or filename.startswith("."):
                            continue
                        
                        # Download the file content
                        dl_url = f"{base_url}/files/content/{filename}?api-version={api_version}&identifier={active_session_id}"
                        with httpx.Client(timeout=20) as client:
                            dl_res = client.get(dl_url, headers=headers)
                        if dl_res.status_code == 200:
                            file_data = dl_res.content
                            
                            unique_name = f"{uuid.uuid4().hex}_{filename}"
                            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
                            outputs_dir = os.path.join(base_dir, "sandbox", "outputs")
                            os.makedirs(outputs_dir, exist_ok=True)
                            
                            with open(os.path.join(outputs_dir, unique_name), "wb") as out_f:
                                out_f.write(file_data)
                                
                            generated_files.append({
                                "filename": unique_name,
                                "original_name": filename,
                                "url": f"/api/v1/files/download/{unique_name}",
                                "sandbox_path": f"sandbox/outputs/{unique_name}"
                            })
            except Exception as dl_err:
                print(f"WARNING: Failed to auto-download files from Azure Session {active_session_id}: {dl_err}")
            
            exit_code = 1 if stderr else 0
            
            return {
                "stdout": stdout,
                "stderr": stderr,
                "exit_code": exit_code,
                "execution_time_ms": elapsed_ms,
                "sandbox_type": "azure_aca",
                "generated_files": generated_files
            }
            
        except Exception as e:
            elapsed_ms = int((time.time() - start_time) * 1000)
            return {
                "stdout": "",
                "stderr": f"Azure Container Apps Sandbox Error: {str(e)}",
                "exit_code": 1,
                "execution_time_ms": elapsed_ms,
                "sandbox_type": "azure_aca"
            }

    def execute_fly(self, api_token: str, app_name: str, command: str, code: str = None, timeout: int = 30) -> dict:
        # Fly.io Machines are general VPS. Running custom code programmatically is typically done
        # by calling an API server deployed inside the Fly machine.
        # We will implement an HTTP execution router that sends the code/command to the Fly app's runner server
        start_time = time.time()
        try:
            url = f"https://{app_name}.fly.dev/execute"
            payload = {
                "command": command,
                "code": code
            }
            headers = {
                "Authorization": f"Bearer {api_token}",
                "Content-Type": "application/json"
            }
            
            with httpx.Client(timeout=timeout) as client:
                res = client.post(url, json=payload, headers=headers)
                
            elapsed_ms = int((time.time() - start_time) * 1000)
            
            if res.status_code != 200:
                raise Exception(f"Fly.io app endpoint returned status {res.status_code}: {res.text}")
                
            data = res.json()
            return {
                "stdout": data.get("stdout", ""),
                "stderr": data.get("stderr", ""),
                "exit_code": data.get("exit_code", 0),
                "execution_time_ms": elapsed_ms,
                "sandbox_type": "fly_io"
            }
        except Exception as e:
            elapsed_ms = int((time.time() - start_time) * 1000)
            return {
                "stdout": "",
                "stderr": f"Fly.io Sandbox Error: {str(e)}",
                "exit_code": 1,
                "execution_time_ms": elapsed_ms,
                "sandbox_type": "fly_io"
            }

    def execute_lambda(self, access_key: str, secret_key: str, region: str, function_name: str, command: str, code: str = None, timeout: int = 30) -> dict:
        start_time = time.time()
        try:
            # 1. Create Boto3 Lambda client
            client = boto3.client(
                "lambda",
                aws_access_key_id=access_key,
                aws_secret_access_key=secret_key,
                region_name=region or "us-east-1"
            )
            
            # 2. Invoke the Lambda function
            payload = {
                "command": command,
                "code": code
            }
            
            res = client.invoke(
                FunctionName=function_name,
                InvocationType="RequestResponse",
                Payload=json.dumps(payload)
            )
            
            elapsed_ms = int((time.time() - start_time) * 1000)
            
            res_payload = json.loads(res["Payload"].read().decode("utf-8"))
            
            return {
                "stdout": res_payload.get("stdout", ""),
                "stderr": res_payload.get("stderr", ""),
                "exit_code": res_payload.get("exit_code", 0),
                "execution_time_ms": elapsed_ms,
                "sandbox_type": "aws_lambda"
            }
        except Exception as e:
            elapsed_ms = int((time.time() - start_time) * 1000)
            return {
                "stdout": "",
                "stderr": f"AWS Lambda Sandbox Error: {str(e)}",
                "exit_code": 1,
                "execution_time_ms": elapsed_ms,
                "sandbox_type": "aws_lambda"
            }

    def list_files_azure(self, client_id: str, client_secret: str, tenant_id: str, pool_endpoint: str, session_id: str) -> list:
        app = msal.ConfidentialClientApplication(
            client_id,
            authority=f"https://login.microsoftonline.com/{tenant_id}",
            client_credential=client_secret
        )
        auth_result = app.acquire_token_for_client(scopes=["https://dynamicsessions.io/.default"])
        if "access_token" not in auth_result:
            raise Exception("Failed to acquire token for Azure files listing")
        token = auth_result["access_token"]
        
        base_url = pool_endpoint.rstrip("/")
        url = f"{base_url}/files?api-version=2024-02-02-preview&identifier={session_id}"
        headers = {"Authorization": f"Bearer {token}"}
        
        with httpx.Client() as client:
            res = client.get(url, headers=headers)
        if res.status_code != 200:
            raise Exception(f"Azure list files failed: {res.text}")
        
        files = []
        for f in res.json().get("value", []):
            f_props = f.get("properties", {})
            filename = f_props.get("filename")
            if filename:
                files.append({
                    "filename": filename,
                    "size": f_props.get("size", 0),
                    "last_modified": f_props.get("lastModifiedTime")
                })
        return files

    def download_file_azure(self, client_id: str, client_secret: str, tenant_id: str, pool_endpoint: str, session_id: str, filename: str) -> bytes:
        app = msal.ConfidentialClientApplication(
            client_id,
            authority=f"https://login.microsoftonline.com/{tenant_id}",
            client_credential=client_secret
        )
        auth_result = app.acquire_token_for_client(scopes=["https://dynamicsessions.io/.default"])
        if "access_token" not in auth_result:
            raise Exception("Failed to acquire token for Azure file download")
        token = auth_result["access_token"]
        
        base_url = pool_endpoint.rstrip("/")
        url = f"{base_url}/files/content/{filename}?api-version=2024-02-02-preview&identifier={session_id}"
        headers = {"Authorization": f"Bearer {token}"}
        
        with httpx.Client() as client:
            res = client.get(url, headers=headers)
        if res.status_code != 200:
            raise Exception(f"Azure file download failed: {res.text}")
        return res.content

    def upload_file_azure(self, client_id: str, client_secret: str, tenant_id: str, pool_endpoint: str, session_id: str, filename: str, content: bytes) -> bool:
        app = msal.ConfidentialClientApplication(
            client_id,
            authority=f"https://login.microsoftonline.com/{tenant_id}",
            client_credential=client_secret
        )
        auth_result = app.acquire_token_for_client(scopes=["https://dynamicsessions.io/.default"])
        if "access_token" not in auth_result:
            raise Exception("Failed to acquire token for Azure file upload")
        token = auth_result["access_token"]
        
        base_url = pool_endpoint.rstrip("/")
        url = f"{base_url}/files/upload?api-version=2024-02-02-preview&identifier={session_id}"
        headers = {"Authorization": f"Bearer {token}"}
        
        files = {"file": (filename, content)}
        with httpx.Client() as client:
            res = client.post(url, headers=headers, files=files)
        if res.status_code not in [200, 201]:
            raise Exception(f"Azure file upload failed: {res.text}")
        return True

remote_runner = RemoteRunner()
