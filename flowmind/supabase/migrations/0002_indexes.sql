-- Phase 1: indexes for FlowMind hot paths.

-- Vector search: HNSW with cosine ops for Gemini text-embedding-004.
create index document_chunks_embedding_hnsw
  on public.document_chunks
  using hnsw (embedding vector_cosine_ops);

-- memberships: unique already created inline; extra b-tree on user_id for reverse lookup.
create index memberships_user_id_idx on public.memberships (user_id);
create index memberships_org_id_idx on public.memberships (org_id);

-- assistants
create index assistants_org_id_idx on public.assistants (org_id);
create index assistants_created_at_idx on public.assistants (created_at desc);

-- knowledge_sources
create index knowledge_sources_org_id_idx on public.knowledge_sources (org_id);
create index knowledge_sources_assistant_id_idx on public.knowledge_sources (assistant_id);
create index knowledge_sources_created_at_idx on public.knowledge_sources (created_at desc);

-- documents
create index documents_org_id_idx on public.documents (org_id);
create index documents_assistant_id_idx on public.documents (assistant_id);
create index documents_source_id_idx on public.documents (source_id);
create index documents_created_at_idx on public.documents (created_at desc);

-- document_chunks
create index document_chunks_org_id_idx on public.document_chunks (org_id);
create index document_chunks_assistant_id_idx on public.document_chunks (assistant_id);
create index document_chunks_document_id_idx on public.document_chunks (document_id);

-- published_assistants (public_id already unique from table DDL; add b-tree lookups).
create index published_assistants_org_id_idx on public.published_assistants (org_id);
create index published_assistants_assistant_id_idx on public.published_assistants (assistant_id);
create index published_assistants_created_at_idx on public.published_assistants (created_at desc);

-- conversations
create index conversations_org_id_idx on public.conversations (org_id);
create index conversations_assistant_id_idx on public.conversations (assistant_id);
create index conversations_published_assistant_id_idx on public.conversations (published_assistant_id);
create index conversations_created_at_idx on public.conversations (created_at desc);

-- messages
create index messages_conversation_id_idx on public.messages (conversation_id);
create index messages_org_id_idx on public.messages (org_id);
create index messages_created_at_idx on public.messages (created_at desc);

-- usage_events
create index usage_events_org_id_idx on public.usage_events (org_id);
create index usage_events_assistant_id_idx on public.usage_events (assistant_id);
create index usage_events_created_at_idx on public.usage_events (created_at desc);
