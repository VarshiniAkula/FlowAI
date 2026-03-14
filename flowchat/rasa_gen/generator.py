import json
import re
from typing import Any, Dict, List, Optional

from generation.claude_client import get_client
from rasa_gen.prompts import (
    RASA_GENERATION_SYSTEM_PROMPT,
    RASA_GENERATION_USER_TEMPLATE,
    RASA_RAG_CONTEXT,
)

MODEL = "claude-sonnet-4-6"

REQUIRED_KEYS = {"nlu", "stories", "rules", "domain", "config", "endpoints", "actions"}


def _validate_rasa_files(files: Dict[str, str]) -> None:
    missing = REQUIRED_KEYS - set(files.keys())
    if missing:
        raise ValueError(f"Missing required RASA files: {missing}")
    for key in REQUIRED_KEYS:
        if not isinstance(files[key], str) or not files[key].strip():
            raise ValueError(f"RASA file '{key}' is empty or not a string")


def _cross_validate(files: Dict[str, str]) -> List[str]:
    """Basic cross-validation: check intents in nlu appear in domain."""
    warnings = []
    domain = files.get("domain", "")
    nlu = files.get("nlu", "")

    # Extract intent names from nlu.yml
    nlu_intents = set(re.findall(r"- intent:\s*(\w+)", nlu))
    # Extract intent names from domain.yml
    domain_intents = set(re.findall(r"- (\w+)", domain.split("intents:")[1].split("\n\n")[0]) if "intents:" in domain else [])

    missing_in_domain = nlu_intents - domain_intents
    if missing_in_domain:
        warnings.append(f"Intents in NLU but not domain: {missing_in_domain}")

    return warnings


async def generate_rasa_files(
    user_story: str,
    rag_context: Optional[str] = None,
    max_retries: int = 2,
) -> Dict[str, Any]:
    """Generate complete RASA files from a plain English story."""
    client = get_client()

    rag_section = ""
    if rag_context:
        rag_section = RASA_RAG_CONTEXT.format(context=rag_context)

    user_content = RASA_GENERATION_USER_TEMPLATE.format(
        user_story=user_story,
        rag_context=rag_section,
    )

    messages = [{"role": "user", "content": user_content}]
    last_error: Exception | None = None

    for attempt in range(max_retries + 1):
        response = await client.messages.create(
            model=MODEL,
            max_tokens=8192,
            system=RASA_GENERATION_SYSTEM_PROMPT,
            messages=messages,
        )
        raw = response.content[0].text.strip()

        # Strip markdown fences if present
        if raw.startswith("```"):
            lines = raw.split("\n")
            raw = "\n".join(lines[1:-1]) if lines[-1].startswith("```") else "\n".join(lines[1:])

        try:
            files = json.loads(raw)
            _validate_rasa_files(files)
            warnings = _cross_validate(files)
            return {"files": files, "warnings": warnings}
        except (json.JSONDecodeError, ValueError) as exc:
            last_error = exc
            if attempt < max_retries:
                messages.append({"role": "assistant", "content": raw})
                messages.append({
                    "role": "user",
                    "content": f"Error: {exc}. Fix it and return only the JSON object with all required keys.",
                })

    raise RuntimeError(f"RASA file generation failed after {max_retries + 1} attempts: {last_error}")
