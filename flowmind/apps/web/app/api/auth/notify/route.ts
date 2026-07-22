import { NextResponse } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * POST /api/auth/notify
 * Sends a "someone signed in / signed up" message to a chat webhook
 * (Slack or Discord) configured via LOGIN_NOTIFY_WEBHOOK_URL.
 *
 * The email is read from the server-verified session (not the request body),
 * so this can't be spoofed to send arbitrary content, and it no-ops silently
 * when no webhook is configured.
 */
export async function POST(req: Request) {
  const webhook = process.env.LOGIN_NOTIFY_WEBHOOK_URL?.trim();
  if (!webhook) {
    return NextResponse.json({ ok: true, skipped: 'no webhook configured' });
  }

  let event = 'sign-in';
  try {
    const body = await req.json();
    if (body?.event === 'signup') event = 'sign-up';
  } catch {
    /* body optional */
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const who = user.email ?? user.id;
  const when = new Date().toISOString();
  const text = `🔐 FlowMind ${event}: ${who} · ${when}`;

  // Slack reads { text }, Discord reads { content }. Pick by URL, default both.
  const isSlack = /hooks\.slack\.com/i.test(webhook);
  const isDiscord = /discord(app)?\.com\/api\/webhooks/i.test(webhook);
  const payload = isSlack
    ? { text }
    : isDiscord
      ? { content: text }
      : { text, content: text };

  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('[auth/notify] webhook post failed', err);
  }

  return NextResponse.json({ ok: true });
}
