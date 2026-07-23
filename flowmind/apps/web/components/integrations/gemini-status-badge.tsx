'use client';

import { Sparkles, ShieldCheck, FlaskConical } from 'lucide-react';

import type { GeminiStatus } from '@/lib/gemini/types';
import { cn } from '@/lib/utils';

/**
 * Presentational connection state pill. Shows one of:
 *   - Demo mode (fallback)          — AI is simulated
 *   - Gemini connected · ••••ABCD   — user BYOK key
 *   - Gemini available (platform)   — server key, no characters shown
 */
export function GeminiStatusBadge({
  status,
  className,
}: {
  status: GeminiStatus | null;
  className?: string;
}) {
  if (!status) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground',
          className,
        )}
      >
        <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/50" />
        Checking…
      </span>
    );
  }

  if (status.connected && status.mode === 'byok') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border border-transparent bg-mint/10 px-2.5 py-1 text-xs font-semibold text-mint',
          className,
        )}
        title={`Expires ${new Date(status.expiresAt).toLocaleString()}`}
      >
        <Sparkles className="size-3.5" />
        Gemini connected · ••••{status.keyLastFour}
      </span>
    );
  }

  if (status.connected && status.mode === 'platform') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border border-transparent bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary',
          className,
        )}
      >
        <ShieldCheck className="size-3.5" />
        AI available
      </span>
    );
  }

  // fallback
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-transparent bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-600',
        className,
      )}
    >
      <FlaskConical className="size-3.5" />
      Demo mode
    </span>
  );
}
