'use client';

import { createBrowserClient } from '@supabase/ssr';

import type { Database } from './database.types';

/**
 * Browser Supabase client for auth + per-user data (RLS-scoped). Always uses
 * the anon/publishable key. Never import the service role client here.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'Supabase env vars missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.',
    );
  }
  return createBrowserClient<Database>(url, anonKey);
}

/** The concrete client type, shared so data helpers agree on generics. */
export type BrowserSupabaseClient = ReturnType<typeof createSupabaseBrowserClient>;
