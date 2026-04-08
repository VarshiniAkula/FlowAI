import { NextResponse } from 'next/server';
import { getSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';

export const runtime = 'nodejs';
// Always run fresh - health responses must reflect *current* dependency
// state, never an edge cache.
export const dynamic = 'force-dynamic';

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
  latencyMs?: number;
}

/**
 * Lightweight readiness probe used by deployment gates and uptime monitors.
 * Always returns JSON; HTTP status is 200 when everything's green and 503
 * when at least one critical dependency is failing. Supabase is checked by
 * issuing a HEAD-style count query against flowmind_published_assistants -
 * fast, indexed, and exercises both auth and the network path.
 */
export async function GET() {
  const checks: Check[] = [];

  // Always-on checks first.
  checks.push({
    name: 'env.supabase',
    ok: isSupabaseConfigured(),
    detail: isSupabaseConfigured() ? 'configured' : 'NEXT_PUBLIC_SUPABASE_* missing',
  });

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServerClient();
    const start = Date.now();
    try {
      const { error, count } = await supabase
        .from('flowmind_published_assistants')
        .select('id', { count: 'exact', head: true });
      const latencyMs = Date.now() - start;
      if (error) {
        checks.push({
          name: 'supabase.published_assistants',
          ok: false,
          detail: error.message,
          latencyMs,
        });
      } else {
        checks.push({
          name: 'supabase.published_assistants',
          ok: true,
          detail: `${count ?? 0} rows`,
          latencyMs,
        });
      }
    } catch (err) {
      checks.push({
        name: 'supabase.published_assistants',
        ok: false,
        detail: err instanceof Error ? err.message : 'unknown error',
        latencyMs: Date.now() - start,
      });
    }
  }

  const allOk = checks.every((c) => c.ok);
  return NextResponse.json(
    {
      status: allOk ? 'ok' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
    },
    { status: allOk ? 200 : 503 },
  );
}
