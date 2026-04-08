import { NextResponse } from 'next/server';
import { getSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export interface AnalyticsSummary {
  totalConversations: number;
  activeConversations: number;
  completedConversations: number;
  totalTurns: number;
  avgTurnsPerConversation: number;
  conversationsLast24h: number;
  byDay: Array<{ day: string; count: number }>;
}

/**
 * Aggregated conversation stats for an *owner-side* assistantId. We query
 * across every publish version so renaming or republishing the assistant
 * doesn't reset the dashboard.
 *
 * Returns a zeroed payload (instead of 503) when Supabase isn't configured,
 * so the Analytics page renders the same shape in local-only mode.
 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ assistantId: string }> },
) {
  const { assistantId } = await context.params;
  if (!assistantId || typeof assistantId !== 'string') {
    return NextResponse.json({ error: 'invalid assistantId' }, { status: 400 });
  }

  const empty: AnalyticsSummary = {
    totalConversations: 0,
    activeConversations: 0,
    completedConversations: 0,
    totalTurns: 0,
    avgTurnsPerConversation: 0,
    conversationsLast24h: 0,
    byDay: [],
  };

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ...empty, configured: false });
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('flowmind_conversations')
    .select('id, started_at, status, turn_count')
    .eq('assistant_id', assistantId)
    .order('started_at', { ascending: false })
    .limit(500);

  if (error) {
    console.error('[api/analytics] read error:', error);
    return NextResponse.json({ error: 'failed to load analytics' }, { status: 500 });
  }

  const rows = data ?? [];
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  let totalTurns = 0;
  let active = 0;
  let completed = 0;
  let last24h = 0;
  const dayBuckets = new Map<string, number>();

  for (const row of rows) {
    totalTurns += row.turn_count ?? 0;
    if (row.status === 'active') active += 1;
    else if (row.status === 'completed') completed += 1;

    const startedAt = Date.parse(row.started_at);
    if (!Number.isNaN(startedAt)) {
      if (now - startedAt < dayMs) last24h += 1;
      const day = new Date(startedAt).toISOString().slice(0, 10);
      dayBuckets.set(day, (dayBuckets.get(day) ?? 0) + 1);
    }
  }

  const byDay = Array.from(dayBuckets.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(-14)
    .map(([day, count]) => ({ day, count }));

  const summary: AnalyticsSummary = {
    totalConversations: rows.length,
    activeConversations: active,
    completedConversations: completed,
    totalTurns,
    avgTurnsPerConversation: rows.length === 0 ? 0 : Number((totalTurns / rows.length).toFixed(1)),
    conversationsLast24h: last24h,
    byDay,
  };

  return NextResponse.json(
    { ...summary, configured: true },
    {
      headers: {
        // Short cache so refresh feels live but we don't hammer Supabase.
        'Cache-Control': 'public, max-age=10, s-maxage=10, stale-while-revalidate=60',
      },
    },
  );
}
