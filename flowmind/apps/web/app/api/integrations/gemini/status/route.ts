import { getGeminiStatus } from '@/lib/gemini/credentials';
import { errorResponse, jsonNoStore } from '@/lib/gemini/request';

export const runtime = 'nodejs';

/**
 * GET /api/integrations/gemini/status
 * Returns the sanitized connection status. Malformed/expired BYOK cookies are
 * deleted as a side effect of resolving. Never returns key material or
 * platform-key details.
 */
export async function GET() {
  try {
    const status = await getGeminiStatus();
    return jsonNoStore(status);
  } catch (err) {
    return errorResponse(err);
  }
}
