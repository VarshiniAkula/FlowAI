"""Write RASA files to disk in a project directory."""
import os
from pathlib import Path
from typing import Dict

PROJECTS_DIR = Path(__file__).resolve().parent.parent / "rasa_projects"


def get_project_dir(project_id: str) -> Path:
    return PROJECTS_DIR / project_id


def write_rasa_files(project_id: str, files: Dict[str, str]) -> Path:
    """Write generated RASA files to a project directory.

    Returns the project directory path.
    """
    project_dir = get_project_dir(project_id)
    data_dir = project_dir / "data"
    actions_dir = project_dir / "actions"

    data_dir.mkdir(parents=True, exist_ok=True)
    actions_dir.mkdir(parents=True, exist_ok=True)

    # Write data files
    (data_dir / "nlu.yml").write_text(files["nlu"], encoding="utf-8")
    (data_dir / "stories.yml").write_text(files["stories"], encoding="utf-8")
    (data_dir / "rules.yml").write_text(files["rules"], encoding="utf-8")

    # Write root config files
    (project_dir / "domain.yml").write_text(files["domain"], encoding="utf-8")
    (project_dir / "config.yml").write_text(files["config"], encoding="utf-8")
    (project_dir / "endpoints.yml").write_text(files["endpoints"], encoding="utf-8")

    # Write actions
    (actions_dir / "actions.py").write_text(files["actions"], encoding="utf-8")
    (actions_dir / "__init__.py").write_text("", encoding="utf-8")

    return project_dir


def read_rasa_files(project_id: str) -> Dict[str, str]:
    """Read all RASA files from a project directory."""
    project_dir = get_project_dir(project_id)
    if not project_dir.exists():
        raise FileNotFoundError(f"Project '{project_id}' not found")

    files = {}
    data_dir = project_dir / "data"
    actions_dir = project_dir / "actions"

    for name, path in [
        ("nlu", data_dir / "nlu.yml"),
        ("stories", data_dir / "stories.yml"),
        ("rules", data_dir / "rules.yml"),
        ("domain", project_dir / "domain.yml"),
        ("config", project_dir / "config.yml"),
        ("endpoints", project_dir / "endpoints.yml"),
        ("actions", actions_dir / "actions.py"),
    ]:
        if path.exists():
            files[name] = path.read_text(encoding="utf-8")
        else:
            files[name] = ""

    return files


def update_rasa_file(project_id: str, file_key: str, content: str) -> None:
    """Update a single RASA file in a project."""
    project_dir = get_project_dir(project_id)
    data_dir = project_dir / "data"
    actions_dir = project_dir / "actions"

    path_map = {
        "nlu": data_dir / "nlu.yml",
        "stories": data_dir / "stories.yml",
        "rules": data_dir / "rules.yml",
        "domain": project_dir / "domain.yml",
        "config": project_dir / "config.yml",
        "endpoints": project_dir / "endpoints.yml",
        "actions": actions_dir / "actions.py",
    }

    path = path_map.get(file_key)
    if not path:
        raise ValueError(f"Unknown file key: {file_key}")

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def list_projects() -> list:
    """List all RASA project directories."""
    if not PROJECTS_DIR.exists():
        return []
    return [
        d.name for d in PROJECTS_DIR.iterdir()
        if d.is_dir() and (d / "domain.yml").exists()
    ]


def delete_project(project_id: str) -> None:
    """Delete a RASA project directory."""
    import shutil
    project_dir = get_project_dir(project_id)
    if project_dir.exists():
        shutil.rmtree(project_dir)
