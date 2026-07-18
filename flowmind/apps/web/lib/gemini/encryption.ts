import 'server-only';

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import { GeminiError } from './errors';
import { GEMINI_SESSION_VERSION } from './limits';

/**
 * Authenticated encryption for the Gemini BYOK session cookie.
 *
 * Uses AES-256-GCM from Node's crypto. The plaintext is the JSON-encoded
 * session payload; the encoded cookie value carries version + IV + ciphertext +
 * auth tag. A new random IV is generated per encryption. Decryption verifies
 * the GCM auth tag, so any modification (ciphertext or tag) is rejected. A
 * wrong key, unsupported version, or malformed value all raise a sanitized
 * error that never echoes the payload.
 */

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12; // GCM standard nonce length
const TAG_BYTES = 16;
const KEY_BYTES = 32; // AES-256

export interface GeminiCredentialSession {
  version: typeof GEMINI_SESSION_VERSION;
  apiKey: string;
  keyLastFour: string;
  connectedAt: number;
  expiresAt: number;
}

/**
 * Load and validate the server encryption key. Requires BYOK_ENCRYPTION_KEY to
 * be base64 for exactly 32 bytes. Throws a sanitized CONFIG_ERROR (never
 * including the key value) if missing or malformed.
 */
export function getEncryptionKey(): Buffer {
  const raw = process.env.BYOK_ENCRYPTION_KEY;
  if (!raw || raw.trim() === '') {
    throw new GeminiError(
      'CONFIG_ERROR',
      'BYOK_ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32',
    );
  }
  let decoded: Buffer;
  try {
    decoded = Buffer.from(raw.trim(), 'base64');
  } catch {
    throw new GeminiError('CONFIG_ERROR', 'BYOK_ENCRYPTION_KEY is not valid base64.');
  }
  if (decoded.length !== KEY_BYTES) {
    throw new GeminiError(
      'CONFIG_ERROR',
      `BYOK_ENCRYPTION_KEY must decode to exactly ${KEY_BYTES} bytes (got ${decoded.length}).`,
    );
  }
  return decoded;
}

/**
 * Encrypt a session payload into a compact cookie string:
 *   v<version>.<iv_b64url>.<ciphertext_b64url>.<tag_b64url>
 */
export function encryptSession(session: GeminiCredentialSession): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const plaintext = Buffer.from(JSON.stringify(session), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    `v${GEMINI_SESSION_VERSION}`,
    b64url(iv),
    b64url(ciphertext),
    b64url(tag),
  ].join('.');
}

/**
 * Decrypt and validate a cookie string back into a session payload.
 *
 * Throws a sanitized GeminiError (SESSION_EXPIRED for expiry, INVALID_REQUEST
 * for any structural/auth/version failure) without ever including the encoded
 * payload or decryption internals. Callers treat any throw as "disconnected"
 * and delete the cookie.
 */
export function decryptSession(value: string): GeminiCredentialSession {
  const parts = value.split('.');
  if (parts.length !== 4) {
    throw new GeminiError('INVALID_REQUEST', 'Malformed session cookie.');
  }
  const [versionTag, ivB64, ctB64, tagB64] = parts;
  if (!versionTag || !ivB64 || !ctB64 || !tagB64) {
    throw new GeminiError('INVALID_REQUEST', 'Malformed session cookie.');
  }

  if (versionTag !== `v${GEMINI_SESSION_VERSION}`) {
    throw new GeminiError('INVALID_REQUEST', 'Unsupported session version.');
  }

  let iv: Buffer;
  let ciphertext: Buffer;
  let tag: Buffer;
  try {
    iv = fromB64url(ivB64);
    ciphertext = fromB64url(ctB64);
    tag = fromB64url(tagB64);
  } catch {
    throw new GeminiError('INVALID_REQUEST', 'Malformed session cookie.');
  }
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new GeminiError('INVALID_REQUEST', 'Malformed session cookie.');
  }

  const key = getEncryptionKey();
  let plaintext: Buffer;
  try {
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    // GCM auth failure (tampered ciphertext/tag or wrong key). Do not log the
    // payload; surface only a generic sanitized error.
    throw new GeminiError('INVALID_REQUEST', 'Session could not be verified.');
  }

  let session: GeminiCredentialSession;
  try {
    session = JSON.parse(plaintext.toString('utf8')) as GeminiCredentialSession;
  } catch {
    throw new GeminiError('INVALID_REQUEST', 'Session payload could not be parsed.');
  }

  if (
    session.version !== GEMINI_SESSION_VERSION ||
    typeof session.apiKey !== 'string' ||
    typeof session.expiresAt !== 'number' ||
    typeof session.keyLastFour !== 'string'
  ) {
    throw new GeminiError('INVALID_REQUEST', 'Session payload is invalid.');
  }

  if (Date.now() >= session.expiresAt) {
    throw new GeminiError('SESSION_EXPIRED');
  }

  return session;
}

/** Constant-time equality helper (exported for tests / auxiliary checks). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s, 'base64url');
}
