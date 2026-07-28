import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock every provider/dependency so the route logic is tested in isolation with
// no network, credentials, or database.
vi.mock('@/lib/llm/resolver', () => ({ resolveLlmProvider: vi.fn() }));
vi.mock('@/lib/llm/providers/groq', () => ({ groqGenerate: vi.fn(), groqStream: vi.fn() }));
vi.mock('@/lib/llm/providers/gemini', () => ({
  geminiGenerate: vi.fn(),
  geminiStreamAdapter: vi.fn(),
}));
vi.mock('@/lib/groq/usage', () => ({
  reserveGroqDemoRequest: vi.fn(),
  recordGroqDemoResult: vi.fn().mockResolvedValue(undefined),
  getGroqDemoUsage: vi.fn().mockResolvedValue({ requestCount: 0, resetAt: '2026-07-25T00:00:00Z' }),
}));
vi.mock('@/lib/auth/guards', () => ({ requireUser: vi.fn() }));

import { POST } from '@/app/api/llm-complete/route';
import { resolveLlmProvider } from '@/lib/llm/resolver';
import { groqGenerate, groqStream } from '@/lib/llm/providers/groq';
import { geminiGenerate } from '@/lib/llm/providers/gemini';
import { reserveGroqDemoRequest, recordGroqDemoResult, getGroqDemoUsage } from '@/lib/groq/usage';
import { requireUser } from '@/lib/auth/guards';
import { GroqError } from '@/lib/llm/errors';

const mResolve = vi.mocked(resolveLlmProvider);
const mGroqGen = vi.mocked(groqGenerate);
const mGroqStream = vi.mocked(groqStream);
const mGeminiGen = vi.mocked(geminiGenerate);
const mReserve = vi.mocked(reserveGroqDemoRequest);
const mRecord = vi.mocked(recordGroqDemoResult);
const mGetUsage = vi.mocked(getGroqDemoUsage);
const mUser = vi.mocked(requireUser);

const USER = { id: 'user-1', email: 'a@b.co' };
const SECRET = 'gsk_secret_key';

function req(body: unknown, stream = false) {
  const url = stream ? 'http://localhost/api/llm-complete?stream=1' : 'http://localhost/api/llm-complete';
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost', host: 'localhost' },
    body: JSON.stringify(body),
  });
}

async function readSse(res: Response): Promise<Array<{ event: string; data: any }>> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const out: Array<{ event: string; data: any }> = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let event = 'message';
      let data = '';
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (data) out.push({ event, data: JSON.parse(data) });
    }
  }
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
  mRecord.mockResolvedValue(undefined);
  mGetUsage.mockResolvedValue({ requestCount: 0, resetAt: '2026-07-25T00:00:00Z' });
  process.env.GROQ_API_KEY = SECRET;
});
afterEach(() => {
  delete process.env.GROQ_API_KEY;
});

describe('Gemini BYOK', () => {
  it('returns a compatible JSON body and never consumes the Groq allowance', async () => {
    mResolve.mockResolvedValue({ mode: 'gemini-byok', apiKey: 'k', keyLastFour: 'ABCD', expiresAt: Date.now() + 1000 });
    mGeminiGen.mockResolvedValue({ text: 'gemini says hi', model: 'gemini-2.0-flash', usage: { inputTokens: 3, outputTokens: 4 } });

    const res = await POST(req({ userPrompt: 'Hi' }));
    const body = await res.json();
    expect(body).toMatchObject({ text: 'gemini says hi', provider: 'gemini', providerMode: 'gemini-byok' });
    expect(mReserve).not.toHaveBeenCalled();
    expect(mRecord).not.toHaveBeenCalled();
  });
});

describe('Groq demo — non-streaming', () => {
  beforeEach(() => {
    mResolve.mockResolvedValue({ mode: 'groq-demo' });
    mUser.mockResolvedValue(USER);
  });

  it('returns a real Groq response with demo metadata and records success', async () => {
    mReserve.mockResolvedValue({ allowed: true, remaining: 4, resetAt: '2026-07-25T00:00:00Z' });
    mGroqGen.mockResolvedValue({ text: 'groq answer', model: 'openai/gpt-oss-20b', usage: { inputTokens: 10, outputTokens: 5 } });

    const res = await POST(req({ userPrompt: 'Hi' }));
    const body = await res.json();
    expect(body).toMatchObject({
      text: 'groq answer',
      provider: 'groq',
      providerMode: 'groq-demo',
      model: 'openai/gpt-oss-20b',
      demoRequestsRemaining: 4,
    });
    expect(mRecord).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1', failed: false }));
    expect(JSON.stringify(body)).not.toContain(SECRET);
    expect(JSON.stringify(body)).not.toContain('reasoning');
  });

  it('falls back transparently to simulation at the user limit (Groq not called)', async () => {
    mReserve.mockResolvedValue({ allowed: false, reason: 'USER_DAILY_LIMIT', remaining: 0, resetAt: '2026-07-25T00:00:00Z' });
    const res = await POST(req({ userPrompt: 'Hi' }));
    const body = await res.json();
    expect(body).toMatchObject({ provider: 'deterministic', providerMode: 'simulation', fallbackReason: 'GROQ_USER_LIMIT_REACHED', demoRequestsRemaining: 0 });
    expect(mGroqGen).not.toHaveBeenCalled();
  });

  it('falls back transparently at the global limit', async () => {
    mReserve.mockResolvedValue({ allowed: false, reason: 'GLOBAL_DAILY_LIMIT', remaining: 0, resetAt: '2026-07-25T00:00:00Z' });
    const res = await POST(req({ userPrompt: 'Hi' }));
    const body = await res.json();
    expect(body.fallbackReason).toBe('GROQ_GLOBAL_LIMIT_REACHED');
  });

  it('falls back for an oversized Groq prompt without calling Groq or reserving', async () => {
    const big = 'x'.repeat(7000); // > GROQ_DEMO_MAX_PROMPT_CHARS(6000), < general limit(20000)
    const res = await POST(req({ userPrompt: big }));
    const body = await res.json();
    expect(body).toMatchObject({ provider: 'deterministic', fallbackReason: 'GROQ_PROMPT_TOO_LARGE' });
    expect(mReserve).not.toHaveBeenCalled();
    expect(mGroqGen).not.toHaveBeenCalled();
  });

  it('on a Groq failure records the failed slot and returns a labeled simulation', async () => {
    mReserve.mockResolvedValue({ allowed: true, remaining: 3, resetAt: '2026-07-25T00:00:00Z' });
    mGroqGen.mockRejectedValue(new GroqError('GROQ_RATE_LIMITED'));
    const res = await POST(req({ userPrompt: 'Hi' }));
    const body = await res.json();
    expect(body).toMatchObject({ provider: 'deterministic', fallbackReason: 'GROQ_RATE_LIMITED', demoRequestsRemaining: 3 });
    expect(mRecord).toHaveBeenCalledWith(expect.objectContaining({ failed: true }));
  });
});

describe('Groq demo — unauthenticated', () => {
  it('never reserves and returns simulation for an unauthenticated caller', async () => {
    mResolve.mockResolvedValue({ mode: 'groq-demo' });
    mUser.mockRejectedValue(new Error('unauth'));
    const res = await POST(req({ userPrompt: 'Hi' }));
    const body = await res.json();
    expect(body).toMatchObject({ provider: 'deterministic', fallbackReason: 'GROQ_NOT_AUTHENTICATED' });
    expect(mReserve).not.toHaveBeenCalled();
  });
});

describe('Groq demo — streaming', () => {
  beforeEach(() => {
    mResolve.mockResolvedValue({ mode: 'groq-demo' });
    mUser.mockResolvedValue(USER);
    mReserve.mockResolvedValue({ allowed: true, remaining: 2, resetAt: '2026-07-25T00:00:00Z' });
  });

  it('streams chunks then a done frame with Groq metadata', async () => {
    async function* gen(): AsyncGenerator<string, any> {
      yield 'Hel';
      yield 'lo';
      return { inputTokens: 3, outputTokens: 2 };
    }
    mGroqStream.mockResolvedValue({ model: 'openai/gpt-oss-20b', provider: 'groq', providerMode: 'groq-demo', deltas: gen() });

    const events = await readSse(await POST(req({ userPrompt: 'Hi' }, true), ));
    const chunks = events.filter((e) => e.event === 'chunk').map((e) => e.data.delta);
    const done = events.find((e) => e.event === 'done')!;
    expect(chunks.join('')).toBe('Hello');
    expect(done.data).toMatchObject({ provider: 'groq', providerMode: 'groq-demo', demoRequestsRemaining: 2 });
    expect(JSON.stringify(events)).not.toContain(SECRET);
  });

  it('a timeout BEFORE streaming falls back transparently to simulation', async () => {
    mGroqStream.mockRejectedValue(new GroqError('GROQ_TIMEOUT'));
    const events = await readSse(await POST(req({ userPrompt: 'Hi' }, true)));
    const done = events.find((e) => e.event === 'done')!;
    expect(done.data).toMatchObject({ provider: 'deterministic', fallbackReason: 'GROQ_TIMEOUT' });
    expect(events.find((e) => e.event === 'error')).toBeUndefined();
    expect(mRecord).toHaveBeenCalledWith(expect.objectContaining({ failed: true }));
  });

  it('a failure AFTER streaming begins emits an error event and does not append a simulated answer', async () => {
    async function* gen(): AsyncGenerator<string, any> {
      yield 'partial';
      throw new GroqError('GROQ_PROVIDER_UNAVAILABLE');
    }
    mGroqStream.mockResolvedValue({ model: 'openai/gpt-oss-20b', provider: 'groq', providerMode: 'groq-demo', deltas: gen() });

    const events = await readSse(await POST(req({ userPrompt: 'Hi' }, true)));
    expect(events.some((e) => e.event === 'chunk' && e.data.delta === 'partial')).toBe(true);
    expect(events.some((e) => e.event === 'error')).toBe(true);
    // No done frame with a deterministic answer appended after the partial.
    expect(events.some((e) => e.event === 'done')).toBe(false);
    expect(mRecord).toHaveBeenCalledWith(expect.objectContaining({ failed: true }));
  });
});

describe('simulation mode', () => {
  it('returns a clearly-labeled deterministic response', async () => {
    mResolve.mockResolvedValue({ mode: 'simulation', fallbackReason: 'GROQ_NOT_CONFIGURED' });
    const res = await POST(req({ userPrompt: 'Hi' }));
    const body = await res.json();
    expect(body).toMatchObject({ provider: 'deterministic', providerMode: 'simulation', fallbackReason: 'GROQ_NOT_CONFIGURED' });
  });
});
