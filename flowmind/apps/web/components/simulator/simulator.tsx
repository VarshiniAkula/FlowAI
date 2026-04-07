'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Beaker,
  Loader2,
  RotateCcw,
  Send,
  ChevronRight,
  Terminal,
  Database,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAssistantStore } from '@/stores/assistant-store';
import { useGraphStore } from '@/stores/graph-store';
import {
  createInitialState,
  createSimulatorServices,
  runTurn,
  type RunTurnResult,
} from '@/lib/runtime';
import type { ConversationState, Graph, TraceEvent } from '@flowmind/shared';
import { cn } from '@/lib/utils';

interface Props {
  assistantId: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export function Simulator({ assistantId }: Props) {
  const assistant = useAssistantStore((s) => s.getAssistant(assistantId));
  const { nodes, edges } = useGraphStore();
  const setActiveNode = useGraphStore((s) => s.setActiveNode);

  // Snapshot the canvas graph into a stable structure for runTurn.
  const graph: Graph = useMemo(
    () => ({
      nodes: nodes as any,
      edges: edges as any,
      variables: assistant?.graph.variables ?? [],
    }),
    [nodes, edges, assistant?.graph.variables],
  );

  const services = useMemo(() => createSimulatorServices(), []);

  const [state, setState] = useState<ConversationState>(() => createInitialState());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [trace, setTrace] = useState<TraceEvent[]>([]);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll chat to bottom when new messages arrive.
  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages, running]);

  // Highlight the currently-active node on the canvas.
  useEffect(() => {
    setActiveNode(state.currentNodeId ?? null);
    return () => setActiveNode(null);
  }, [state.currentNodeId, setActiveNode]);

  const startConversation = async () => {
    if (graph.nodes.length === 0) {
      setError('Add at least one node on the canvas before testing.');
      return;
    }
    startedRef.current = true;
    setRunning(true);
    setError(null);
    try {
      const result = await runTurn({ graph, state: createInitialState(), services });
      applyTurn(result);
    } catch (err: any) {
      setError(err.message || 'Failed to start conversation');
    } finally {
      setRunning(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || running) return;
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
      applyTurn(result);
    } catch (err: any) {
      setError(err.message || 'Turn failed');
    } finally {
      setRunning(false);
    }
  };

  const applyTurn = (result: RunTurnResult) => {
    setState(result.state);
    setTrace((prev) => [...prev, ...result.trace]);
    setMessages((prev) => [
      ...prev,
      ...result.messages.map((m) => ({
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content: m.content,
      })),
    ]);
    setDone(result.done);
  };

  const reset = () => {
    setState(createInitialState());
    setMessages([]);
    setTrace([]);
    setError(null);
    setDone(false);
    startedRef.current = false;
  };

  // Auto-start when the user lands on the page (and the graph is non-empty).
  useEffect(() => {
    if (!startedRef.current && graph.nodes.length > 0) {
      startConversation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.nodes.length]);

  return (
    <div className="flex h-full overflow-hidden bg-gradient-to-b from-background via-background to-violet-950/5">
      {/* Chat column */}
      <div className="flex flex-1 min-w-0 flex-col border-r">
        <div className="flex shrink-0 items-center justify-between border-b bg-background/60 px-5 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-pink-600 text-white">
              <Beaker className="size-4" />
            </div>
            <div>
              <div className="text-sm font-semibold">Simulator</div>
              <div className="text-[11px] text-muted-foreground">
                Chat with your assistant locally — every step is traced.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {done && <Badge variant="success">Conversation ended</Badge>}
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw className="size-3.5" /> Reset
            </Button>
          </div>
        </div>

        <div ref={scrollerRef} className="flex-1 overflow-y-auto px-5 py-4">
          {messages.length === 0 && !running && (
            <div className="flex h-full items-center justify-center">
              <div className="text-center text-sm text-muted-foreground">
                <Beaker className="mx-auto mb-2 size-6 text-muted-foreground/50" />
                {graph.nodes.length === 0
                  ? 'Add nodes on the canvas first.'
                  : 'Starting conversation...'}
              </div>
            </div>
          )}
          <div className="space-y-3">
            {messages.map((m) => (
              <ChatBubble key={m.id} role={m.role} content={m.content} />
            ))}
            {running && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> Thinking...
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mx-5 mb-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
            {error}
          </div>
        )}

        <div className="shrink-0 border-t bg-background/80 px-5 py-3 backdrop-blur">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={done ? 'Conversation ended — press Reset' : 'Type a message...'}
              disabled={done || running || !startedRef.current}
              className="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
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
        </div>
      </div>

      {/* Trace column */}
      <div className="flex w-[420px] shrink-0 flex-col bg-background/40">
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-3">
          <div className="flex items-center gap-2">
            <Terminal className="size-4 text-violet-500" />
            <span className="text-sm font-semibold">Trace</span>
          </div>
          <Badge variant="info" className="text-[10px]">
            {trace.length} {trace.length === 1 ? 'event' : 'events'}
          </Badge>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {trace.length === 0 ? (
            <div className="px-2 py-6 text-center text-xs text-muted-foreground">
              Trace events appear here as the flow runs.
            </div>
          ) : (
            <div className="space-y-1.5">
              {trace.map((ev, i) => (
                <TraceItem key={ev.id} event={ev} index={i + 1} />
              ))}
            </div>
          )}
        </div>

        {Object.keys(state.variables).length > 0 && (
          <div className="shrink-0 border-t bg-muted/30 px-4 py-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Database className="size-3" /> Variables
            </div>
            <pre className="max-h-32 overflow-y-auto rounded-md bg-background px-2 py-1.5 font-mono text-[11px] leading-relaxed">
              {JSON.stringify(state.variables, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function ChatBubble({ role, content }: { role: 'user' | 'assistant'; content: string }) {
  const isUser = role === 'user';
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm leading-relaxed',
          isUser
            ? 'bg-gradient-to-br from-violet-600 to-pink-600 text-white'
            : 'border bg-card text-foreground',
        )}
      >
        {content}
      </div>
    </div>
  );
}

function TraceItem({ event, index }: { event: TraceEvent; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border bg-card text-xs">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40"
      >
        <ChevronRight
          className={cn(
            'size-3 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-90',
          )}
        />
        <span className="text-[10px] text-muted-foreground">#{index}</span>
        <Badge variant="outline" className="text-[10px]">
          {event.nodeType}
        </Badge>
        <span className="truncate font-mono text-[11px]">{event.nodeId}</span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {event.latencyMs}ms
        </span>
      </button>
      {open && (
        <div className="border-t bg-muted/20 px-3 py-2 font-mono text-[10px] leading-relaxed">
          <div className="text-muted-foreground">input:</div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all">
            {JSON.stringify(event.input, null, 2)}
          </pre>
          <div className="mt-1.5 text-muted-foreground">output:</div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all">
            {JSON.stringify(event.output, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
