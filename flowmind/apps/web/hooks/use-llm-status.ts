'use client';

import { useCallback, useEffect, useState } from 'react';

import type { LlmStatus } from '@/lib/llm/types';

/**
 * Client hook for the LLM Response node provider status (GET /api/llm-status).
 *
 * Sanitized metadata only — never any key material. A small module-level cache
 * keeps the simulator badge, privacy notice, and CTA in sync, and lets a
 * completed run refresh the remaining Groq demo count via `refresh()`.
 */

let cached: LlmStatus | null = null;
let inflight: Promise<LlmStatus> | null = null;
const listeners = new Set<(s: LlmStatus | null) => void>();

function broadcast(next: LlmStatus | null) {
  cached = next;
  for (const l of listeners) l(next);
}

async function fetchStatus(): Promise<LlmStatus> {
  const res = await fetch('/api/llm-status', { cache: 'no-store' });
  const data = (await res.json()) as LlmStatus;
  broadcast(data);
  return data;
}

export interface UseLlmStatus {
  status: LlmStatus | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export function useLlmStatus(): UseLlmStatus {
  const [status, setStatus] = useState<LlmStatus | null>(cached);
  const [isLoading, setIsLoading] = useState(cached === null);

  useEffect(() => {
    const listener = (s: LlmStatus | null) => setStatus(s);
    listeners.add(listener);

    if (cached === null) {
      if (!inflight) inflight = fetchStatus().finally(() => (inflight = null));
      inflight.then(() => setIsLoading(false)).catch(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      await fetchStatus();
    } catch {
      // keep last-known status on a transient failure
    }
  }, []);

  return { status, isLoading, refresh };
}
