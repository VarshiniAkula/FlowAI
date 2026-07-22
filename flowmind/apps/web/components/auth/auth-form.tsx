'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Brain, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ensurePersonalOrg } from '@/lib/db/orgs';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isSignup = mode === 'signup';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    const supabase = createSupabaseBrowserClient();

    try {
      if (isSignup) {
        const { data, error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        if (!data.session) {
          // Email confirmation is enabled on the project.
          setNotice('Check your email to confirm your account, then sign in.');
          setLoading(false);
          return;
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      }

      // Guarantee a personal workspace exists, then enter the app.
      await ensurePersonalOrg(supabase);

      // Fire-and-forget owner notification (no-ops unless a webhook is set).
      void fetch('/api/auth/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: isSignup ? 'signup' : 'signin' }),
      }).catch(() => {});

      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Brain className="size-5" />
          </span>
          <span className="font-display text-xl font-bold tracking-tight">FlowMind</span>
        </Link>

        <div className="rounded-lg border border-border bg-card p-6 shadow-soft">
          <h1 className="font-display text-xl font-bold tracking-tight">
            {isSignup ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isSignup
              ? 'Your assistants are private to your account.'
              : 'Sign in to your workspace.'}
          </p>

          <form onSubmit={submit} className="mt-5 space-y-3">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1"
                placeholder={isSignup ? 'At least 6 characters' : '••••••••'}
              />
            </div>

            {error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}
            {notice && (
              <p className="rounded-md border border-mint/30 bg-mint/10 px-3 py-2 text-xs text-mint">
                {notice}
              </p>
            )}

            <Button type="submit" variant="gradient" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {isSignup ? 'Creating account…' : 'Signing in…'}
                </>
              ) : isSignup ? (
                'Create account'
              ) : (
                'Sign in'
              )}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {isSignup ? (
              <>
                Already have an account?{' '}
                <Link href="/login" className="font-medium text-primary hover:underline">
                  Sign in
                </Link>
              </>
            ) : (
              <>
                New to FlowMind?{' '}
                <Link href="/signup" className="font-medium text-primary hover:underline">
                  Create an account
                </Link>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
