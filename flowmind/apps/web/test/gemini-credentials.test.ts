import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory cookie store backing a mocked next/headers.
const store = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (n: string) => (store.has(n) ? { name: n, value: store.get(n)! } : undefined),
    set: (n: string, v: string) => void store.set(n, v),
    delete: (n: string) => void store.delete(n),
  }),
}));

import {
  clearByokCredential,
  getGeminiStatus,
  resolveGeminiCredential,
  setByokCredential,
} from '@/lib/gemini/credentials';
import { encryptSession } from '@/lib/gemini/encryption';
import { GEMINI_COOKIE_NAME } from '@/lib/gemini/limits';

beforeEach(() => {
  store.clear();
  process.env.BYOK_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  delete process.env.GEMINI_API_KEY;
});

describe('resolveGeminiCredential precedence', () => {
  it('prefers a valid BYOK session over the platform key', async () => {
    process.env.GEMINI_API_KEY = 'platform-key';
    await setByokCredential('user-key-ABCD', 'ABCD');
    const src = await resolveGeminiCredential();
    expect(src.mode).toBe('byok');
    if (src.mode === 'byok') expect(src.apiKey).toBe('user-key-ABCD');
  });

  it('uses the platform key when no BYOK session exists', async () => {
    process.env.GEMINI_API_KEY = 'platform-key';
    const src = await resolveGeminiCredential();
    expect(src.mode).toBe('platform');
    if (src.mode === 'platform') expect(src.apiKey).toBe('platform-key');
  });

  it('falls back when neither exists', async () => {
    const src = await resolveGeminiCredential();
    expect(src.mode).toBe('fallback');
  });

  it('does not treat an expired BYOK session as connected, and removes it', async () => {
    store.set(
      GEMINI_COOKIE_NAME,
      encryptSession({
        version: 1,
        apiKey: 'expired',
        keyLastFour: 'ired',
        connectedAt: Date.now() - 10_000,
        expiresAt: Date.now() - 1,
      }),
    );
    const src = await resolveGeminiCredential();
    expect(src.mode).toBe('fallback');
    expect(store.has(GEMINI_COOKIE_NAME)).toBe(false);
  });

  it('removes an invalid/tampered cookie', async () => {
    store.set(GEMINI_COOKIE_NAME, 'not-a-valid-cookie');
    const src = await resolveGeminiCredential();
    expect(src.mode).toBe('fallback');
    expect(store.has(GEMINI_COOKIE_NAME)).toBe(false);
  });
});

describe('getGeminiStatus', () => {
  it('never includes key material for BYOK', async () => {
    await setByokCredential('super-secret-key-WXYZ', 'WXYZ');
    const status = await getGeminiStatus();
    expect(status).toMatchObject({ connected: true, mode: 'byok', keyLastFour: 'WXYZ' });
    expect(JSON.stringify(status)).not.toContain('super-secret-key');
  });

  it('is idempotent to disconnect', async () => {
    await setByokCredential('user-key-ABCD', 'ABCD');
    await clearByokCredential();
    await clearByokCredential();
    const status = await getGeminiStatus();
    expect(status.connected).toBe(false);
  });
});
