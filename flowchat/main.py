from pathlib import Path

from engine import FlowEngine
from nlu import IntentClassifier


if __name__ == "__main__":
    base_dir = Path(__file__).resolve().parent
    engine = FlowEngine(str(base_dir / "flows"))
    classifier = IntentClassifier()

    print("FlowChat terminal demo. Type 'exit' to quit.")
    flow_id = None
    node_id = None
    context = {}

    while True:
        user = input("You: ").strip()
        if user.lower() == "exit":
            break

        if flow_id is None:
            flow_id = classifier.classify(user)

        node_id, reply, context = engine.step(
            flow_id=flow_id,
            node_id=node_id,
            user_text=user,
            context=context,
        )

        print(f"Bot [{flow_id}]: {reply}")

        if node_id is None:
            flow_id = None
            context = {}
