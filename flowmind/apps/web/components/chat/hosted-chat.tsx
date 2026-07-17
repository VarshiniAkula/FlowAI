'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Loader2, RotateCcw, Send, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAssistantStore } from '@/stores/assistant-store';
import {
  createInitialState,
  createSimulatorServices,
  runTurn,
  type RunTurnResult,
} from '@/lib/runtime';
import type { Assistant, ConversationState, Graph } from '@flowmind/shared';
import { cn } from '@/lib/utils';

interface Props {
  assistantId: string;
  /** When true, render in compact "embedded inside an iframe" mode (no padding, no max-width). */
  embed?: boolean;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface PublishedPayload {
  id: string;
  assistantId: string;
  name: string;
  description: string | null;
  graph: Graph;
  version: number;
  publishedAt: string;
}

/**
 * Hosted, public-facing chat experience for a published assistant.
 *
 * Resolves the assistant in two ways depending on the id shape:
 * - `pub_*` ids → server-fetched from /api/published/[id] (Supabase). This is
 *   what visitors hit; the snapshot is immutable per publish, so the route can
 *   cache aggressively at the edge.
 * - Anything else → owner preview from localStorage via the assistant store.
 *   This keeps the editor → preview loop instant and offline-friendly.
 *
 * The runtime itself is the same in both cases - once we have a Graph and a
 * meta record, we hand it to the in-browser engine.
 */
export function HostedChat({ assistantId, embed = false }: Props) {
  const isCloudId = assistantId.startsWith('pub_');
  const [hydrated, setHydrated] = useState(false);
  const [assistant, setAssistant] = useState<Assistant | undefined>(undefined);
  const [cloudLoading, setCloudLoading] = useState(isCloudId);
  const [cloudError, setCloudError] = useState<string | null>(null);
  // The owner-side assistantId from the published snapshot. We need it on the
  // telemetry call so the Analytics page can aggregate across publish versions.
  const ownerIdRef = useRef<string | null>(null);

  // Local-mode subscription (owner preview only). For cloud ids we just fetch
  // once on mount and treat the response as the source of truth.
  useEffect(() => {
    if (isCloudId) return;
    const read = () => useAssistantStore.getState().getAssistant(assistantId);
    setAssistant(read());
    setHydrated(true);
    const unsub = useAssistantStore.subscribe(() => setAssistant(read()));
    return unsub;
  }, [assistantId, isCloudId]);

  // Cloud fetch path: hit the published API and synthesize a runtime Assistant.
  useEffect(() => {
    if (!isCloudId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/published/${assistantId}`, {
          method: 'GET',
        });
        if (cancelled) return;
        if (res.status === 404) {
          setCloudError('not-found');
          setHydrated(true);
          setCloudLoading(false);
          return;
        }
        if (!res.ok) {
          throw new Error(`Failed to load assistant (${res.status})`);
        }
        const data = (await res.json()) as PublishedPayload;
        if (cancelled) return;
        ownerIdRef.current = data.assistantId;
        const publishedAt = Date.parse(data.publishedAt) || Date.now();
        const synthetic: Assistant = {
          id: data.id,
          name: data.name,
          description: data.description ?? undefined,
          status: 'active',
          createdAt: publishedAt,
          updatedAt: publishedAt,
          graph: data.graph,
          cloudPublishId: data.id,
          cloudVersion: data.version,
          cloudPublishedAt: publishedAt,
        };
        setAssistant(synthetic);
        setHydrated(true);
        setCloudLoading(false);
      } catch (err) {
        if (cancelled) return;
        setCloudError(err instanceof Error ? err.message : 'Failed to load');
        setHydrated(true);
        setCloudLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assistantId, isCloudId]);

  const graph: Graph = useMemo(
    () => ({
      nodes: (assistant?.graph.nodes ?? []) as any,
      edges: (assistant?.graph.edges ?? []) as any,
      variables: assistant?.graph.variables ?? [],
    }),
    [assistant?.graph.nodes, assistant?.graph.edges, assistant?.graph.variables],
  );

  const baseServices = useMemo(() => createSimulatorServices(assistantId), [assistantId]);

  const [state, setState] = useState<ConversationState>(() => createInitialState());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Wrap the simulator services so any llm_response node in the running graph
  // streams its tokens into `streamingText`. The engine itself still resolves
  // the full string when complete() returns; we just paint the deltas in real
  // time as a transient bubble that gets replaced by the canonical assistant
  // message once the turn settles via apply().
  const services = useMemo(
    () => ({
      ...baseServices,
      llm: {
        complete: (opts: Parameters<typeof baseServices.llm.complete>[0]) => {
          // Reset the streaming bubble at the start of each LLM call so
          // multi-llm flows show one bubble per call rather than concatenating.
          setStreamingText('');
          return baseServices.llm.complete({
            ...opts,
            onChunk: (delta) => {
              setStreamingText((prev) => prev + delta);
            },
          });
        },
      },
    }),
    [baseServices],
  );
  // Telemetry: opaque conversation id assigned by /api/conversations on first
  // start. Only set for cloud-published assistants (pub_*); local previews
  // don't write any rows to Supabase.
  const conversationIdRef = useRef<string | null>(null);
  const telemetryDoneRef = useRef(false);

  const beginTelemetry = async () => {
    if (!isCloudId || conversationIdRef.current) return;
    const ownerId = ownerIdRef.current;
    if (!ownerId) return;
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publishId: assistantId,
          assistantId: ownerId,
        }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { conversationId?: string };
      if (data.conversationId) conversationIdRef.current = data.conversationId;
    } catch {
      // Telemetry is best-effort.
    }
  };

  const reportTurn = async (isDone: boolean) => {
    const id = conversationIdRef.current;
    if (!id) return;
    if (telemetryDoneRef.current) return;
    if (isDone) telemetryDoneRef.current = true;
    try {
      await fetch(`/api/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnDelta: 1, done: isDone }),
      });
    } catch {
      // Telemetry is best-effort.
    }
  };

  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages, running, streamingText]);

  const start = async () => {
    if (graph.nodes.length === 0) return;
    startedRef.current = true;
    setRunning(true);
    setError(null);
    // Fire-and-forget telemetry: don't block the chat boot on the network round-trip.
    void beginTelemetry();
    try {
      const result = await runTurn({ graph, state: createInitialState(), services });
      apply(result);
      if (result.done) void reportTurn(true);
    } catch (err: any) {
      setError(err.message || 'Failed to start conversation');
    } finally {
      setRunning(false);
    }
  };

  const send = async () => {
    if (!input.trim() || running || done) return;
    const text = input.trim();
    setInput('');
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: 'user', content: text },
    ]);
    setRunning(true);
    setError(null);
    try {
      const result = await runTurn({ graph, state, userMessage: text, services });
      apply(result);
      void reportTurn(result.done);
    } catch (err: any) {
      setError(err.message || 'Turn failed');
    } finally {
      setRunning(false);
    }
  };

  const apply = (result: RunTurnResult) => {
    setState(result.state);
    setMessages((prev) => [
      ...prev,
      ...result.messages.map((m) => ({
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content: m.content,
      })),
    ]);
    // Tear down the live streaming bubble - the canonical message is now in
    // the list. Doing this in apply() (rather than just on the next start)
    // ensures the transient bubble doesn't stick around between turns.
    setStreamingText('');
    setDone(result.done);
  };

  const reset = () => {
    setState(createInitialState());
    setMessages([]);
    setStreamingText('');
    setDone(false);
    setError(null);
    startedRef.current = false;
    // Drop the previous conversation id so the next start() opens a fresh row.
    conversationIdRef.current = null;
    telemetryDoneRef.current = false;
  };

  // Auto-start once we have a non-empty graph.
  useEffect(() => {
    if (hydrated && !startedRef.current && graph.nodes.length > 0) {
      start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, graph.nodes.length]);

  if (!hydrated || cloudLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }

  if (!assistant) {
    const notFoundCopy =
      cloudError === 'not-found'
        ? "We couldn't find a published assistant at this link. It may have been deleted or the link is wrong."
        : cloudError
          ? cloudError
          : "This assistant either hasn't been published yet or the link is wrong.";
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Bot className="size-6 text-muted-foreground" />
          </div>
          <h1 className="text-lg font-semibold">Assistant not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">{notFoundCopy}</p>
        </div>
      </div>
    );
  }

  // Cloud-fetched assistants are always live by definition. The draft gate
  // only applies to local owner-preview mode.
  if (!isCloudId && assistant.status !== 'active') {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            <Sparkles className="size-6" />
          </div>
          <h1 className="text-lg font-semibold">{assistant.name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This assistant is still a draft. Ask the builder to publish it from the
            Deploy tab.
          </p>
        </div>
      </div>
    );
  }

  if (graph.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md text-center text-sm text-muted-foreground">
          This assistant doesn&apos;t have any nodes yet.
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex h-full flex-col bg-gradient-to-b from-background via-background to-indigo-950/5',
        !embed && 'mx-auto max-w-2xl',
      )}
    >
      {/* Header */}
      <header
        className={cn(
          'flex shrink-0 items-center justify-between border-b bg-background/70 backdrop-blur',
          embed ? 'px-4 py-2.5' : 'px-5 py-3',
        )}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-indigo-600 text-white shadow-sm">
            <Bot className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{assistant.name}</div>
            {assistant.description && (
              <div className="truncate text-[11px] text-muted-foreground">
                {assistant.description}
              </div>
            )}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={reset} aria-label="Reset conversation">
          <RotateCcw className="size-3.5" />
          {!embed && <span className="ml-1">Reset</span>}
        </Button>
      </header>

      {/* Messages */}
      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        <div className="space-y-3">
          {messages.length === 0 && !running && (
            <div className="flex items-center justify-center py-10 text-xs text-muted-foreground">
              Starting conversation...
            </div>
          )}
          {messages.map((m) => (
            <Bubble key={m.id} role={m.role} content={m.content} />
          ))}
          {streamingText && (
            <Bubble role="assistant" content={streamingText} streaming />
          )}
          {running && !streamingText && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Thinking...
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-4 mb-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
          {error}
        </div>
      )}

      {/* Composer */}
      <div className="shrink-0 border-t bg-background/80 px-4 py-3 backdrop-blur sm:px-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex items-center gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={done ? 'Conversation ended - press reset' : 'Type a message...'}
            disabled={done || running || !startedRef.current}
            className="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <Button
            type="submit"
            size="sm"
            variant="gradient"
            disabled={done || running || !input.trim()}
          >
            <Send className="size-3.5" />
          </Button>
        </form>
        {!embed && (
          <div className="mt-2 text-center text-[10px] text-muted-foreground">
            Powered by{' '}
            <a
              href="/"
              className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              FlowMind
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function Bubble({
  role,
  content,
  streaming = false,
}: {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}) {
  const isUser = role === 'user';
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[82%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm leading-relaxed shadow-sm',
          isUser
            ? 'bg-gradient-to-br from-indigo-600 to-indigo-600 text-white'
            : 'border bg-card text-foreground',
          streaming && 'border-indigo-300/60 dark:border-indigo-700/60',
        )}
      >
        {content}
        {streaming && (
          <span
            className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-[2px] animate-pulse bg-indigo-500"
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  );
}
