import { NextResponse } from 'next/server';
import { getSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';

export const runtime = 'nodejs';

interface PatchBody {
  turnDelta?: number;
  done?: boolean;
}

/**
 * Updates a conversation row mid-flight: bump turn_count after each user
 * message, and stamp ended_at + status when the runtime reports `done`.
 *
 * Local/ephemeral ids (synthesized by the start route when Supabase is
 * unavailable) are accepted as no-ops so the hosted chat never has to branch
 * on whether telemetry is wired up.
 */
export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  if (id.startsWith('local_')) {
    return NextResponse.json({ ok: true, ephemeral: true });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, ephemeral: true });
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  // Read-modify-write because Supabase JS doesn't expose `RETURNING` on plain
  // inc, and the row count is small enough that the round-trip is cheap.
  const { data: existing, error: readErr } = await supabase
    .from('flowmind_conversations')
    .select('turn_count, status')
    .eq('id', id)
    .maybeSingle();

  if (readErr) {
    console.error('[api/conversations PATCH] read error:', readErr);
    return NextResponse.json({ error: 'failed to read conversation' }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: 'conversation not found' }, { status: 404 });
  }

  const nextTurnCount = existing.turn_count + Math.max(0, body.turnDelta ?? 0);
  const update: Record<string, unknown> = { turn_count: nextTurnCount };
  if (body.done) {
    update.status = 'completed';
    update.ended_at = new Date().toISOString();
  }

  const { error: updErr } = await supabase
    .from('flowmind_conversations')
    .update(update)
    .eq('id', id);

  if (updErr) {
    console.error('[api/conversations PATCH] update error:', updErr);
    return NextResponse.json({ error: 'failed to update conversation' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, turnCount: nextTurnCount });
}
