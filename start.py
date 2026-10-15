from __future__ import annotations

import os
import shlex
import signal
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "cleaning-platform"
FRONTEND = ROOT / "cleaning-frontend"
ENV_FILE = BACKEND / ".env"
IS_WINDOWS = sys.platform == "win32"

COLORS = {
    "DOCKER": "\033[36m",
    "MIGRATE": "\033[36m",
    "FUNC": "\033[35m",
    "SSE": "\033[34m",
    "CONSUMER": "\033[33m",
    "RELAY": "\033[33m",
    "FRONT": "\033[32m",
    "ERROR": "\033[31m",
}
RESET = "\033[0m"

processes: list[tuple[str, subprocess.Popen[bytes]]] = []


def log(prefix: str, line: str) -> None:
    print(f"{COLORS.get(prefix, '')}[{prefix}]{RESET} {line}", flush=True)


def read_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def venv_python() -> Path:
    candidate = BACKEND / ("venv/Scripts/python.exe" if IS_WINDOWS else "venv/bin/python")
    if candidate.exists():
        return candidate
    log("FUNC", f"venv not found at {candidate}, using {sys.executable}")
    return Path(sys.executable)


def stream(name: str, proc: subprocess.Popen[bytes]) -> None:
    assert proc.stdout is not None
    for line in iter(proc.stdout.readline, b""):
        log(name, line.decode("utf-8", errors="replace").rstrip())


def start(name: str, command: list[str], cwd: Path, env: dict[str, str]) -> None:
    proc = subprocess.Popen(command, cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    processes.append((name, proc))
    threading.Thread(target=stream, args=(name, proc), daemon=True).start()
    log(name, f"started: {shlex.join(command)} (pid={proc.pid})")


def run(name: str, command: list[str], cwd: Path, env: dict[str, str]) -> None:
    log(name, shlex.join(command))
    result = subprocess.run(command, cwd=cwd, env=env, check=False)
    if result.returncode != 0:
        log("ERROR", f"{name} failed with exit code {result.returncode}")
        sys.exit(result.returncode)


def wait_for(url: str, name: str, timeout: float = 90) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2):
                log(name, "ready")
                return
        except OSError:
            time.sleep(2)
    log("ERROR", f"{name} did not become ready at {url}")


def shutdown(signum: int | None = None, frame: object = None) -> None:
    print("\nShutting down...", flush=True)
    for _, proc in processes:
        proc.terminate()
    for _, proc in processes:
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
    sys.exit(0)


def main() -> None:
    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    file_env = read_env_file(ENV_FILE)
    missing = [key for key in ("JWT_SECRET", "JWT_REFRESH_SECRET") if not (file_env.get(key) or os.environ.get(key))]
    if missing:
        log("ERROR", f"Set {', '.join(missing)} in {ENV_FILE} (see .env.example)")
        sys.exit(1)

    python = venv_python()
    env = {**os.environ, **file_env, "PYTHONPATH": str(BACKEND)}
    env["PATH"] = os.pathsep.join([str(python.parent), env.get("PATH", "")])
    env["languageWorkers__python__defaultExecutablePath"] = str(python)

    run("DOCKER", ["docker", "compose", "up", "-d", "--wait", "postgres", "rabbitmq", "azurite"], ROOT, env)
    run("MIGRATE", [str(python), "-m", "alembic", "upgrade", "head"], BACKEND, env)

    start("FUNC", ["func", "start"], BACKEND, env)
    start("SSE", [str(python), "sse_server.py"], BACKEND, env)
    start("CONSUMER", [str(python), "-m", "src.infrastructure.messaging.consumer"], BACKEND, env)
    start("RELAY", [str(python), "-m", "src.infrastructure.messaging.relay"], BACKEND, env)
    wait_for("http://127.0.0.1:7071/api/docs", "FUNC")

    start("FRONT", ["npm.cmd" if IS_WINDOWS else "npm", "run", "dev"], FRONTEND, {**os.environ, "BROWSER": "none"})

    print("\nAll services started. Press Ctrl+C to stop.", flush=True)
    print("  Frontend: http://localhost:3000", flush=True)
    print("  API docs: http://localhost:7071/api/docs", flush=True)
    print("  RabbitMQ: http://localhost:15672\n", flush=True)

    while True:
        for name, proc in processes:
            if proc.poll() is not None:
                log("ERROR", f"{name} exited with code {proc.returncode}")
                shutdown()
        time.sleep(5)


if __name__ == "__main__":
    main()
