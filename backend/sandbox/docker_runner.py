import os
import time
import shutil
import tempfile
import subprocess

class DockerRunner:
    def __init__(self, image: str = "ai-sandbox-python:latest", base_sandbox_dir: str = None):
        self.image = image
        if not base_sandbox_dir:
            base_sandbox_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "sandbox")
        self.base_sandbox_dir = base_sandbox_dir
        os.makedirs(self.base_sandbox_dir, exist_ok=True)

    def is_available(self) -> bool:
        if not shutil.which("docker"):
            return False
        try:
            res = subprocess.run(["docker", "info"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=3)
            return res.returncode == 0
        except Exception:
            return False

    def _get_image(self) -> str:
        if self.image == "ai-sandbox-python:latest":
            try:
                res = subprocess.run(["docker", "image", "inspect", "ai-sandbox-python:latest"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=2)
                if res.returncode == 0:
                    return "ai-sandbox-python:latest"
            except Exception:
                pass
            return "python:3.11-slim"
        return self.image

    def execute(self, command: str, code: str = None, timeout: int = 30) -> dict:
        start_time = time.time()
        temp_dir = tempfile.mkdtemp(dir=self.base_sandbox_dir, prefix="docker_sb_")
        
        try:
            cmd_to_run = command
            if code:
                script_path = os.path.join(temp_dir, "script.py")
                with open(script_path, "w", encoding="utf-8") as f:
                    f.write(code)
                cmd_to_run = f"python /workspace/script.py"

            # Ensure uploads directory exists on host
            os.makedirs(os.path.join(self.base_sandbox_dir, "uploads"), exist_ok=True)
            # Pre-create the subdirectories inside the host's temp_dir to prevent Docker volume mount failures
            os.makedirs(os.path.join(temp_dir, "sandbox", "uploads"), exist_ok=True)

            # If running inside a container, translate container paths to host paths for sibling containers
            host_sandbox_dir = os.environ.get("HOST_SANDBOX_DIR")
            if host_sandbox_dir:
                host_temp_dir = temp_dir.replace(self.base_sandbox_dir, host_sandbox_dir)
                host_uploads_dir = os.path.join(host_sandbox_dir, "uploads")
            else:
                host_temp_dir = temp_dir
                host_uploads_dir = os.path.join(self.base_sandbox_dir, "uploads")

            docker_cmd = [
                "docker", "run", "--rm",
                "-v", f"{host_temp_dir}:/workspace:rw",
                "-v", f"{host_uploads_dir}:/workspace/sandbox/uploads:ro",
                "-w", "/workspace",
                "--network", "none",
                "--memory", "512m",
                "--cpus", "1.0",
                self._get_image(),
                "sh", "-c", cmd_to_run
            ]

            res = subprocess.run(
                docker_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=timeout
            )
            elapsed_ms = int((time.time() - start_time) * 1000)

            # Detect and capture any files generated in the workspace
            generated_files = []
            for root, _, files in os.walk(temp_dir):
                for file in files:
                    if file == "script.py":
                        continue
                    src_path = os.path.join(root, file)
                    if os.path.isfile(src_path) and not os.path.islink(src_path):
                        import uuid
                        unique_name = f"{uuid.uuid4().hex}_{file}"
                        outputs_dir = os.path.join(self.base_sandbox_dir, "outputs")
                        os.makedirs(outputs_dir, exist_ok=True)
                        dest_path = os.path.join(outputs_dir, unique_name)
                        shutil.copy2(src_path, dest_path)
                        generated_files.append({
                            "filename": unique_name,
                            "original_name": file,
                            "url": f"/api/v1/files/download/{unique_name}",
                            "sandbox_path": f"sandbox/outputs/{unique_name}"
                        })

            return {
                "stdout": res.stdout,
                "stderr": res.stderr,
                "exit_code": res.returncode,
                "execution_time_ms": elapsed_ms,
                "sandbox_type": "docker",
                "generated_files": generated_files
            }

        except subprocess.TimeoutExpired:
            elapsed_ms = int((time.time() - start_time) * 1000)
            return {
                "stdout": "",
                "stderr": f"Error: Command timed out after {timeout} seconds in Docker sandbox.",
                "exit_code": 124,
                "execution_time_ms": elapsed_ms,
                "sandbox_type": "docker"
            }
        except Exception as e:
            elapsed_ms = int((time.time() - start_time) * 1000)
            return {
                "stdout": "",
                "stderr": f"Docker Sandbox Error: {str(e)}",
                "exit_code": 1,
                "execution_time_ms": elapsed_ms,
                "sandbox_type": "docker"
            }
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)
