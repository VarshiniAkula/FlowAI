"""Terminal CLI for testing FlowAI flows interactively."""
import asyncio
import json
from pathlib import Path


async def main():
    from engine import FlowEngine
    from nlu import IntentClassifier

    flows_dir = Path(__file__).parent / "flows"
    engine = FlowEngine()

    # Load JSON flows from disk (for local testing without DB)
    if flows_dir.exists():
        for path in flows_dir.glob("*.json"):
            with path.open() as f:
                engine.load_from_dict(json.load(f))

    flow_ids = list(engine.flows.keys())
    classifier = IntentClassifier(flow_ids)

    print("FlowAI Terminal — type 'quit' to exit\n")
    print(f"Loaded flows: {', '.join(flow_ids) or 'none'}\n")

    flow_id = None
    node_id = None
    context = {}

    while True:
        user_input = input("You: ").strip()
        if user_input.lower() in ("quit", "exit", "q"):
            break

        if not flow_id:
            flow_id = await classifier.classify(user_input)
            print(f"[routing to: {flow_id}]")

        next_node, reply, context = await engine.step(
            flow_id=flow_id,
            node_id=node_id,
            user_text=user_input,
            context=context,
        )

        if reply:
            print(f"Bot: {reply}")

        node_id = next_node
        if node_id is None:
            print("[flow ended — restarting]")
            flow_id = None
            context = {}


if __name__ == "__main__":
    asyncio.run(main())
