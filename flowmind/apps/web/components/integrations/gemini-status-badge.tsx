'use client';

import { Sparkles, ShieldCheck, FlaskConical } from 'lucide-react';

import type { GeminiStatus } from '@/lib/gemini/types';
import { useLlmStatus } from '@/hooks/use-llm-status';
import { cn } from '@/lib/utils';

/**
 * Connection-state pill. Gemini BYOK/platform are driven by the passed Gemini
 * `status`; when no Gemini key is connected it reflects the REAL LLM Response
 * node provider from /api/llm-status, so it shows "FlowMind Demo AI" (with the
 * remaining shared Groq allowance) instead of a blanket "Demo mode" whenever
 * the Groq demo is actually answering.
 *
 *   - Gemini connected · ••••ABCD   — user BYOK key
 *   - AI available                   — server/platform Gemini
 *   - FlowMind Demo AI · N left      — shared Groq demo allowance
 *   - Demo mode                      — deterministic simulation only
 */
export function GeminiStatusBadge({
  status,
  className,
}: {
  status: GeminiStatus | null;
  className?: string;
}) {
  // Hook must run unconditionally (rules of hooks); module-cached so every
  // badge instance shares a single /api/llm-status fetch.
  const llm = useLlmStatus();

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

  // No Gemini key connected: reflect the real LLM Response node provider.
  if (llm.status?.mode === 'groq-demo') {
    const remaining = llm.status.demoRequestsRemaining;
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border border-transparent bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary',
          className,
        )}
        title="Real AI via a limited shared Groq allowance. Connect Gemini for full access."
      >
        <FlaskConical className="size-3.5" />
        FlowMind Demo AI{typeof remaining === 'number' ? ` · ${remaining} left` : ''}
      </span>
    );
  }

  if (llm.status?.mode === 'gemini-platform') {
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

  // Deterministic simulation only (no real provider available).
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
