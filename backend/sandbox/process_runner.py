import os
import time
import shutil
import tempfile
import subprocess

class ProcessRunner:
    def __init__(self, base_sandbox_dir: str = None):
        if not base_sandbox_dir:
            base_sandbox_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "sandbox")
        self.base_sandbox_dir = base_sandbox_dir
        os.makedirs(self.base_sandbox_dir, exist_ok=True)

    def execute(self, command: str, code: str = None, timeout: int = 30) -> dict:
        start_time = time.time()
        session_sandbox = tempfile.mkdtemp(dir=self.base_sandbox_dir, prefix="proc_sb_")
        
        try:
            # Create a symlink so sandbox/uploads/unique_filename is accessible relative to session_sandbox CWD
            sandbox_sub = os.path.join(session_sandbox, "sandbox")
            os.makedirs(sandbox_sub, exist_ok=True)
            real_uploads = os.path.join(self.base_sandbox_dir, "uploads")
            if os.path.exists(real_uploads):
                os.symlink(real_uploads, os.path.join(sandbox_sub, "uploads"))

            cmd_to_run = command
            if code:
                script_path = os.path.join(session_sandbox, "script.py")
                with open(script_path, "w", encoding="utf-8") as f:
                    f.write(code)
                import sys
                python_exec = sys.executable or "python3"
                cmd_to_run = f'"{python_exec}" "{script_path}"'

            # Scrub environment variables to prevent access to host secrets
            clean_env = {
                "PATH": "/usr/local/bin:/usr/bin:/bin",
                "HOME": session_sandbox,
                "TMPDIR": session_sandbox,
                "LANG": "C.UTF-8"
            }

            res = subprocess.run(
                cmd_to_run,
                shell=True,
                cwd=session_sandbox,
                env=clean_env,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=timeout
            )
            elapsed_ms = int((time.time() - start_time) * 1000)

            # Detect and capture any files generated in the workspace
            generated_files = []
            for root, _, files in os.walk(session_sandbox):
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
                "sandbox_type": "process",
                "generated_files": generated_files
            }

        except subprocess.TimeoutExpired:
            elapsed_ms = int((time.time() - start_time) * 1000)
            return {
                "stdout": "",
                "stderr": f"Error: Command timed out after {timeout} seconds in Process sandbox.",
                "exit_code": 124,
                "execution_time_ms": elapsed_ms,
                "sandbox_type": "process"
            }
        except Exception as e:
            elapsed_ms = int((time.time() - start_time) * 1000)
            return {
                "stdout": "",
                "stderr": f"Process Sandbox Error: {str(e)}",
                "exit_code": 1,
                "execution_time_ms": elapsed_ms,
                "sandbox_type": "process"
            }
        finally:
            shutil.rmtree(session_sandbox, ignore_errors=True)
