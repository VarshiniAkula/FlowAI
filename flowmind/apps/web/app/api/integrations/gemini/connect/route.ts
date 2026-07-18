import { z } from 'zod';

import { validateCredential, lastFour } from '@/lib/gemini/client';
import { setByokCredential } from '@/lib/gemini/credentials';
import { GeminiError } from '@/lib/gemini/errors';
import { LIMITS } from '@/lib/gemini/limits';
import { assertSameOrigin, errorResponse, jsonNoStore } from '@/lib/gemini/request';

// Node runtime: the credential resolver and encryption use Node's crypto.
export const runtime = 'nodejs';

const ConnectSchema = z.object({
  // Trim, require a reasonable length, cap the size. No provider-specific
  // prefix or exact length is assumed — the key is validated by calling Gemini.
  apiKey: z.string().trim().min(LIMITS.minApiKeyChars).max(LIMITS.maxApiKeyChars),
});

/**
 * POST /api/integrations/gemini/connect
 * Validates a user-supplied Gemini key against a low-cost metadata request,
 * then stores it in an encrypted HttpOnly session cookie. The raw key never
 * leaves the server and is never logged.
 */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      throw new GeminiError('INVALID_REQUEST', 'Expected a JSON body.');
    }

    const parsed = ConnectSchema.safeParse(raw);
    if (!parsed.success) {
      // Do NOT echo the body — only a generic validation error.
      throw new GeminiError('INVALID_REQUEST', 'A valid Gemini API key is required.');
    }

    const apiKey = parsed.data.apiKey;

    // Validate against the provider (auth + a usable text model exists).
    await validateCredential(apiKey);

    // Persist encrypted; return only sanitized metadata.
    const status = await setByokCredential(apiKey, lastFour(apiKey));

    // Safe log: mode + route only, never the body or key.
    console.info('[gemini/connect] connected', { mode: 'byok', route: '/api/integrations/gemini/connect' });

    return jsonNoStore(status);
  } catch (err) {
    return errorResponse(err);
  }
}
