import json
from typing import Any, Dict, List, Optional

from generation.claude_client import get_client
from generation.prompts import (
    DOC_CONTEXT_SECTION,
    FLOW_GENERATION_SYSTEM_PROMPT,
    FLOW_GENERATION_USER_TEMPLATE,
)

MODEL = "claude-sonnet-4-6"


def _validate_flow(flow: Dict[str, Any]) -> None:
    """Raise ValueError if the generated flow has broken references."""
    if "id" not in flow or "start_node" not in flow or "nodes" not in flow:
        raise ValueError("Flow missing required top-level keys: id, start_node, nodes")

    nodes = flow["nodes"]
    node_ids = set(nodes.keys())

    if flow["start_node"] not in node_ids:
        raise ValueError(f"start_node '{flow['start_node']}' not found in nodes")

    for node_id, node in nodes.items():
        ntype = node.get("type")
        if ntype in ("message", "input", "rag_query", "llm_response"):
            nxt = node.get("next")
            if nxt and nxt not in node_ids:
                raise ValueError(f"Node '{node_id}' references unknown next node '{nxt}'")
        elif ntype == "choice":
            for label, target in node.get("choices", {}).items():
                if target not in node_ids:
                    raise ValueError(f"Choice '{label}' in node '{node_id}' references unknown node '{target}'")
            default = node.get("default")
            if default and default not in node_ids:
                raise ValueError(f"Default node '{default}' in choice '{node_id}' not found")
        elif ntype == "condition":
            for key in ("true_next", "false_next"):
                ref = node.get(key)
                if ref and ref not in node_ids:
                    raise ValueError(f"'{key}' in condition '{node_id}' references unknown node '{ref}'")


async def generate_flow(
    prompt: str,
    doc_ids: Optional[List[str]] = None,
    doc_summaries: Optional[str] = None,
    max_retries: int = 2,
) -> Dict[str, Any]:
    """Call Claude to generate a flow JSON from a natural language prompt."""
    client = get_client()

    doc_context_section = ""
    if doc_ids:
        doc_context_section = DOC_CONTEXT_SECTION.format(
            doc_ids=", ".join(doc_ids),
            doc_summaries=doc_summaries or "No summaries available",
        )

    user_content = FLOW_GENERATION_USER_TEMPLATE.format(
        user_prompt=prompt,
        doc_context_section=doc_context_section,
    )

    messages = [{"role": "user", "content": user_content}]
    last_error: Exception | None = None

    for attempt in range(max_retries + 1):
        response = await client.messages.create(
            model=MODEL,
            max_tokens=4096,
            system=FLOW_GENERATION_SYSTEM_PROMPT,
            messages=messages,
        )
        raw = response.content[0].text.strip()

        # Strip markdown fences if Claude wraps in them despite instructions
        if raw.startswith("```"):
            lines = raw.split("\n")
            raw = "\n".join(lines[1:-1]) if lines[-1].startswith("```") else "\n".join(lines[1:])

        try:
            flow = json.loads(raw)
            _validate_flow(flow)
            return flow
        except (json.JSONDecodeError, ValueError) as exc:
            last_error = exc
            if attempt < max_retries:
                messages.append({"role": "assistant", "content": raw})
                messages.append({
                    "role": "user",
                    "content": f"The JSON was invalid or had broken references: {exc}. Please fix it and return only valid JSON.",
                })

    raise RuntimeError(f"Flow generation failed after {max_retries + 1} attempts: {last_error}")
