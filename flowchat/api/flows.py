import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_session
from db.models import Flow, FlowVersion

router = APIRouter(prefix="/flows", tags=["flows"])


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class FlowSummary(BaseModel):
    id: str
    name: str
    description: str

    model_config = {"from_attributes": True}


class FlowCreate(BaseModel):
    id: str
    name: str
    description: str = ""
    definition: Dict[str, Any]
    start_node: str


class FlowUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    definition: Optional[Dict[str, Any]] = None
    start_node: Optional[str] = None
    comment: str = ""


class FlowDetail(BaseModel):
    id: str
    name: str
    description: str
    definition: Dict[str, Any]
    start_node: str

    model_config = {"from_attributes": True}


class VersionSummary(BaseModel):
    id: int
    version_num: int
    saved_at: str
    comment: str


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_or_404(flow_id: str, session: AsyncSession) -> Flow:
    result = await session.execute(
        select(Flow).where(Flow.id == flow_id, Flow.is_deleted == False)
    )
    flow = result.scalar_one_or_none()
    if not flow:
        raise HTTPException(status_code=404, detail=f"Flow '{flow_id}' not found")
    return flow


async def _next_version(flow_id: str, session: AsyncSession) -> int:
    result = await session.execute(
        select(FlowVersion).where(FlowVersion.flow_id == flow_id)
    )
    versions = result.scalars().all()
    return len(versions) + 1


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=List[FlowSummary])
async def list_flows(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Flow).where(Flow.is_deleted == False))
    flows = result.scalars().all()
    return [FlowSummary(id=f.id, name=f.name, description=f.description) for f in flows]


@router.post("", response_model=FlowDetail, status_code=201)
async def create_flow(body: FlowCreate, session: AsyncSession = Depends(get_session)):
    existing = await session.get(Flow, body.id)
    if existing and not existing.is_deleted:
        raise HTTPException(status_code=409, detail=f"Flow '{body.id}' already exists")
    flow = Flow(
        id=body.id,
        name=body.name,
        description=body.description,
        definition=body.definition,
        start_node=body.start_node,
    )
    session.add(flow)
    await session.commit()
    await session.refresh(flow)
    return FlowDetail(id=flow.id, name=flow.name, description=flow.description,
                      definition=flow.definition, start_node=flow.start_node)


@router.get("/{flow_id}", response_model=FlowDetail)
async def get_flow(flow_id: str, session: AsyncSession = Depends(get_session)):
    flow = await _get_or_404(flow_id, session)
    return FlowDetail(id=flow.id, name=flow.name, description=flow.description,
                      definition=flow.definition, start_node=flow.start_node)


@router.put("/{flow_id}", response_model=FlowDetail)
async def update_flow(flow_id: str, body: FlowUpdate, session: AsyncSession = Depends(get_session)):
    flow = await _get_or_404(flow_id, session)

    # Save current version before overwriting
    version_num = await _next_version(flow_id, session)
    version = FlowVersion(
        flow_id=flow_id,
        version_num=version_num,
        definition=flow.definition,
        comment=body.comment or f"Auto-save before update #{version_num}",
    )
    session.add(version)

    if body.name is not None:
        flow.name = body.name
    if body.description is not None:
        flow.description = body.description
    if body.definition is not None:
        flow.definition = body.definition
    if body.start_node is not None:
        flow.start_node = body.start_node

    await session.commit()
    await session.refresh(flow)
    return FlowDetail(id=flow.id, name=flow.name, description=flow.description,
                      definition=flow.definition, start_node=flow.start_node)


@router.delete("/{flow_id}", status_code=204)
async def delete_flow(flow_id: str, session: AsyncSession = Depends(get_session)):
    flow = await _get_or_404(flow_id, session)
    flow.is_deleted = True
    await session.commit()
    return Response(status_code=204)


@router.get("/{flow_id}/versions", response_model=List[VersionSummary])
async def list_versions(flow_id: str, session: AsyncSession = Depends(get_session)):
    await _get_or_404(flow_id, session)
    result = await session.execute(
        select(FlowVersion).where(FlowVersion.flow_id == flow_id)
    )
    versions = result.scalars().all()
    return [
        VersionSummary(
            id=v.id,
            version_num=v.version_num,
            saved_at=v.saved_at.isoformat() if v.saved_at else "",
            comment=v.comment,
        )
        for v in versions
    ]


@router.post("/{flow_id}/export")
async def export_flow(flow_id: str, session: AsyncSession = Depends(get_session)):
    flow = await _get_or_404(flow_id, session)
    content = json.dumps(flow.definition, indent=2)
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{flow_id}.json"'},
    )


@router.post("/{flow_id}/duplicate", response_model=FlowDetail, status_code=201)
async def duplicate_flow(flow_id: str, session: AsyncSession = Depends(get_session)):
    flow = await _get_or_404(flow_id, session)
    new_id = f"{flow_id}_copy"
    # Ensure unique id
    counter = 1
    candidate = new_id
    while await session.get(Flow, candidate):
        candidate = f"{new_id}_{counter}"
        counter += 1

    new_flow = Flow(
        id=candidate,
        name=f"{flow.name} (Copy)",
        description=flow.description,
        definition=flow.definition,
        start_node=flow.start_node,
    )
    session.add(new_flow)
    await session.commit()
    await session.refresh(new_flow)
    return FlowDetail(id=new_flow.id, name=new_flow.name, description=new_flow.description,
                      definition=new_flow.definition, start_node=new_flow.start_node)
