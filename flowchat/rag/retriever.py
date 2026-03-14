import asyncio
from pathlib import Path
from typing import Any, Dict, List, Optional

from rag import chunker, document_parser, embedder, vector_store


async def index_document(
    doc_id: str,
    file_path: str,
    file_type: str,
    doc_name: str,
    on_complete,  # async callable(doc_id, chunk_count) or (doc_id, error_msg)
) -> None:
    """Parse, chunk, embed, and upsert a document. Calls on_complete when done."""
    try:
        # Run CPU-bound operations in a thread pool
        loop = asyncio.get_event_loop()

        text = await loop.run_in_executor(
            None, document_parser.parse, file_path, file_type
        )
        chunks = await loop.run_in_executor(None, chunker.chunk, text)

        if not chunks:
            await on_complete(doc_id, 0, None)
            return

        embeddings = await loop.run_in_executor(None, embedder.embed, chunks)

        await loop.run_in_executor(
            None,
            vector_store.upsert_chunks,
            doc_id,
            doc_name,
            chunks,
            embeddings,
            file_type,
        )
        await on_complete(doc_id, len(chunks), None)
    except Exception as exc:
        await on_complete(doc_id, 0, str(exc))


async def query(
    query_text: str,
    collection_id: str = "flowai_documents",
    top_k: int = 5,
    doc_filter: Optional[List[str]] = None,
    min_score: float = 0.1,
) -> List[Dict[str, Any]]:
    """Embed query and retrieve top-k relevant chunks."""
    loop = asyncio.get_event_loop()
    query_embedding = await loop.run_in_executor(None, embedder.embed_one, query_text)
    chunks = await loop.run_in_executor(
        None, vector_store.query_chunks, query_embedding, top_k, doc_filter
    )
    return [c for c in chunks if c["score"] >= min_score]
