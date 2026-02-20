from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from engine import FlowEngine
from nlu import IntentClassifier

BASE_DIR = Path(__file__).resolve().parent
engine = FlowEngine(str(BASE_DIR / "flows"))
classifier = IntentClassifier()

app = FastAPI(title="FlowChat API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


@app.get("/flows")
def list_flows() -> Dict[str, Any]:
    return {
        "flows": [
            {"id": flow_id, "description": flow.get("description", "")}
            for flow_id, flow in engine.flows.items()
        ]
    }


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest) -> ChatResponse:
    flow_id = req.flow_id or classifier.classify(req.message)
    next_node, reply, context = engine.step(
        flow_id=flow_id,
        node_id=req.node_id,
        user_text=req.message,
        context=req.context,
    )
    return ChatResponse(flow_id=flow_id, node_id=next_node, reply=reply, context=context)
