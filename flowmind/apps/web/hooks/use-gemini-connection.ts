'use client';

import { useCallback, useEffect, useState } from 'react';

import type { GeminiErrorCode } from '@/lib/gemini/errors';
import type { GeminiStatus } from '@/lib/gemini/types';

/**
 * Client hook for the Gemini connection.
 *
 * IMPORTANT: this hook never holds the raw API key. The key exists only in the
 * dialog's local input state for the moment of submission; everything here is
 * sanitized status metadata fetched from the server.
 *
 * A tiny module-level cache keeps every badge (editor header, story builder,
 * simulator, dashboard) in sync after a connect/disconnect without a global
 * store or prop drilling.
 */

const BASE = '/api/integrations/gemini';

interface ConnectError {
  code?: GeminiErrorCode;
  message: string;
}

let cachedStatus: GeminiStatus | null = null;
let inflight: Promise<GeminiStatus> | null = null;
const listeners = new Set<(s: GeminiStatus | null) => void>();

function broadcast(next: GeminiStatus | null) {
  cachedStatus = next;
  for (const l of listeners) l(next);
}

async function fetchStatus(): Promise<GeminiStatus> {
  const res = await fetch(`${BASE}/status`, { cache: 'no-store' });
  const data = (await res.json()) as GeminiStatus;
  broadcast(data);
  return data;
}

export interface UseGeminiConnection {
  status: GeminiStatus | null;
  isLoading: boolean;
  isConnecting: boolean;
  error: ConnectError | null;
  connect: (apiKey: string) => Promise<boolean>;
  disconnect: () => Promise<void>;
  refresh: () => Promise<void>;
  clearError: () => void;
}

export function useGeminiConnection(): UseGeminiConnection {
  const [status, setStatus] = useState<GeminiStatus | null>(cachedStatus);
  const [isLoading, setIsLoading] = useState(cachedStatus === null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<ConnectError | null>(null);

  useEffect(() => {
    const listener = (s: GeminiStatus | null) => setStatus(s);
    listeners.add(listener);

    if (cachedStatus === null) {
      if (!inflight) inflight = fetchStatus().finally(() => (inflight = null));
      inflight
        .then(() => setIsLoading(false))
        .catch(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }

    return () => {
      listeners.delete(listener);
    };
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      await fetchStatus();
    } finally {
      setIsLoading(false);
    }
  }, []);

  const connect = useCallback(async (apiKey: string): Promise<boolean> => {
    setIsConnecting(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError({
          code: data?.error?.code as GeminiErrorCode | undefined,
          message: data?.error?.message ?? 'Could not connect. Please try again.',
        });
        return false;
      }
      broadcast(data as GeminiStatus);
      return true;
    } catch {
      setError({ message: 'Network error. Please try again.' });
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/disconnect`, { method: 'DELETE' });
      const data = (await res.json()) as GeminiStatus;
      broadcast(data);
    } catch {
      // Even if the request failed, re-fetch to reflect real server state.
      await fetchStatus().catch(() => undefined);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { status, isLoading, isConnecting, error, connect, disconnect, refresh, clearError };
}
