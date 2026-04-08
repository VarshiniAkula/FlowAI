'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Top-level App Router error boundary. Catches uncaught render and effect
 * errors anywhere under app/ and renders a recoverable shell instead of the
 * default Next.js red overlay. The reset() callback re-renders the failing
 * subtree, so users can retry without a full reload in most cases.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the browser console with the digest so we can correlate
    // against Vercel runtime logs.
    console.error('[flowmind error boundary]', error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-background via-background to-rose-950/5 px-6 py-12">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertTriangle className="size-7" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The page hit an unexpected error. You can try again, or head back to the
          dashboard if it keeps failing.
        </p>
        {error.digest && (
          <p className="mt-3 inline-block rounded-md bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">
            ref: {error.digest}
          </p>
        )}
        <div className="mt-6 flex items-center justify-center gap-2">
          <Button variant="gradient" onClick={() => reset()}>
            <RefreshCw className="size-4" /> Try again
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard">
              <Home className="size-4" /> Dashboard
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
