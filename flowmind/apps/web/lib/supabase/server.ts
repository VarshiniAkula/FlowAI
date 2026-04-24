import 'server-only';

import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

import type { Database } from './database.types';

/**
 * Cookie-bound Supabase client for the current request's authenticated user.
 * Uses @supabase/ssr — the successor to the deprecated auth-helpers.
 *
 * RSCs can read cookies but cannot write them; we swallow the resulting error
 * there. Route handlers and server actions can write freely.
 */
export async function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'Supabase env vars missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options as CookieOptions);
          }
        } catch {
          // RSC context: cookies are read-only. Middleware handles refresh.
        }
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Legacy shims used by Phase 0 routes (public chat / publish / conversations
// / analytics) that are scheduled for rewrite in later phases. These return
// an anon-keyed client with no cookie binding — what the existing legacy
// code expects. TODO(phase-6): delete once all call sites are migrated.
// ---------------------------------------------------------------------------

export function getSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase env vars missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
