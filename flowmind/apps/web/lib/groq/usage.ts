import 'server-only';

import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { GROQ_USAGE_PROVIDER } from '@/lib/llm/config';

/**
 * Persistent, atomic daily quota for platform-funded Groq demo requests.
 *
 * Enforcement lives in Postgres (see migration 0009): the
 * `reserve_platform_llm_request` function serializes concurrent reservations
 * with a transaction advisory lock and increments the per-user counter only
 * when both the per-user and global daily caps permit it. In-memory counters
 * are NOT used — they are unreliable across Vercel's serverless instances.
 *
 * This module talks to those functions through the service-role client (RLS is
 * deny-all on the counter table). No prompt content is ever stored — metadata
 * only (provider, model, token counts, duration, success/failure).
 */

export type GroqReservationResult =
  | { allowed: true; remaining: number; resetAt: string }
  | {
      allowed: false;
      reason: 'USER_DAILY_LIMIT' | 'GLOBAL_DAILY_LIMIT';
      remaining: 0;
      resetAt: string;
    };

/** Fallback reset timestamp: next UTC midnight. Used only if the RPC omits one. */
function nextUtcMidnightIso(): string {
  const now = new Date();
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0),
  );
  return next.toISOString();
}

/**
 * Atomically reserve one Groq demo request for `userId`. Reserve immediately
 * before calling Groq; a reserved request counts against the allowance even if
 * the provider later fails (it consumed platform resources).
 */
export async function reserveGroqDemoRequest(args: {
  userId: string;
  userDailyLimit: number;
  globalDailyLimit: number;
}): Promise<GroqReservationResult> {
  const service = createSupabaseServiceClient();
  const { data, error } = await service.rpc('reserve_platform_llm_request', {
    p_user_id: args.userId,
    p_provider: GROQ_USAGE_PROVIDER,
    p_user_daily_limit: args.userDailyLimit,
    p_global_daily_limit: args.globalDailyLimit,
  });

  // On any RPC failure, fail CLOSED (deny) so an outage can never uncap usage.
  if (error || !data || data.length === 0) {
    return {
      allowed: false,
      reason: 'GLOBAL_DAILY_LIMIT',
      remaining: 0,
      resetAt: nextUtcMidnightIso(),
    };
  }

  const row = data[0]!;
  const resetAt = row.reset_at ? new Date(row.reset_at).toISOString() : nextUtcMidnightIso();

  if (row.allowed) {
    return { allowed: true, remaining: Math.max(row.remaining ?? 0, 0), resetAt };
  }
  return {
    allowed: false,
    reason: row.reason === 'USER_DAILY_LIMIT' ? 'USER_DAILY_LIMIT' : 'GLOBAL_DAILY_LIMIT',
    remaining: 0,
    resetAt,
  };
}

/**
 * Record the outcome of a reserved request (token counts + success/failure).
 * Never throws into the request path — a bookkeeping failure must not break the
 * user's response. request_count is NOT decremented on failure (the slot was
 * consumed); we only add tokens and, on failure, bump failed_requests.
 */
export async function recordGroqDemoResult(args: {
  userId: string;
  inputTokens?: number;
  outputTokens?: number;
  failed: boolean;
}): Promise<void> {
  try {
    const service = createSupabaseServiceClient();
    await service.rpc('record_platform_llm_result', {
      p_user_id: args.userId,
      p_provider: GROQ_USAGE_PROVIDER,
      p_input_tokens: Math.max(args.inputTokens ?? 0, 0),
      p_output_tokens: Math.max(args.outputTokens ?? 0, 0),
      p_failed: args.failed,
    });
  } catch {
    // Swallow — usage bookkeeping is best-effort and never user-facing.
  }
}

/** Read a user's current Groq demo usage for status (no reservation). */
export async function getGroqDemoUsage(
  userId: string,
): Promise<{ requestCount: number; resetAt: string }> {
  try {
    const service = createSupabaseServiceClient();
    const { data, error } = await service.rpc('get_platform_llm_usage', {
      p_user_id: userId,
      p_provider: GROQ_USAGE_PROVIDER,
    });
    if (error || !data || data.length === 0) {
      return { requestCount: 0, resetAt: nextUtcMidnightIso() };
    }
    const row = data[0]!;
    return {
      requestCount: Math.max(row.request_count ?? 0, 0),
      resetAt: row.reset_at ? new Date(row.reset_at).toISOString() : nextUtcMidnightIso(),
    };
  } catch {
    return { requestCount: 0, resetAt: nextUtcMidnightIso() };
  }
}
