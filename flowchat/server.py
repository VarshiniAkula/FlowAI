import json
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import select

from db.database import init_db, AsyncSessionLocal
from db.models import Flow as FlowModel
from engine import FlowEngine
from nlu import IntentClassifier

BASE_DIR = Path(__file__).resolve().parent

engine = FlowEngine()
classifier = IntentClassifier()


async def _migrate_json_flows() -> None:
    """Seed SQLite with existing JSON flows on first run."""
    flows_dir = BASE_DIR / "flows"
    if not flows_dir.exists():
        return
    async with AsyncSessionLocal() as session:
        for path in flows_dir.glob("*.json"):
            with path.open("r", encoding="utf-8") as f:
                flow_def = json.load(f)
            flow_id = flow_def["id"]
            existing = await session.get(FlowModel, flow_id)
            if not existing:
                flow = FlowModel(
                    id=flow_id,
                    name=flow_def.get("description", flow_id).replace("_", " ").title(),
                    description=flow_def.get("description", ""),
                    definition=flow_def,
                    start_node=flow_def["start_node"],
                )
                session.add(flow)
        await session.commit()


async def _load_flows_into_engine() -> None:
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(FlowModel).where(FlowModel.is_deleted == False))
        flows = result.scalars().all()
        for flow in flows:
            engine.load_from_dict(flow.definition)
        classifier.update_flows([f.id for f in flows])


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await _migrate_json_flows()
    await _load_flows_into_engine()
    yield


app = FastAPI(title="FlowAI API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Register routers ──────────────────────────────────────────────────────────
from api.flows import router as flows_router
from api.generate import router as generate_router
from api.rag import router as rag_router
from api.rasa import router as rasa_router

app.include_router(flows_router)
app.include_router(generate_router)
app.include_router(rag_router)
app.include_router(rasa_router)


# ── Core endpoints ────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    flow_id: Optional[str] = None
    node_id: Optional[str] = None
    context: Optional[Dict[str, Any]] = None


class ChatResponse(BaseModel):
    flow_id: str
    node_id: Optional[str]
    reply: str
    context: Dict[str, Any]


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    flow_id = req.flow_id or await classifier.classify(req.message)
    # Reload flow from DB if not in engine cache
    if flow_id not in engine.flows:
        async with AsyncSessionLocal() as session:
            flow_model = await session.get(FlowModel, flow_id)
            if flow_model:
                engine.load_from_dict(flow_model.definition)
    next_node, reply, context = await engine.step(
        flow_id=flow_id,
        node_id=req.node_id,
        user_text=req.message,
        context=req.context,
    )
    return ChatResponse(flow_id=flow_id, node_id=next_node, reply=reply, context=context)
