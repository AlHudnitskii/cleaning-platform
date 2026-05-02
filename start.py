import subprocess
import threading
import sys
import os
import time
import signal

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(BASE_DIR, "cleaning-platform")
FRONTEND_DIR = os.path.join(BASE_DIR, "cleaning-frontend")

COLORS = {
    "DOCKER": "\033[36m",
    "FUNC": "\033[35m",
    "SSE": "\033[34m",
    "CONSUMER": "\033[33m",
    "FRONT": "\033[32m",
    "RESET": "\033[0m",
}

processes = []


def log(prefix, line):
    color = COLORS.get(prefix, "")
    reset = COLORS["RESET"]
    print(f"{color}[{prefix}]{reset} {line}", flush=True)


def stream(proc, prefix):
    for line in iter(proc.stdout.readline, b""):
        log(prefix, line.decode("utf-8", errors="replace").rstrip())


def start_process(name, cmd, cwd=None, env=None):
    proc = subprocess.Popen(
        cmd,
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        shell=True,
        env=env,
    )
    processes.append(proc)
    thread = threading.Thread(target=stream, args=(proc, name), daemon=True)
    thread.start()
    log(name, f"Started (pid={proc.pid})")
    return proc


def wait_for_backend(timeout=60):
    import urllib.request
    log("FUNC", "Waiting for backend to be ready...")
    start = time.time()
    while time.time() - start < timeout:
        try:
            urllib.request.urlopen("http://localhost:7071/api/docs", timeout=2)
            log("FUNC", "Backend is ready")
            return True
        except Exception:
            time.sleep(2)
    log("FUNC", "Backend did not start in time — check [FUNC] logs above")
    return False


def shutdown(signum=None, frame=None):
    print("\n\nShutting down all processes...", flush=True)
    for proc in processes:
        try:
            proc.terminate()
        except Exception:
            pass
    time.sleep(2)
    for proc in processes:
        try:
            proc.kill()
        except Exception:
            pass
    sys.exit(0)


signal.signal(signal.SIGINT, shutdown)
signal.signal(signal.SIGTERM, shutdown)

if __name__ == "__main__":
    print("Starting Cleaning Platform...\n", flush=True)

    log("DOCKER", "Starting infrastructure...")
    docker = subprocess.run(
        ["docker-compose", "up", "-d"],
        cwd=BASE_DIR,
        capture_output=True,
        text=True,
    )
    if docker.returncode != 0:
        print(docker.stderr)
        print("Docker failed to start. Make sure Docker is running.")
        sys.exit(1)
    log("DOCKER", "Infrastructure ready")
    time.sleep(3)

    is_windows = sys.platform == "win32"

    if is_windows:
        venv_python = os.path.join(BACKEND_DIR, "venv", "Scripts", "python.exe")
        venv_bin = os.path.join(BACKEND_DIR, "venv", "Scripts")
    else:
        venv_python = os.path.join(BACKEND_DIR, "venv", "bin", "python")
        venv_bin = os.path.join(BACKEND_DIR, "venv", "bin")

    if not os.path.exists(venv_python):
        log("FUNC", f"WARNING: venv not found at {venv_python}")
        log("FUNC", "Using system python — dependencies may be missing")
        venv_python = sys.executable
        venv_bin = os.path.dirname(sys.executable)

    env = os.environ.copy()
    if is_windows:
        env["PATH"] = venv_bin + ";" + env.get("PATH", "")
    else:
        env["PATH"] = venv_bin + ":" + env.get("PATH", "")
    env["PYTHONPATH"] = BACKEND_DIR

    log("FUNC", f"Using python: {venv_python}")

    start_process("FUNC", "func start --host 0.0.0.0", cwd=BACKEND_DIR, env=env)
    time.sleep(5)

    start_process("SSE", f'"{venv_python}" sse_server.py', cwd=BACKEND_DIR, env=env)

    start_process(
        "CONSUMER",
        f'"{venv_python}" -m src.infrastructure.messaging.consumer',
        cwd=BACKEND_DIR,
        env=env,
    )

    wait_for_backend()

    front_env = os.environ.copy()
    front_env["HOST"] = "0.0.0.0"
    front_env["BROWSER"] = "none"

    npm_cmd = "npm.cmd start" if is_windows else "npm start"
    start_process("FRONT", npm_cmd, cwd=FRONTEND_DIR, env=front_env)

    print("\nAll services started. Press Ctrl+C to stop.\n", flush=True)
    print("  Frontend:  http://localhost:3000", flush=True)
    print("  Backend:   http://localhost:7071/api/docs", flush=True)
    print("  RabbitMQ:  http://localhost:15672", flush=True)
    print("", flush=True)

    try:
        while True:
            for proc in processes:
                if proc.poll() is not None:
                    log("ERROR", f"Process pid={proc.pid} exited with code {proc.returncode}")
            time.sleep(5)
    except KeyboardInterrupt:
        shutdown()
