'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Wand2, Loader2, AlertCircle, BookOpenText, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { GeminiConnectionButton } from '@/components/integrations/gemini-connection-button';
import { useGeminiConnection } from '@/hooks/use-gemini-connection';
import { useAssistantStore } from '@/stores/assistant-store';
import { useGraphStore } from '@/stores/graph-store';
import type { GraphEdge, GraphNode } from '@flowmind/shared';

const EXAMPLES = [
  {
    title: 'Customer support bot',
    body: 'A friendly customer support assistant that helps users troubleshoot issues with our product. It should ask the topic (billing, technical, account), collect details, search our knowledge base, and answer using the retrieved context.',
  },
  {
    title: 'Sales qualifier',
    body: 'A sales bot that captures lead info: name, company, team size, and use case. After qualifying the lead, it should generate a personalized pitch and propose a 15-minute demo call.',
  },
  {
    title: 'Documentation assistant',
    body: 'A knowledge assistant that answers questions about our product documentation. It should search the docs and ground every answer in retrieved context, citing sources.',
  },
  {
    title: 'Booking assistant',
    body: 'An assistant that helps users book appointments. It should ask the type of service, preferred date, and email, then confirm the booking.',
  },
];

interface Props {
  assistantId: string;
}

export function StoryBuilder({ assistantId }: Props) {
  const router = useRouter();
  const assistant = useAssistantStore((s) => s.getAssistant(assistantId));
  const updateAssistant = useAssistantStore((s) => s.updateAssistant);
  const saveGraph = useAssistantStore((s) => s.saveGraph);
  const setGraph = useGraphStore((s) => s.setGraph);
  const gemini = useGeminiConnection();

  const [story, setStory] = useState(assistant?.storyText ?? '');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSource, setLastSource] = useState<'gemini' | 'heuristic' | null>(null);

  const handleGenerate = async () => {
    if (!story.trim()) {
      setError('Please describe what your assistant should do.');
      return;
    }
    setGenerating(true);
    setError(null);

    try {
      const res = await fetch('/api/generate-graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const message =
          typeof body.error === 'string'
            ? body.error
            : body.error?.message || `HTTP ${res.status}`;
        throw new Error(message);
      }

      const { graph, source } = await res.json();
      setLastSource(source);

      // Map the generated graph into the canvas store
      const nodes: GraphNode[] = graph.nodes.map((n: any) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        label: n.label,
        data: n.data,
      }));
      const edges: GraphEdge[] = graph.edges.map((e: any) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        label: e.label,
      }));

      setGraph(nodes as any, edges as any);

      updateAssistant(assistantId, {
        name: graph.name || assistant?.name || 'New Assistant',
        description: graph.description || assistant?.description,
        storyText: story,
      });

      saveGraph(assistantId, {
        nodes: nodes as any,
        edges: edges as any,
        variables: assistant?.graph.variables ?? [],
      });

      // Navigate to canvas to see the result
      router.push(`/editor/${assistantId}/canvas`);
    } catch (err: any) {
      setError(err.message || 'Failed to generate flow');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-background via-background to-indigo-950/5">
      <div className="mx-auto max-w-3xl px-6 py-10">
        {/* Header */}
        <div className="mb-8 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-600 text-white shadow-lg">
            <BookOpenText className="size-6" />
          </div>
          <div className="flex-1">
            <h1 className="font-display text-2xl font-bold tracking-tight">Story Builder</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Describe your assistant in plain English. We&apos;ll turn it into a working flow you
              can edit on the canvas.
            </p>
          </div>
          <GeminiConnectionButton />
        </div>

        {gemini.status?.mode === 'fallback' && (
          <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
            <span className="font-semibold">Demo mode.</span> Flow generation uses a deterministic
            simulation. Connect Gemini for real AI responses.
          </div>
        )}

        {/* Story input */}
        <Card className="overflow-hidden border-indigo-500/10">
          <div className="border-b bg-gradient-to-r from-indigo-500/5 to-indigo-500/5 px-5 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-indigo-500" />
                <span className="text-sm font-medium">Tell us about your assistant</span>
              </div>
              <span className="text-[10px] text-muted-foreground">
                {story.length} / 4000
              </span>
            </div>
          </div>
          <Textarea
            value={story}
            onChange={(e) => setStory(e.target.value.slice(0, 4000))}
            placeholder="My assistant should help users..."
            rows={10}
            className="border-0 px-5 py-4 text-sm leading-relaxed focus-visible:ring-0"
          />
          <div className="flex items-center justify-between border-t px-5 py-3">
            <div className="text-[11px] text-muted-foreground">
              Tip: include the goal, what to ask the user, and what to do with the answers.
            </div>
            <Button
              variant="gradient"
              size="lg"
              onClick={handleGenerate}
              disabled={generating || !story.trim()}
              className="gap-2"
            >
              {generating ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Generating...
                </>
              ) : (
                <>
                  <Wand2 className="size-4" /> Generate flow
                </>
              )}
            </Button>
          </div>
        </Card>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {lastSource && !generating && (
          <div className="mt-4 flex items-center gap-2">
            <Badge
              variant={lastSource === 'gemini' ? 'success' : 'info'}
              className="text-[10px]"
            >
              {lastSource === 'gemini' ? '✨ Generated by Gemini' : '⚙️ Heuristic generator'}
            </Badge>
            <span className="text-[11px] text-muted-foreground">
              {lastSource === 'heuristic'
                ? 'Connect Gemini for richer, tailored generation.'
                : 'You can refine the generated flow on the canvas.'}
            </span>
          </div>
        )}

        {/* Examples */}
        <div className="mt-10">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Need inspiration?
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.title}
                onClick={() => setStory(ex.body)}
                className="group rounded-xl border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{ex.title}</h3>
                  <ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-indigo-500" />
                </div>
                <p className="mt-1.5 line-clamp-3 text-xs text-muted-foreground">
                  {ex.body}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
