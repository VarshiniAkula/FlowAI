"""API endpoints for RASA file generation, training, and assistant management."""
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from rasa_gen.generator import generate_rasa_files
from rasa_gen.file_writer import (
    write_rasa_files,
    read_rasa_files,
    update_rasa_file,
    list_projects,
    delete_project,
)
from rasa_gen.trainer import (
    train_model,
    launch_assistant,
    stop_assistant,
    get_running_assistants,
)

router = APIRouter(prefix="/rasa", tags=["rasa"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class StoryRequest(BaseModel):
    story: str  # Plain English description of the assistant
    project_id: Optional[str] = None
    rag_context: Optional[str] = None


class GenerateResponse(BaseModel):
    project_id: str
    files: Dict[str, str]
    warnings: List[str]


class ProjectSummary(BaseModel):
    project_id: str


class FileUpdateRequest(BaseModel):
    file_key: str  # nlu, stories, rules, domain, config, endpoints, actions
    content: str


class TrainRequest(BaseModel):
    project_id: str


class TrainResponse(BaseModel):
    success: bool
    model_path: Optional[str] = None
    return_code: int
    logs: List[str]


class LaunchRequest(BaseModel):
    project_id: str
    port: int = 5005


class LaunchResponse(BaseModel):
    success: bool
    port: int
    pid: Optional[int] = None
    message: str


# ── Training status tracking ────────────────────────────────────────────────

_training_status: Dict[str, Dict[str, Any]] = {}


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/generate", response_model=GenerateResponse)
async def generate_from_story(body: StoryRequest):
    """Generate RASA files from a plain English story."""
    try:
        result = await generate_rasa_files(
            user_story=body.story,
            rag_context=body.rag_context,
        )

        project_id = body.project_id or f"assistant_{uuid.uuid4().hex[:8]}"
        write_rasa_files(project_id, result["files"])

        return GenerateResponse(
            project_id=project_id,
            files=result["files"],
            warnings=result.get("warnings", []),
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/projects", response_model=List[ProjectSummary])
async def list_rasa_projects():
    """List all RASA projects."""
    projects = list_projects()
    return [ProjectSummary(project_id=p) for p in projects]


@router.get("/projects/{project_id}/files")
async def get_project_files(project_id: str):
    """Get all RASA files for a project."""
    try:
        files = read_rasa_files(project_id)
        return {"project_id": project_id, "files": files}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")


@router.put("/projects/{project_id}/files")
async def update_project_file(project_id: str, body: FileUpdateRequest):
    """Update a single RASA file in a project."""
    try:
        update_rasa_file(project_id, body.file_key, body.content)
        return {"success": True, "file_key": body.file_key}
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/projects/{project_id}", status_code=204)
async def delete_rasa_project(project_id: str):
    """Delete a RASA project and its files."""
    from fastapi import Response
    delete_project(project_id)
    stop_assistant(project_id)
    return Response(status_code=204)


@router.post("/train", response_model=TrainResponse)
async def train_rasa_model(body: TrainRequest):
    """Train a RASA model for a project (synchronous — waits for completion)."""
    _training_status[body.project_id] = {"status": "training", "logs": []}

    async def log_callback(line: str):
        _training_status[body.project_id]["logs"].append(line)

    try:
        result = await train_model(body.project_id, on_log=log_callback)
        _training_status[body.project_id]["status"] = "done" if result["success"] else "failed"
        return TrainResponse(**result)
    except FileNotFoundError as exc:
        _training_status[body.project_id]["status"] = "failed"
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/train/{project_id}/status")
async def get_training_status(project_id: str):
    """Get the training status and logs for a project."""
    status = _training_status.get(project_id, {"status": "unknown", "logs": []})
    return status


@router.post("/launch", response_model=LaunchResponse)
async def launch_rasa_assistant(body: LaunchRequest):
    """Launch a trained RASA assistant."""
    try:
        result = await launch_assistant(body.project_id, port=body.port)
        return LaunchResponse(**result)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/stop/{project_id}")
async def stop_rasa_assistant(project_id: str):
    """Stop a running assistant."""
    result = stop_assistant(project_id)
    return result


@router.get("/running")
async def list_running_assistants():
    """List all running RASA assistants."""
    return get_running_assistants()
