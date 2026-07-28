import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the service-role client so no real Supabase connection is used.
const rpcMock = vi.fn();
vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: () => ({ rpc: (...a: unknown[]) => rpcMock(...a) }),
}));

import {
  getGroqDemoUsage,
  recordGroqDemoResult,
  reserveGroqDemoRequest,
} from '@/lib/groq/usage';

const USER = '00000000-0000-0000-0000-000000000001';

beforeEach(() => rpcMock.mockReset());

describe('reserveGroqDemoRequest', () => {
  it('allows a request below the user limit', async () => {
    rpcMock.mockResolvedValue({
      data: [{ allowed: true, reason: null, remaining: 4, reset_at: '2026-07-25T00:00:00Z' }],
      error: null,
    });
    const r = await reserveGroqDemoRequest({ userId: USER, userDailyLimit: 5, globalDailyLimit: 100 });
    expect(r).toMatchObject({ allowed: true, remaining: 4 });
    // Calls the atomic Postgres function (not a JS counter).
    expect(rpcMock).toHaveBeenCalledWith('reserve_platform_llm_request', expect.objectContaining({
      p_user_id: USER,
      p_provider: 'groq',
      p_user_daily_limit: 5,
      p_global_daily_limit: 100,
    }));
  });

  it('blocks at the user daily limit', async () => {
    rpcMock.mockResolvedValue({
      data: [{ allowed: false, reason: 'USER_DAILY_LIMIT', remaining: 0, reset_at: '2026-07-25T00:00:00Z' }],
      error: null,
    });
    const r = await reserveGroqDemoRequest({ userId: USER, userDailyLimit: 5, globalDailyLimit: 100 });
    expect(r).toMatchObject({ allowed: false, reason: 'USER_DAILY_LIMIT', remaining: 0 });
  });

  it('blocks at the global daily limit', async () => {
    rpcMock.mockResolvedValue({
      data: [{ allowed: false, reason: 'GLOBAL_DAILY_LIMIT', remaining: 0, reset_at: '2026-07-25T00:00:00Z' }],
      error: null,
    });
    const r = await reserveGroqDemoRequest({ userId: USER, userDailyLimit: 5, globalDailyLimit: 100 });
    expect(r).toMatchObject({ allowed: false, reason: 'GLOBAL_DAILY_LIMIT' });
  });

  it('fails closed (denies) when the RPC errors', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const r = await reserveGroqDemoRequest({ userId: USER, userDailyLimit: 5, globalDailyLimit: 100 });
    expect(r.allowed).toBe(false);
  });

  it('never returns a negative remaining count', async () => {
    rpcMock.mockResolvedValue({
      data: [{ allowed: true, reason: null, remaining: -3, reset_at: '2026-07-25T00:00:00Z' }],
      error: null,
    });
    const r = await reserveGroqDemoRequest({ userId: USER, userDailyLimit: 5, globalDailyLimit: 100 });
    expect(r.allowed).toBe(true);
    if (r.allowed) expect(r.remaining).toBe(0);
  });
});

describe('recordGroqDemoResult', () => {
  it('is best-effort and never surfaces an RPC failure', async () => {
    // supabase-js resolves with { data, error } rather than throwing.
    rpcMock.mockResolvedValue({ data: null, error: { message: 'db down' } });
    await expect(
      recordGroqDemoResult({ userId: USER, inputTokens: 1, outputTokens: 2, failed: false }),
    ).resolves.toBeUndefined();
    expect(rpcMock).toHaveBeenCalledWith('record_platform_llm_result', expect.objectContaining({ p_failed: false }));
  });
});

describe('getGroqDemoUsage', () => {
  it('returns the current request count', async () => {
    rpcMock.mockResolvedValue({
      data: [{ request_count: 2, reset_at: '2026-07-25T00:00:00Z' }],
      error: null,
    });
    const u = await getGroqDemoUsage(USER);
    expect(u.requestCount).toBe(2);
  });

  it('defaults to zero on error', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'x' } });
    const u = await getGroqDemoUsage(USER);
    expect(u.requestCount).toBe(0);
  });
});
