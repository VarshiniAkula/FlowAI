from typing import List

_model = None
MODEL_NAME = "all-MiniLM-L6-v2"


def get_model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer(MODEL_NAME)
    return _model


def embed(texts: List[str]) -> List[List[float]]:
    """Return a list of embedding vectors for the given texts."""
    model = get_model()
    embeddings = model.encode(texts, show_progress_bar=False, convert_to_numpy=True)
    return embeddings.tolist()


def embed_one(text: str) -> List[float]:
    return embed([text])[0]
