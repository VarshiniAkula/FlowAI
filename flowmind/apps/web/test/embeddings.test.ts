import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the Gemini SDK: no network. `embedMock` stands in for models.embedContent.
const embedMock = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { embedContent: (...a: unknown[]) => embedMock(...a) };
    constructor(_opts: unknown) {}
  },
}));

import { embedTexts, embedQuery, EMBEDDING_MODEL, EMBEDDING_DIMS, toPgVector } from '@/lib/gemini/embeddings';

beforeEach(() => embedMock.mockReset());

describe('embedTexts', () => {
  it('requests the configured model + 768 dims + task type, and returns unit-normalized vectors', async () => {
    embedMock.mockResolvedValue({ embeddings: [{ values: [3, 4] }, { values: [0, 5] }] });
    const out = await embedTexts('key', ['a', 'b'], 'RETRIEVAL_DOCUMENT');

    const params = embedMock.mock.calls[0]![0] as any;
    expect(params.model).toBe(EMBEDDING_MODEL);
    expect(params.model).toBe('gemini-embedding-001');
    expect(params.config.taskType).toBe('RETRIEVAL_DOCUMENT');
    expect(params.config.outputDimensionality).toBe(EMBEDDING_DIMS);

    // [3,4] -> /5 -> [0.6,0.8]; [0,5] -> [0,1]
    expect(out[0]![0]).toBeCloseTo(0.6, 6);
    expect(out[0]![1]).toBeCloseTo(0.8, 6);
    expect(out[1]).toEqual([0, 1]);
  });

  it('returns [] for empty input without calling the API', async () => {
    const out = await embedTexts('key', [], 'RETRIEVAL_DOCUMENT');
    expect(out).toEqual([]);
    expect(embedMock).not.toHaveBeenCalled();
  });

  it('throws when the embedding count does not match the input', async () => {
    embedMock.mockResolvedValue({ embeddings: [{ values: [1, 0] }] });
    await expect(embedTexts('key', ['a', 'b'], 'RETRIEVAL_DOCUMENT')).rejects.toBeTruthy();
  });
});

describe('embedQuery', () => {
  it('uses the RETRIEVAL_QUERY task type', async () => {
    embedMock.mockResolvedValue({ embeddings: [{ values: [1, 0] }] });
    await embedQuery('key', 'hello');
    const params = embedMock.mock.calls[0]![0] as any;
    expect(params.config.taskType).toBe('RETRIEVAL_QUERY');
  });
});

describe('toPgVector', () => {
  it('formats a vector as a pgvector literal', () => {
    expect(toPgVector([0.1, 0.2, 0.3])).toBe('[0.1,0.2,0.3]');
  });
});
