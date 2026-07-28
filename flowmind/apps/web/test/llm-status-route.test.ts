import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/llm/resolver', () => ({ resolveLlmProvider: vi.fn() }));
vi.mock('@/lib/groq/usage', () => ({ getGroqDemoUsage: vi.fn() }));
vi.mock('@/lib/auth/guards', () => ({ requireUser: vi.fn() }));

import { GET } from '@/app/api/llm-status/route';
import { resolveLlmProvider } from '@/lib/llm/resolver';
import { getGroqDemoUsage } from '@/lib/groq/usage';
import { requireUser } from '@/lib/auth/guards';

const mResolve = vi.mocked(resolveLlmProvider);
const mUsage = vi.mocked(getGroqDemoUsage);
const mUser = vi.mocked(requireUser);

const SECRET = 'gsk_super_secret';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GROQ_API_KEY = SECRET;
});

describe('GET /api/llm-status', () => {
  it('is always no-store', async () => {
    mResolve.mockResolvedValue({ mode: 'simulation', fallbackReason: 'GROQ_NOT_CONFIGURED' });
    const res = await GET();
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('reports Gemini BYOK', async () => {
    mResolve.mockResolvedValue({ mode: 'gemini-byok', apiKey: 'k', keyLastFour: 'ABCD', expiresAt: Date.now() + 1000 });
    const body = await (await GET()).json();
    expect(body).toMatchObject({ mode: 'gemini-byok', provider: 'gemini', realAiAvailable: true });
  });

  it('reports Groq demo with remaining allowance and never leaks the key', async () => {
    mResolve.mockResolvedValue({ mode: 'groq-demo' });
    mUser.mockResolvedValue({ id: 'u1', email: 'a@b.co' });
    mUsage.mockResolvedValue({ requestCount: 2, resetAt: '2026-07-25T00:00:00Z' });
    const body = await (await GET()).json();
    expect(body).toMatchObject({
      mode: 'groq-demo',
      provider: 'groq',
      realAiAvailable: true,
      demoRequestsRemaining: 3, // default limit 5 - 2 used
      demoDailyLimit: 5,
    });
    expect(JSON.stringify(body)).not.toContain(SECRET);
  });

  it('reports simulation (not Groq) for an unauthenticated caller', async () => {
    mResolve.mockResolvedValue({ mode: 'groq-demo' });
    mUser.mockRejectedValue(new Error('unauth'));
    const body = await (await GET()).json();
    expect(body).toMatchObject({ mode: 'simulation', realAiAvailable: false, fallbackReason: 'GROQ_NOT_AUTHENTICATED' });
  });

  it('reports simulation with a fallback reason when no provider is available', async () => {
    mResolve.mockResolvedValue({ mode: 'simulation', fallbackReason: 'GROQ_NOT_CONFIGURED' });
    const body = await (await GET()).json();
    expect(body).toMatchObject({ mode: 'simulation', realAiAvailable: false, fallbackReason: 'GROQ_NOT_CONFIGURED' });
  });
});
