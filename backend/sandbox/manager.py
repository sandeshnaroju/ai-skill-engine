from .docker_runner import DockerRunner
from .process_runner import ProcessRunner
from .remote_runner import remote_runner

class SandboxManager:
    def __init__(self, force_process: bool = False):
        self.docker_runner = DockerRunner()
        self.process_runner = ProcessRunner()
        self.force_process = force_process

    def execute(self, command: str, code: str = None, timeout: int = 30, session_id: str = None) -> dict:
        # Check if there is an active remote sandbox provider configured
        try:
            from database import SessionLocal
            from models import SandboxConfig
            from encryption_utils import decrypt_key

            db = SessionLocal()
            config = db.query(SandboxConfig).filter(SandboxConfig.is_active == True).first()
            db.close()

            if config and config.provider != "none":
                provider = config.provider
                print(f"INFO: Routing code execution to remote sandbox provider: {provider}")

                if provider == "e2b":
                    api_key = decrypt_key(config.e2b_api_key_encrypted)
                    if not api_key:
                        return {
                            "stdout": "",
                            "stderr": "Error: E2B Sandbox is active but API key is not configured.",
                            "exit_code": 1,
                            "execution_time_ms": 0,
                            "sandbox_type": "e2b"
                        }
                    return remote_runner.execute_e2b(api_key, command, code, timeout)

                elif provider == "azure":
                    client_id = decrypt_key(config.azure_client_id_encrypted)
                    client_secret = decrypt_key(config.azure_client_secret_encrypted)
                    tenant_id = decrypt_key(config.azure_tenant_id_encrypted)
                    pool_endpoint = config.azure_session_pool_endpoint
                    if not (client_id and client_secret and tenant_id and pool_endpoint):
                        return {
                            "stdout": "",
                            "stderr": "Error: Azure ACA Sandbox is active but dynamic session credentials/endpoint are incomplete.",
                            "exit_code": 1,
                            "execution_time_ms": 0,
                            "sandbox_type": "azure_aca"
                        }
                    return remote_runner.execute_azure(client_id, client_secret, tenant_id, pool_endpoint, command, code, timeout, session_id=session_id)

                elif provider == "fly":
                    api_token = decrypt_key(config.fly_api_token_encrypted)
                    app_name = config.fly_app_name
                    if not (api_token and app_name):
                        return {
                            "stdout": "",
                            "stderr": "Error: Fly.io Sandbox is active but API token or app name is not configured.",
                            "exit_code": 1,
                            "execution_time_ms": 0,
                            "sandbox_type": "fly_io"
                        }
                    return remote_runner.execute_fly(api_token, app_name, command, code, timeout)

                elif provider == "lambda":
                    access_key = decrypt_key(config.aws_access_key_encrypted)
                    secret_key = decrypt_key(config.aws_secret_key_encrypted)
                    region = config.aws_region
                    func_name = config.aws_function_name
                    if not (access_key and secret_key and func_name):
                        return {
                            "stdout": "",
                            "stderr": "Error: AWS Lambda Sandbox is active but AWS access keys or function name are incomplete.",
                            "exit_code": 1,
                            "execution_time_ms": 0,
                            "sandbox_type": "aws_lambda"
                        }
                    return remote_runner.execute_lambda(access_key, secret_key, region, func_name, command, code, timeout)

        except Exception as db_err:
            print(f"WARNING: Failed to query SandboxConfig database: {db_err}")

        # Fallback to local Docker (if available) or local process ONLY if provider is "none"
        if not self.force_process and self.docker_runner.is_available():
            return self.docker_runner.execute(command, code, timeout)
        return self.process_runner.execute(command, code, timeout)

sandbox_manager = SandboxManager()
