from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.database import Base


class Flow(Base):
    __tablename__ = "flows"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(String, default="")
    definition: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)
    start_node: Mapped[str] = mapped_column(String, nullable=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, onupdate=func.now(), nullable=True)

    versions: Mapped[List["FlowVersion"]] = relationship("FlowVersion", back_populates="flow")


class FlowVersion(Base):
    __tablename__ = "flow_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    flow_id: Mapped[str] = mapped_column(String, ForeignKey("flows.id"))
    version_num: Mapped[int] = mapped_column(Integer, nullable=False)
    definition: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)
    saved_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    comment: Mapped[str] = mapped_column(String, default="")

    flow: Mapped["Flow"] = relationship("Flow", back_populates="versions")


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    original_name: Mapped[str] = mapped_column(String, nullable=False)
    file_type: Mapped[str] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default="pending")  # pending/indexed/error
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    collection_id: Mapped[str] = mapped_column(String, nullable=False, default="flowai_documents")
    error_message: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    flow_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("flows.id"), nullable=True)
    node_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    context: Mapped[Dict[str, Any]] = mapped_column(JSON, default={})
    history: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=[])
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, onupdate=func.now(), nullable=True)
