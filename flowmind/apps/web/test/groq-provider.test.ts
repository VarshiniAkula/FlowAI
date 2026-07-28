import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the Groq SDK: never hit the network. `createMock` stands in for
// client.chat.completions.create.
const createMock = vi.fn();
vi.mock('groq-sdk', () => ({
  default: class MockGroq {
    chat = { completions: { create: (...args: unknown[]) => createMock(...args) } };
    constructor(_opts: unknown) {}
  },
}));

import { groqGenerate, groqStream } from '@/lib/llm/providers/groq';
import { GroqError } from '@/lib/llm/errors';

const SECRET_KEY = 'gsk_super_secret_key_value';

function setEnv(extra: Record<string, string> = {}) {
  process.env.GROQ_DEMO_ENABLED = 'true';
  process.env.GROQ_API_KEY = SECRET_KEY;
  for (const [k, v] of Object.entries(extra)) process.env[k] = v;
}
function clearEnv() {
  for (const k of [
    'GROQ_DEMO_ENABLED',
    'GROQ_API_KEY',
    'GROQ_LLM_MODEL',
    'GROQ_DEMO_MAX_OUTPUT_TOKENS',
  ]) {
    delete process.env[k];
  }
}

async function* toStream(chunks: unknown[]) {
  for (const c of chunks) yield c;
}

beforeEach(() => {
  createMock.mockReset();
  clearEnv();
  setEnv();
});
afterEach(clearEnv);

describe('groqGenerate (non-streaming)', () => {
  it('uses the configured model, low reasoning effort, hidden reasoning, and capped tokens', async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: 'hello', reasoning: 'SECRET_REASONING' } }],
      usage: { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19 },
    });
    const r = await groqGenerate({ systemPrompt: 'You are a bot.', userPrompt: 'Hi', temperature: 5 });

    const body = createMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(body.model).toBe('openai/gpt-oss-20b');
    expect(body.reasoning_effort).toBe('low');
    expect(body.reasoning_format).toBe('hidden');
    // Must NOT also send include_reasoning — Groq rejects the pair (400).
    expect(body.include_reasoning).toBeUndefined();
    expect(body.max_completion_tokens).toBe(300);
    // temperature clamped into the safe range
    expect(body.temperature).toBeLessThanOrEqual(1.5);

    // messages: system (with safety suffix) + user
    const messages = body.messages as Array<{ role: string; content: string }>;
    expect(messages[0]!.role).toBe('system');
    expect(messages[0]!.content).toContain('You are a bot.');
    expect(messages[0]!.content.toLowerCase()).toContain('do not expose provider');
    expect(messages[1]).toEqual({ role: 'user', content: 'Hi' });

    // normalized output + usage; reasoning is never surfaced
    expect(r.text).toBe('hello');
    expect(r.usage).toEqual({ inputTokens: 12, outputTokens: 7, totalTokens: 19 });
    expect(JSON.stringify(r)).not.toContain('SECRET_REASONING');
    // API key never appears in returned metadata
    expect(JSON.stringify(r)).not.toContain(SECRET_KEY);
  });

  it('honors a configured output-token cap', async () => {
    setEnv({ GROQ_DEMO_MAX_OUTPUT_TOKENS: '128' });
    createMock.mockResolvedValue({ choices: [{ message: { content: 'x' } }] });
    await groqGenerate({ userPrompt: 'Hi' });
    const body = createMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(body.max_completion_tokens).toBe(128);
  });

  it('maps a 429 to a rate-limited GroqError', async () => {
    createMock.mockRejectedValue({ status: 429, message: 'rate limit' });
    await expect(groqGenerate({ userPrompt: 'Hi' })).rejects.toMatchObject({
      code: 'GROQ_RATE_LIMITED',
    });
  });

  it('maps a 5xx to provider-unavailable', async () => {
    createMock.mockRejectedValue({ status: 503 });
    await expect(groqGenerate({ userPrompt: 'Hi' })).rejects.toMatchObject({
      code: 'GROQ_PROVIDER_UNAVAILABLE',
    });
  });

  it('maps an abort/timeout correctly', async () => {
    createMock.mockRejectedValue({ name: 'AbortError' });
    const err = await groqGenerate({ userPrompt: 'Hi' }).catch((e) => e);
    expect(err).toBeInstanceOf(GroqError);
    expect(err.code).toBe('GROQ_TIMEOUT');
  });
});

describe('groqStream (streaming)', () => {
  it('normalizes deltas, skips empties, ignores reasoning, and captures usage', async () => {
    createMock.mockResolvedValue(
      toStream([
        { choices: [{ delta: { content: 'Hel' } }] },
        { choices: [{ delta: { content: '' } }] }, // empty → skipped
        { choices: [{ delta: { reasoning: 'SECRET' } }] }, // reasoning → ignored
        { choices: [{ delta: { content: 'lo' } }] },
        { choices: [{ delta: {} }], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } },
      ]),
    );

    const s = await groqStream({ userPrompt: 'Hi' });
    expect(s.provider).toBe('groq');
    expect(s.providerMode).toBe('groq-demo');

    const deltas: string[] = [];
    let usage;
    while (true) {
      const next = await s.deltas.next();
      if (next.done) {
        usage = next.value;
        break;
      }
      deltas.push(next.value);
    }
    expect(deltas).toEqual(['Hel', 'lo']);
    expect(deltas.join('')).not.toContain('SECRET');
    expect(usage).toEqual({ inputTokens: 3, outputTokens: 2, totalTokens: 5 });

    const body = createMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(body.stream).toBe(true);
    expect(body.reasoning_format).toBe('hidden');
    expect(body.include_reasoning).toBeUndefined();
  });

  it('maps a create() failure before streaming to a GroqError', async () => {
    createMock.mockRejectedValue({ status: 429 });
    await expect(groqStream({ userPrompt: 'Hi' })).rejects.toMatchObject({
      code: 'GROQ_RATE_LIMITED',
    });
  });
});
