import type { BrowserSupabaseClient } from '@/lib/supabase/browser';

type Client = BrowserSupabaseClient;

/**
 * Per-user isolation model (no org-management UI yet): every user gets exactly
 * one personal organization ("My Workspace"). All their assistants live under
 * it, and Row-Level Security scopes every query to orgs the user is a member
 * of — so one user never sees another's history.
 */

/** Return the user's org id, or null if they have no membership yet. */
export async function getActiveOrgId(supabase: Client): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('memberships')
    .select('org_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1);

  if (error || !data || data.length === 0) return null;
  return data[0]!.org_id;
}

/**
 * Ensure the signed-in user has a personal org, creating one atomically via
 * the `bootstrap_organization` SECURITY DEFINER function if needed. Returns the
 * org id. Safe to call on every login (idempotent).
 */
export async function ensurePersonalOrg(supabase: Client): Promise<string> {
  const existing = await getActiveOrgId(supabase);
  if (existing) return existing;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const slug = `ws-${user.id.slice(0, 8)}-${user.id.slice(-4)}`;
  const { data, error } = await supabase.rpc('bootstrap_organization', {
    p_name: 'My Workspace',
    p_slug: slug,
  });
  if (error) {
    // A concurrent login may have created it; fall back to a fresh lookup.
    const retry = await getActiveOrgId(supabase);
    if (retry) return retry;
    throw error;
  }
  return data as string;
}
