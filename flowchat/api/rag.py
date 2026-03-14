import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_session
from db.models import Document
from rag import retriever, vector_store

router = APIRouter(prefix="/rag", tags=["rag"])

UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

ALLOWED_TYPES = {"pdf", "docx", "doc", "txt", "md"}


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class DocumentSummary(BaseModel):
    id: str
    name: str
    original_name: str
    file_type: str
    status: str
    chunk_count: int
    collection_id: str
    error_message: Optional[str] = None


class RAGQueryRequest(BaseModel):
    query: str
    collection_id: str = "flowai_documents"
    top_k: int = 5
    min_score: float = 0.1
    doc_filter: Optional[List[str]] = None


class ChunkResult(BaseModel):
    text: str
    doc_id: str
    doc_name: str
    score: float


class RAGQueryResponse(BaseModel):
    chunks: List[ChunkResult]


# ── Background indexing callback ──────────────────────────────────────────────

def make_on_complete(doc_id: str):
    async def on_complete(did: str, chunk_count: int, error: Optional[str]):
        from db.database import AsyncSessionLocal
        async with AsyncSessionLocal() as session:
            doc = await session.get(Document, did)
            if doc:
                if error:
                    doc.status = "error"
                    doc.error_message = error
                else:
                    doc.status = "indexed"
                    doc.chunk_count = chunk_count
                await session.commit()
    return on_complete


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/documents", response_model=DocumentSummary, status_code=201)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
):
    suffix = Path(file.filename).suffix.lstrip(".").lower()
    if suffix not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"File type '{suffix}' not supported. Allowed: {ALLOWED_TYPES}")

    doc_id = str(uuid.uuid4())
    save_path = UPLOAD_DIR / f"{doc_id}.{suffix}"

    # Save file to disk
    content = await file.read()
    save_path.write_bytes(content)

    doc = Document(
        id=doc_id,
        name=f"{Path(file.filename).stem}_{doc_id[:8]}",
        original_name=file.filename,
        file_type=suffix,
        status="pending",
        collection_id="flowai_documents",
    )
    session.add(doc)
    await session.commit()
    await session.refresh(doc)

    background_tasks.add_task(
        retriever.index_document,
        doc_id=doc_id,
        file_path=str(save_path),
        file_type=suffix,
        doc_name=file.filename,
        on_complete=make_on_complete(doc_id),
    )

    return DocumentSummary(
        id=doc.id, name=doc.name, original_name=doc.original_name,
        file_type=doc.file_type, status=doc.status,
        chunk_count=doc.chunk_count, collection_id=doc.collection_id,
    )


@router.get("/documents", response_model=List[DocumentSummary])
async def list_documents(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Document))
    docs = result.scalars().all()
    return [
        DocumentSummary(
            id=d.id, name=d.name, original_name=d.original_name,
            file_type=d.file_type, status=d.status,
            chunk_count=d.chunk_count, collection_id=d.collection_id,
            error_message=d.error_message,
        )
        for d in docs
    ]


@router.get("/documents/{doc_id}", response_model=DocumentSummary)
async def get_document(doc_id: str, session: AsyncSession = Depends(get_session)):
    doc = await session.get(Document, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return DocumentSummary(
        id=doc.id, name=doc.name, original_name=doc.original_name,
        file_type=doc.file_type, status=doc.status,
        chunk_count=doc.chunk_count, collection_id=doc.collection_id,
        error_message=doc.error_message,
    )


@router.delete("/documents/{doc_id}", status_code=204)
async def delete_document(doc_id: str, session: AsyncSession = Depends(get_session)):
    from fastapi import Response
    doc = await session.get(Document, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Remove from ChromaDB
    vector_store.delete_doc(doc_id)

    # Remove uploaded file
    for ext in ALLOWED_TYPES:
        path = UPLOAD_DIR / f"{doc_id}.{ext}"
        if path.exists():
            path.unlink()

    await session.delete(doc)
    await session.commit()
    return Response(status_code=204)


@router.post("/query", response_model=RAGQueryResponse)
async def test_query(body: RAGQueryRequest):
    chunks = await retriever.query(
        query_text=body.query,
        collection_id=body.collection_id,
        top_k=body.top_k,
        doc_filter=body.doc_filter,
        min_score=body.min_score,
    )
    return RAGQueryResponse(
        chunks=[ChunkResult(**c) for c in chunks]
    )
