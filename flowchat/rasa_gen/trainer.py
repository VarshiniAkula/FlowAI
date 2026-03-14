"""Train and launch RASA models."""
import asyncio
import os
import signal
import subprocess
from pathlib import Path
from typing import Optional

from rasa_gen.file_writer import get_project_dir

MODELS_DIR = Path(__file__).resolve().parent.parent / "trained_models"

# Track running assistant processes {project_id: subprocess.Popen}
_running: dict[str, subprocess.Popen] = {}


async def train_model(project_id: str, on_log=None) -> dict:
    """Train a RASA model for a project.

    Args:
        project_id: The project to train.
        on_log: Optional async callback(line: str) for streaming log output.

    Returns:
        dict with 'success', 'model_path', and 'logs' keys.
    """
    project_dir = get_project_dir(project_id)
    if not project_dir.exists():
        raise FileNotFoundError(f"Project '{project_id}' not found")

    model_dir = MODELS_DIR / project_id
    model_dir.mkdir(parents=True, exist_ok=True)

    logs = []

    try:
        process = await asyncio.create_subprocess_exec(
            "rasa", "train",
            "--domain", str(project_dir / "domain.yml"),
            "--data", str(project_dir / "data"),
            "--config", str(project_dir / "config.yml"),
            "--out", str(model_dir),
            "--fixed-model-name", project_id,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=str(project_dir),
        )

        while True:
            line = await process.stdout.readline()
            if not line:
                break
            decoded = line.decode("utf-8", errors="replace").rstrip()
            logs.append(decoded)
            if on_log:
                await on_log(decoded)

        await process.wait()

        model_path = model_dir / f"{project_id}.tar.gz"
        success = process.returncode == 0 and model_path.exists()

        return {
            "success": success,
            "model_path": str(model_path) if success else None,
            "return_code": process.returncode,
            "logs": logs,
        }

    except FileNotFoundError:
        return {
            "success": False,
            "model_path": None,
            "return_code": -1,
            "logs": ["ERROR: 'rasa' command not found. Install RASA: pip install rasa"],
        }


async def launch_assistant(project_id: str, port: int = 5005) -> dict:
    """Launch a RASA assistant on a specified port.

    Returns dict with 'success', 'port', 'pid'.
    """
    if project_id in _running:
        proc = _running[project_id]
        if proc.poll() is None:
            return {
                "success": True,
                "port": port,
                "pid": proc.pid,
                "message": "Already running",
            }
        else:
            del _running[project_id]

    model_dir = MODELS_DIR / project_id
    model_path = model_dir / f"{project_id}.tar.gz"

    if not model_path.exists():
        raise FileNotFoundError(
            f"No trained model found for '{project_id}'. Train first."
        )

    project_dir = get_project_dir(project_id)

    try:
        proc = subprocess.Popen(
            [
                "rasa", "run",
                "--model", str(model_path),
                "--endpoints", str(project_dir / "endpoints.yml"),
                "--port", str(port),
                "--cors", "*",
                "--enable-api",
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            cwd=str(project_dir),
        )

        _running[project_id] = proc

        # Wait briefly to check if it started
        await asyncio.sleep(2)
        if proc.poll() is not None:
            output = proc.stdout.read().decode("utf-8", errors="replace")
            return {
                "success": False,
                "port": port,
                "pid": None,
                "message": f"Failed to start: {output[:500]}",
            }

        return {
            "success": True,
            "port": port,
            "pid": proc.pid,
            "message": f"Assistant running at http://localhost:{port}",
        }

    except FileNotFoundError:
        return {
            "success": False,
            "port": port,
            "pid": None,
            "message": "ERROR: 'rasa' command not found. Install RASA: pip install rasa",
        }


def stop_assistant(project_id: str) -> dict:
    """Stop a running assistant."""
    if project_id not in _running:
        return {"success": False, "message": "Not running"}

    proc = _running[project_id]
    if proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()

    del _running[project_id]
    return {"success": True, "message": "Stopped"}


def get_running_assistants() -> dict:
    """Return status of all running assistants."""
    result = {}
    to_remove = []
    for pid, proc in _running.items():
        if proc.poll() is None:
            result[pid] = {"pid": proc.pid, "status": "running"}
        else:
            result[pid] = {"pid": proc.pid, "status": "stopped"}
            to_remove.append(pid)
    for pid in to_remove:
        del _running[pid]
    return result
