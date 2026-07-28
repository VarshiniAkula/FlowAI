import { NextResponse } from 'next/server';

import { getLlmStatus } from '@/lib/llm/status';

export const runtime = 'nodejs';

/**
 * GET /api/llm-status — sanitized LLM provider status for the simulator/editor.
 * Reports which provider would be selected for the LLM Response node and, for
 * Groq demo, the remaining daily allowance + reset time. No reservation, no key
 * material. Always no-store.
 */
export async function GET() {
  try {
    const status = await getLlmStatus();
    return NextResponse.json(status, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    // Fail safe: report simulation rather than leaking any error detail.
    return NextResponse.json(
      {
        mode: 'simulation',
        provider: 'deterministic',
        realAiAvailable: false,
        fallbackReason: 'GROQ_UNKNOWN_ERROR',
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
