import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/guards', () => ({
  requireAssistantAccess: vi.fn().mockResolvedValue({ orgId: 'org-1', role: 'member', user: { id: 'u1' } }),
  GuardError: class GuardError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.status = 404;
    }
  },
}));
vi.mock('@/lib/gemini/credentials', () => ({ resolveGeminiCredential: vi.fn() }));
vi.mock('@/lib/gemini/embeddings', () => ({
  embedQuery: vi.fn(),
  toPgVector: (v: number[]) => `[${v.join(',')}]`,
}));

const rpcMock = vi.fn();
const limitMock = vi.fn();
vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: () => ({
    rpc: (...a: unknown[]) => rpcMock(...a),
    from: () => ({ select: () => ({ eq: () => ({ limit: (...a: unknown[]) => limitMock(...a) }) }) }),
  }),
}));

import { POST } from '@/app/api/knowledge/search/route';
import { resolveGeminiCredential } from '@/lib/gemini/credentials';
import { embedQuery } from '@/lib/gemini/embeddings';

const mCred = vi.mocked(resolveGeminiCredential);
const mEmbed = vi.mocked(embedQuery);

function req(body: unknown) {
  return new Request('http://localhost/api/knowledge/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  rpcMock.mockReset();
  limitMock.mockReset();
});

describe('POST /api/knowledge/search', () => {
  it('uses vector search when a Gemini credential is present and matches exist', async () => {
    mCred.mockResolvedValue({ mode: 'byok', apiKey: 'k', keyLastFour: 'ABCD', expiresAt: Date.now() + 1000 });
    mEmbed.mockResolvedValue([0.1, 0.2, 0.3]);
    rpcMock.mockResolvedValue({
      data: [
        { id: 'c1', document_id: 'd1', document_name: 'Doc', content: 'baggage allowance is 23kg', chunk_index: 0, similarity: 0.91 },
      ],
      error: null,
    });

    const res = await POST(req({ assistantId: 'a1', query: 'baggage fee', topK: 3 }));
    const json = await res.json();
    expect(json.method).toBe('vector');
    expect(json.hits[0]).toMatchObject({ documentName: 'Doc', score: 0.91 });
    expect(rpcMock).toHaveBeenCalledWith('match_document_chunks', expect.objectContaining({
      p_assistant_id: 'a1',
      p_match_count: 3,
    }));
    expect(limitMock).not.toHaveBeenCalled(); // BM25 path not taken
  });

  it('falls back to BM25 when no Gemini credential is available', async () => {
    mCred.mockResolvedValue({ mode: 'fallback' });
    limitMock.mockResolvedValue({
      data: [
        { content: 'baggage allowance is 23kg', chunk_index: 0, document_id: 'd1', documents: { name: 'Doc' } },
        { content: 'seat selection is free', chunk_index: 1, document_id: 'd1', documents: { name: 'Doc' } },
      ],
      error: null,
    });

    const res = await POST(req({ assistantId: 'a1', query: 'baggage' }));
    const json = await res.json();
    expect(json.method).toBe('bm25');
    expect(mEmbed).not.toHaveBeenCalled();
    expect(json.hits[0].content).toContain('baggage');
  });

  it('falls back to BM25 when vector search returns no rows (no embedded chunks yet)', async () => {
    mCred.mockResolvedValue({ mode: 'byok', apiKey: 'k', keyLastFour: 'ABCD', expiresAt: Date.now() + 1000 });
    mEmbed.mockResolvedValue([0.1, 0.2]);
    rpcMock.mockResolvedValue({ data: [], error: null });
    limitMock.mockResolvedValue({
      data: [{ content: 'baggage allowance', chunk_index: 0, document_id: 'd1', documents: { name: 'Doc' } }],
      error: null,
    });

    const res = await POST(req({ assistantId: 'a1', query: 'baggage' }));
    const json = await res.json();
    expect(json.method).toBe('bm25');
    expect(json.hits.length).toBe(1);
  });

  it('returns an empty result for a blank query without touching providers', async () => {
    const res = await POST(req({ assistantId: 'a1', query: '   ' }));
    const json = await res.json();
    expect(json).toEqual({ method: 'none', hits: [] });
    expect(mCred).not.toHaveBeenCalled();
  });
});
