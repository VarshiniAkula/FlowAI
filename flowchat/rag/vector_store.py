from pathlib import Path
from typing import Any, Dict, List, Optional

COLLECTION_NAME = "flowai_documents"
_client = None
_collection = None


def _get_collection():
    global _client, _collection
    if _collection is None:
        import chromadb

        db_path = str(Path(__file__).resolve().parent.parent / "chroma_db")
        _client = chromadb.PersistentClient(path=db_path)
        _collection = _client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )
    return _collection


def upsert_chunks(
    doc_id: str,
    doc_name: str,
    chunks: List[str],
    embeddings: List[List[float]],
    file_type: str = "txt",
) -> None:
    collection = _get_collection()
    ids = [f"{doc_id}_{i}" for i in range(len(chunks))]
    metadatas = [
        {
            "doc_id": doc_id,
            "doc_name": doc_name,
            "chunk_index": i,
            "source_type": file_type,
        }
        for i in range(len(chunks))
    ]
    collection.upsert(
        ids=ids,
        embeddings=embeddings,
        documents=chunks,
        metadatas=metadatas,
    )


def query_chunks(
    query_embedding: List[float],
    top_k: int = 5,
    doc_filter: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    collection = _get_collection()
    where = None
    if doc_filter and len(doc_filter) == 1:
        where = {"doc_id": doc_filter[0]}
    elif doc_filter and len(doc_filter) > 1:
        where = {"doc_id": {"$in": doc_filter}}

    kwargs: Dict[str, Any] = {
        "query_embeddings": [query_embedding],
        "n_results": top_k,
        "include": ["documents", "metadatas", "distances"],
    }
    if where:
        kwargs["where"] = where

    results = collection.query(**kwargs)

    chunks = []
    if results["documents"] and results["documents"][0]:
        for text, meta, dist in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            chunks.append({
                "text": text,
                "doc_id": meta.get("doc_id", ""),
                "doc_name": meta.get("doc_name", ""),
                "score": 1 - dist,  # cosine similarity from distance
            })
    return chunks


def delete_doc(doc_id: str) -> None:
    collection = _get_collection()
    results = collection.get(where={"doc_id": doc_id})
    if results["ids"]:
        collection.delete(ids=results["ids"])
