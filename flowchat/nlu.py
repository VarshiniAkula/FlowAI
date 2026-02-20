import os
from typing import Literal

Intent = Literal["greeting_flow", "billing_flow", "support_flow"]


class IntentClassifier:
    def __init__(self) -> None:
        self.api_key = os.getenv("OPENAI_API_KEY")

    def classify(self, text: str) -> Intent:
        lower = text.lower()
        if any(word in lower for word in ["bill", "invoice", "refund", "payment", "charge"]):
            return "billing_flow"
        if any(word in lower for word in ["bug", "error", "support", "login", "outage", "issue"]):
            return "support_flow"
        return "greeting_flow"
