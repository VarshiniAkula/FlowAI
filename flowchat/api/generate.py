from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from generation.flow_generator import generate_flow

router = APIRouter(prefix="/generate", tags=["generate"])


class GenerateFlowRequest(BaseModel):
    prompt: str
    doc_ids: Optional[List[str]] = None
    doc_summaries: Optional[str] = None


class GenerateFlowResponse(BaseModel):
    flow: Dict[str, Any]


@router.post("/flow", response_model=GenerateFlowResponse)
async def generate_flow_endpoint(body: GenerateFlowRequest):
    try:
        flow = await generate_flow(
            prompt=body.prompt,
            doc_ids=body.doc_ids,
            doc_summaries=body.doc_summaries,
        )
        return GenerateFlowResponse(flow=flow)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
