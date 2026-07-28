-- 0010_match_document_chunks.sql
-- Cosine-similarity retrieval over document_chunks.embedding (pgvector vector(768),
-- HNSW vector_cosine_ops index from 0002). Filtered by assistant_id; only rows
-- with a populated embedding participate. Called by the /api/knowledge/search
-- route through the service client AFTER the caller's assistant access is
-- verified in the route (same pattern as ingest), so it is a plain function.
create or replace function public.match_document_chunks(
  p_assistant_id uuid,
  p_query_embedding vector(768),
  p_match_count int
)
returns table (
  id uuid,
  document_id uuid,
  document_name text,
  content text,
  chunk_index int,
  similarity double precision
)
language sql
stable
set search_path = public
as $$
  select
    dc.id,
    dc.document_id,
    d.name as document_name,
    dc.content,
    dc.chunk_index,
    1 - (dc.embedding <=> p_query_embedding) as similarity
  from public.document_chunks dc
  join public.documents d on d.id = dc.document_id
  where dc.assistant_id = p_assistant_id
    and dc.embedding is not null
  order by dc.embedding <=> p_query_embedding
  limit greatest(p_match_count, 1);
$$;

revoke all on function public.match_document_chunks(uuid, vector, int) from anon, authenticated;
