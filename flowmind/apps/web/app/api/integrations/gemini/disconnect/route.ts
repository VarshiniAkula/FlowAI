import { clearByokCredential } from '@/lib/gemini/credentials';
import type { GeminiStatus } from '@/lib/gemini/types';
import { assertSameOrigin, errorResponse, jsonNoStore } from '@/lib/gemini/request';

export const runtime = 'nodejs';

/**
 * DELETE /api/integrations/gemini/disconnect
 * Deletes the BYOK session cookie and returns the resulting mode. Idempotent —
 * calling it with no active session still succeeds.
 */
export async function DELETE(req: Request) {
  try {
    assertSameOrigin(req);
    await clearByokCredential();

    const platform = process.env.GEMINI_API_KEY?.trim();
    const status: GeminiStatus = platform
      ? { connected: true, mode: 'platform' }
      : { connected: false, mode: 'fallback' };

    console.info('[gemini/disconnect] cleared', { route: '/api/integrations/gemini/disconnect' });
    return jsonNoStore(status);
  } catch (err) {
    return errorResponse(err);
  }
}
