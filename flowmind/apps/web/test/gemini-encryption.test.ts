import { randomBytes } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  decryptSession,
  encryptSession,
  getEncryptionKey,
  type GeminiCredentialSession,
} from '@/lib/gemini/encryption';
import { GeminiError } from '@/lib/gemini/errors';

const VALID_KEY = randomBytes(32).toString('base64');

function makeSession(over: Partial<GeminiCredentialSession> = {}): GeminiCredentialSession {
  return {
    version: 1,
    apiKey: 'AIza-SECRET-test-key-abcdef1234567890',
    keyLastFour: '7890',
    connectedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    ...over,
  };
}

beforeAll(() => {
  process.env.BYOK_ENCRYPTION_KEY = VALID_KEY;
});

describe('encryption key validation', () => {
  it('accepts a 32-byte base64 key', () => {
    process.env.BYOK_ENCRYPTION_KEY = VALID_KEY;
    expect(getEncryptionKey().length).toBe(32);
  });

  it('rejects a missing key without leaking its value', () => {
    delete process.env.BYOK_ENCRYPTION_KEY;
    expect(() => getEncryptionKey()).toThrowError(GeminiError);
    process.env.BYOK_ENCRYPTION_KEY = VALID_KEY;
  });

  it('rejects a key that is not exactly 32 bytes', () => {
    process.env.BYOK_ENCRYPTION_KEY = randomBytes(16).toString('base64');
    expect(() => getEncryptionKey()).toThrowError(/32 bytes/);
    process.env.BYOK_ENCRYPTION_KEY = VALID_KEY;
  });
});

describe('encrypt / decrypt', () => {
  it('round-trips a session', () => {
    const s = makeSession();
    const out = decryptSession(encryptSession(s));
    expect(out).toEqual(s);
  });

  it('uses a fresh IV each time (ciphertext differs)', () => {
    const s = makeSession();
    expect(encryptSession(s)).not.toBe(encryptSession(s));
  });

  it('rejects tampered ciphertext', () => {
    const s = makeSession();
    const parts = encryptSession(s).split('.');
    parts[2] = flip(parts[2]!);
    expect(() => decryptSession(parts.join('.'))).toThrowError(GeminiError);
  });

  it('rejects a tampered auth tag', () => {
    const s = makeSession();
    const parts = encryptSession(s).split('.');
    parts[3] = flip(parts[3]!);
    expect(() => decryptSession(parts.join('.'))).toThrowError(GeminiError);
  });

  it('rejects decryption with the wrong key', () => {
    const token = encryptSession(makeSession());
    process.env.BYOK_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    try {
      expect(() => decryptSession(token)).toThrowError(GeminiError);
    } finally {
      process.env.BYOK_ENCRYPTION_KEY = VALID_KEY;
    }
  });

  it('rejects an expired session', () => {
    const token = encryptSession(makeSession({ expiresAt: Date.now() - 1 }));
    let thrown: unknown;
    try {
      decryptSession(token);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(GeminiError);
    expect((thrown as GeminiError).code).toBe('SESSION_EXPIRED');
  });

  it('rejects an unsupported payload version', () => {
    const token = encryptSession(makeSession());
    const parts = token.split('.');
    parts[0] = 'v2';
    expect(() => decryptSession(parts.join('.'))).toThrowError(/version/i);
  });

  it('does not leak the payload in malformed-cookie errors', () => {
    const secret = 'THIS_IS_A_SECRET_PAYLOAD_VALUE';
    let msg = '';
    try {
      decryptSession(secret);
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).not.toContain(secret);
  });
});

function flip(seg: string): string {
  const c = seg[0] === 'A' ? 'B' : 'A';
  return c + seg.slice(1);
}
