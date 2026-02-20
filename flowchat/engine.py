import json
from pathlib import Path
from typing import Any, Dict, Optional, Tuple


class FlowEngine:
    def __init__(self, flows_dir: str = "flows") -> None:
        self.flows_dir = Path(flows_dir)
        self.flows: Dict[str, Dict[str, Any]] = {}
        self.load_flows()

    def load_flows(self) -> None:
        self.flows.clear()
        for path in self.flows_dir.glob("*.json"):
            with path.open("r", encoding="utf-8") as file:
                flow = json.load(file)
                self.flows[flow["id"]] = flow

    def get_flow(self, flow_id: str) -> Dict[str, Any]:
        if flow_id not in self.flows:
            raise ValueError(f"Unknown flow: {flow_id}")
        return self.flows[flow_id]

    def step(
        self,
        flow_id: str,
        node_id: Optional[str] = None,
        user_text: str = "",
        context: Optional[Dict[str, Any]] = None,
    ) -> Tuple[Optional[str], str, Dict[str, Any]]:
        context = context or {}
        flow = self.get_flow(flow_id)
        current_node_id = node_id or flow["start_node"]
        node = flow["nodes"][current_node_id]

        node_type = node.get("type")
        if node_type == "input":
            slot = node.get("slot")
            if slot and user_text.strip():
                context[slot] = user_text.strip()
            next_node = node.get("next")
            return next_node, node.get("text", ""), context

        if node_type == "choice":
            normalized = user_text.strip().lower()
            next_node = node.get("choices", {}).get(normalized, node.get("default"))
            return next_node, node.get("text", ""), context

        next_node = node.get("next")
        return next_node, node.get("text", ""), context
