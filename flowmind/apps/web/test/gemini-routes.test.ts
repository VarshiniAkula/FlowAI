import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (n: string) => (store.has(n) ? { name: n, value: store.get(n)! } : undefined),
    set: (n: string, v: string) => void store.set(n, v),
    delete: (n: string) => void store.delete(n),
  }),
}));

// Mock the Gemini SDK client layer so no real network/credentials are used.
vi.mock('@/lib/gemini/client', () => ({
  validateCredential: vi.fn(),
  lastFour: (k: string) => k.trim().slice(-4),
  generateText: vi.fn(),
  streamText: vi.fn(),
  generateGraphJson: vi.fn(),
}));

import { validateCredential } from '@/lib/gemini/client';
import { GeminiError } from '@/lib/gemini/errors';
import { GEMINI_COOKIE_NAME } from '@/lib/gemini/limits';
import { POST as connectPOST } from '@/app/api/integrations/gemini/connect/route';
import { GET as statusGET } from '@/app/api/integrations/gemini/status/route';
import { DELETE as disconnectDELETE } from '@/app/api/integrations/gemini/disconnect/route';

const mockValidate = vi.mocked(validateCredential);

function connectReq(body: unknown) {
  return new Request('http://localhost/api/integrations/gemini/connect', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost', host: 'localhost' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  store.clear();
  mockValidate.mockReset();
  process.env.BYOK_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  delete process.env.GEMINI_API_KEY;
});

describe('POST /connect', () => {
  const goodKey = 'A'.repeat(21) + 'CDEF'; // 25 chars

  it('creates a secure cookie and returns sanitized metadata for a valid key', async () => {
    mockValidate.mockResolvedValue({ keyLastFour: 'CDEF' });
    const res = await connectPOST(connectReq({ apiKey: goodKey }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(body).toMatchObject({ connected: true, mode: 'byok', keyLastFour: 'CDEF' });
    expect(store.has(GEMINI_COOKIE_NAME)).toBe(true);
    // The raw key must never appear in the response.
    expect(JSON.stringify(body)).not.toContain(goodKey);
  });

  it('returns a sanitized error for an invalid key', async () => {
    mockValidate.mockRejectedValue(new GeminiError('INVALID_API_KEY'));
    const res = await connectPOST(connectReq({ apiKey: goodKey }));
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.error.code).toBe('INVALID_API_KEY');
    expect(JSON.stringify(body)).not.toContain(goodKey);
    expect(store.has(GEMINI_COOKIE_NAME)).toBe(false);
  });

  it('rejects an empty key', async () => {
    const res = await connectPOST(connectReq({ apiKey: '' }));
    expect(res.status).toBe(400);
    expect(mockValidate).not.toHaveBeenCalled();
  });

  it('rejects an excessively long key', async () => {
    const res = await connectPOST(connectReq({ apiKey: 'A'.repeat(600) }));
    expect(res.status).toBe(400);
    expect(mockValidate).not.toHaveBeenCalled();
  });

  it('never logs the raw key', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockValidate.mockResolvedValue({ keyLastFour: 'CDEF' });
    await connectPOST(connectReq({ apiKey: goodKey }));
    for (const spy of [info, error]) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(goodKey);
      }
    }
    info.mockRestore();
    error.mockRestore();
  });
});

describe('GET /status', () => {
  it('reports fallback when nothing is configured', async () => {
    const res = await statusGET();
    expect(await res.json()).toEqual({ connected: false, mode: 'fallback' });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('reports platform mode without key details', async () => {
    process.env.GEMINI_API_KEY = 'platform-secret';
    const res = await statusGET();
    const body = await res.json();
    expect(body).toEqual({ connected: true, mode: 'platform' });
    expect(JSON.stringify(body)).not.toContain('platform-secret');
  });

  it('reports BYOK safely after connecting', async () => {
    mockValidate.mockResolvedValue({ keyLastFour: 'CDEF' });
    await connectPOST(connectReq({ apiKey: 'A'.repeat(21) + 'CDEF' }));
    const res = await statusGET();
    const body = await res.json();
    expect(body).toMatchObject({ connected: true, mode: 'byok', keyLastFour: 'CDEF' });
  });
});

describe('DELETE /disconnect', () => {
  function delReq() {
    return new Request('http://localhost/api/integrations/gemini/disconnect', {
      method: 'DELETE',
      headers: { origin: 'http://localhost', host: 'localhost' },
    });
  }

  it('clears the cookie and is idempotent', async () => {
    mockValidate.mockResolvedValue({ keyLastFour: 'CDEF' });
    await connectPOST(connectReq({ apiKey: 'A'.repeat(21) + 'CDEF' }));
    expect(store.has(GEMINI_COOKIE_NAME)).toBe(true);

    const res1 = await disconnectDELETE(delReq());
    expect(await res1.json()).toEqual({ connected: false, mode: 'fallback' });
    expect(store.has(GEMINI_COOKIE_NAME)).toBe(false);

    // Idempotent: still succeeds with no active session.
    const res2 = await disconnectDELETE(delReq());
    expect(res2.status).toBe(200);
  });
});
