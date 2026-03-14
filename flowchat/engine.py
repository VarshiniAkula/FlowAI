import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from db.models import Flow as FlowModel


def render_template(template: str, context: Dict[str, Any]) -> str:
    """Replace {{variable}} placeholders with values from context."""
    def replacer(match: re.Match) -> str:
        key = match.group(1).strip()
        return str(context.get(key, f"[{key}]"))
    return re.sub(r"\{\{(.+?)\}\}", replacer, template)


def _safe_eval(expression: str, context: Dict[str, Any]) -> bool:
    """Evaluate a simple condition expression safely."""
    try:
        from simpleeval import simple_eval
        return bool(simple_eval(expression, names={"context": context}))
    except Exception:
        return False


class FlowEngine:
    def __init__(self, flows: Optional[Dict[str, Any]] = None) -> None:
        # flows is a dict of {flow_id: flow_definition} - populated from DB
        self.flows: Dict[str, Dict[str, Any]] = flows or {}

    def load_from_dict(self, flow: Dict[str, Any]) -> None:
        self.flows[flow["id"]] = flow

    def get_flow(self, flow_id: str) -> Dict[str, Any]:
        if flow_id not in self.flows:
            raise ValueError(f"Unknown flow: {flow_id}")
        return self.flows[flow_id]

    async def step(
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
            return node.get("next"), node.get("text", ""), context

        if node_type == "choice":
            normalized = user_text.strip().lower()
            next_node = node.get("choices", {}).get(normalized, node.get("default"))
            return next_node, node.get("text", ""), context

        if node_type == "condition":
            expression = node.get("expression", "False")
            result = _safe_eval(expression, context)
            next_node = node["true_next"] if result else node["false_next"]
            return next_node, "", context

        if node_type == "rag_query":
            from rag import retriever
            query_text = render_template(node.get("query_template", ""), context)
            chunks = await retriever.query(
                query_text=query_text,
                collection_id=node.get("collection_id", "flowai_documents"),
                top_k=node.get("top_k", 3),
                doc_filter=node.get("doc_filter"),
            )
            rag_context = "\n\n---\n\n".join(c["text"] for c in chunks)
            context[node["context_slot"]] = rag_context
            # RAG node produces no bot message; advance silently
            return node.get("next"), "", context

        if node_type == "llm_response":
            from generation.claude_client import get_client
            system_prompt = render_template(node.get("system_prompt", ""), context)
            user_message = render_template(node.get("user_template", ""), context)
            client = get_client()
            response = await client.messages.create(
                model=node.get("model", "claude-sonnet-4-6"),
                max_tokens=1024,
                system=system_prompt,
                messages=[{"role": "user", "content": user_message}],
            )
            reply = response.content[0].text
            response_slot = node.get("response_slot")
            if response_slot:
                context[response_slot] = reply
            return node.get("next"), reply, context

        # Default: message node
        return node.get("next"), node.get("text", ""), context
