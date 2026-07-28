import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the Gemini credential resolver so we can drive precedence deterministically.
vi.mock('@/lib/gemini/credentials', () => ({
  resolveGeminiCredential: vi.fn(),
}));

import { resolveGeminiCredential } from '@/lib/gemini/credentials';
import { resolveLlmProvider } from '@/lib/llm/resolver';

const mockCred = vi.mocked(resolveGeminiCredential);

const ENV = [
  'GROQ_DEMO_ENABLED',
  'GROQ_API_KEY',
  'ALLOW_PLATFORM_GEMINI_LLM_FALLBACK',
];
function clearEnv() {
  for (const k of ENV) delete process.env[k];
}

function enableGroq() {
  process.env.GROQ_DEMO_ENABLED = 'true';
  process.env.GROQ_API_KEY = 'gsk_secret';
}

beforeEach(() => {
  clearEnv();
  mockCred.mockReset();
});
afterEach(clearEnv);

describe('resolveLlmProvider precedence', () => {
  it('Gemini BYOK takes precedence over Groq', async () => {
    enableGroq();
    mockCred.mockResolvedValue({
      mode: 'byok',
      apiKey: 'k',
      keyLastFour: 'ABCD',
      expiresAt: Date.now() + 1000,
    });
    const r = await resolveLlmProvider();
    expect(r.mode).toBe('gemini-byok');
  });

  it('selects Groq when BYOK is absent and Groq is enabled', async () => {
    enableGroq();
    mockCred.mockResolvedValue({ mode: 'fallback' });
    const r = await resolveLlmProvider();
    expect(r.mode).toBe('groq-demo');
  });

  it('Groq beats platform Gemini even when a platform key exists', async () => {
    enableGroq();
    mockCred.mockResolvedValue({ mode: 'platform', apiKey: 'plat' });
    const r = await resolveLlmProvider();
    expect(r.mode).toBe('groq-demo');
  });

  it('ignores platform Gemini by default (flag off)', async () => {
    mockCred.mockResolvedValue({ mode: 'platform', apiKey: 'plat' });
    const r = await resolveLlmProvider();
    expect(r.mode).toBe('simulation');
  });

  it('uses platform Gemini only when explicitly enabled', async () => {
    process.env.ALLOW_PLATFORM_GEMINI_LLM_FALLBACK = 'true';
    mockCred.mockResolvedValue({ mode: 'platform', apiKey: 'plat' });
    const r = await resolveLlmProvider();
    expect(r.mode).toBe('gemini-platform');
  });

  it('falls back to simulation when nothing is available', async () => {
    mockCred.mockResolvedValue({ mode: 'fallback' });
    const r = await resolveLlmProvider();
    expect(r).toMatchObject({ mode: 'simulation', fallbackReason: 'GROQ_NOT_CONFIGURED' });
  });

  it('never returns Groq for a BYOK credential (no silent provider switch)', async () => {
    enableGroq();
    mockCred.mockResolvedValue({
      mode: 'byok',
      apiKey: 'k',
      keyLastFour: 'ABCD',
      expiresAt: Date.now() + 1000,
    });
    const r = await resolveLlmProvider();
    expect(r.mode).not.toBe('groq-demo');
  });
});
