import os
from typing import List


class IntentClassifier:
    """Classify user messages to the appropriate flow using Claude."""

    def __init__(self, flow_ids: List[str] | None = None) -> None:
        self._flow_ids: List[str] = flow_ids or []

    def update_flows(self, flow_ids: List[str]) -> None:
        self._flow_ids = flow_ids

    async def classify(self, message: str) -> str:
        """Return the most relevant flow_id for the given message."""
        if not self._flow_ids:
            return "greeting_flow"

        if len(self._flow_ids) == 1:
            return self._flow_ids[0]

        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            return self._fallback(message)

        try:
            from anthropic import AsyncAnthropic
            client = AsyncAnthropic(api_key=api_key)
            flow_list = "\n".join(f"- {fid}" for fid in self._flow_ids)
            response = await client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=50,
                system=(
                    "You are a router for a chatbot. Given a user message, pick the best "
                    "flow from the list. Reply with ONLY the flow id, nothing else."
                ),
                messages=[{
                    "role": "user",
                    "content": f"Available flows:\n{flow_list}\n\nUser message: {message}\n\nBest flow id:",
                }],
            )
            chosen = response.content[0].text.strip().lower()
            if chosen in self._flow_ids:
                return chosen
        except Exception:
            pass

        return self._fallback(message)

    def _fallback(self, message: str) -> str:
        """Simple keyword fallback when Claude is unavailable."""
        msg = message.lower()
        if any(w in msg for w in ("bill", "invoice", "refund", "payment", "charge")):
            return next((f for f in self._flow_ids if "billing" in f), self._flow_ids[0])
        if any(w in msg for w in ("bug", "error", "support", "login", "outage", "issue")):
            return next((f for f in self._flow_ids if "support" in f), self._flow_ids[0])
        return self._flow_ids[0]
