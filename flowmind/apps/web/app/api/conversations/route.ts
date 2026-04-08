import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { getSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';

export const runtime = 'nodejs';

interface StartBody {
  publishId?: string;
  assistantId?: string;
}

/**
 * Starts a hosted-chat conversation. Visitors call this on first paint of a
 * `pub_*` chat page so the analytics card can show real session counts.
 *
 * The schema's `assistant_id` is the *owner-side* assistantId baked into the
 * publish snapshot, not the public publish id - we keep both columns so the
 * Analytics page can query "all conversations for this assistant across every
 * publish version" without joining.
 */
export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    // Telemetry is best-effort: returning 200 with a synthetic id keeps the
    // hosted chat working when Supabase isn't configured (local dev, etc).
    return NextResponse.json({ conversationId: `local_${nanoid(10)}`, ephemeral: true });
  }

  let body: StartBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const publishId = body.publishId?.trim();
  const assistantId = body.assistantId?.trim();
  if (!publishId || !assistantId) {
    return NextResponse.json(
      { error: 'publishId and assistantId are required' },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServerClient();
  const conversationId = `conv_${nanoid(14)}`;
  const { error } = await supabase.from('flowmind_conversations').insert({
    id: conversationId,
    publish_id: publishId,
    assistant_id: assistantId,
    started_at: new Date().toISOString(),
    turn_count: 0,
    status: 'active',
  });

  if (error) {
    console.error('[api/conversations] insert error:', error);
    // Degrade gracefully - telemetry never blocks the chat experience.
    return NextResponse.json({ conversationId: `local_${nanoid(10)}`, ephemeral: true });
  }

  return NextResponse.json({ conversationId });
}
