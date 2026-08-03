from .docker_runner import DockerRunner
from .process_runner import ProcessRunner

class SandboxManager:
    def __init__(self, force_process: bool = False):
        self.docker_runner = DockerRunner()
        self.process_runner = ProcessRunner()
        self.force_process = force_process

    def execute(self, command: str, code: str = None, timeout: int = 30) -> dict:
        if not self.force_process and self.docker_runner.is_available():
            return self.docker_runner.execute(command, code, timeout)
        return self.process_runner.execute(command, code, timeout)

sandbox_manager = SandboxManager()
