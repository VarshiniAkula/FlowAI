'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Brain, Plus, Search, ArrowUpRight, Sparkles, Workflow, Trash2, AlertTriangle, Loader2, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GeminiConnectionButton } from '@/components/integrations/gemini-connection-button';
import { useAssistantStore } from '@/stores/assistant-store';
import { formatRelativeTime } from '@/lib/utils';
import { generateHeuristicGraph } from '@/lib/graph-generator/heuristic';
import type { Assistant, Graph, GraphNode, GraphEdge, NodeType } from '@flowmind/shared';

const TEMPLATES = [
  {
    name: 'Customer Support Bot',
    description: 'Routes tickets, answers FAQs, escalates to humans',
    icon: '🎧',
    // Keep keywords aligned with the heuristic generator's "support" archetype
    // (avoid words like "knowledge"/"docs" which would route to the knowledge bot).
    seedStory:
      'A customer support bot that triages incoming tickets, troubleshoots common issues, and escalates to a human agent when needed.',
  },
  {
    name: 'Sales Qualifier',
    description: 'Qualifies leads, books demos, captures intent',
    icon: '💼',
    seedStory:
      'A sales qualification bot that qualifies leads by capturing company size and use case, then offers to book a demo.',
  },
  {
    name: 'Knowledge Assistant',
    description: 'Answers questions from your documentation',
    icon: '📚',
    seedStory:
      'A documentation assistant that answers user questions strictly from uploaded docs and a knowledge base, citing sources for every claim.',
  },
];

// Convert the heuristic GeneratedGraph shape into the canonical shared Graph
function generatedGraphToGraph(generated: ReturnType<typeof generateHeuristicGraph>): Graph {
  const nodes: GraphNode[] = generated.nodes.map((n) => ({
    id: n.id,
    type: n.type as NodeType,
    position: n.position,
    label: n.label,
    data: n.data as GraphNode['data'],
  }));
  const edges: GraphEdge[] = generated.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}),
    ...(e.label ? { label: e.label } : {}),
  }));
  return { nodes, edges, variables: [] };
}

export default function DashboardPage() {
  const router = useRouter();
  const { assistants, createAssistant, saveGraph, deleteAssistant, load, loaded } =
    useAssistantStore();
  const [query, setQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Assistant | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = assistants.filter((a) =>
    a.name.toLowerCase().includes(query.toLowerCase()),
  );

  const handleCreate = async () => {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      const a = await createAssistant(newName.trim(), newDesc.trim() || undefined);
      router.push(`/editor/${a.id}/canvas`);
    } catch {
      setCreating(false);
    }
  };

  const handleCreateFromTemplate = async (template: (typeof TEMPLATES)[number]) => {
    if (creating) return;
    setCreating(true);
    try {
      const a = await createAssistant(template.name, template.description);
      const generated = generateHeuristicGraph(template.seedStory);
      saveGraph(a.id, generatedGraphToGraph(generated));
      router.push(`/editor/${a.id}/canvas`);
    } catch {
      setCreating(false);
    }
  };

  const handleConfirmDelete = () => {
    if (!confirmDelete) return;
    deleteAssistant(confirmDelete.id);
    setConfirmDelete(null);
  };

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Brain className="size-4" />
            </div>
            <span className="font-display text-lg font-bold tracking-tight">
              FlowMind
            </span>
            <Badge variant="outline" className="ml-2">
              Dashboard
            </Badge>
          </Link>
          <div className="flex items-center gap-2">
            <GeminiConnectionButton compact />
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search assistants..."
                className="w-64 pl-8"
              />
            </div>
            <Button
              variant="gradient"
              onClick={() => setShowCreate(true)}
              className="gap-1.5"
            >
              <Plus className="size-4" /> New Assistant
            </Button>
            <Button asChild variant="ghost" size="icon" title="Sign out">
              <a href="/logout">
                <LogOut className="size-4" />
              </a>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Templates section */}
        <section className="mb-10">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight">
                Start from a template
              </h2>
              <p className="text-sm text-muted-foreground">
                Pre-built flows you can customize
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {TEMPLATES.map((t) => (
              <button
                key={t.name}
                onClick={() => handleCreateFromTemplate(t)}
                className="group rounded-xl border bg-card p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="mb-3 text-3xl">{t.icon}</div>
                <h3 className="font-semibold">{t.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t.description}
                </p>
                <div className="mt-3 flex items-center gap-1 text-xs text-indigo-600 opacity-0 transition-opacity group-hover:opacity-100">
                  Use template <ArrowUpRight className="size-3" />
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Your assistants */}
        <section>
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight">
                Your assistants
              </h2>
              <p className="text-sm text-muted-foreground">
                {!loaded
                  ? 'Loading\u2026'
                  : assistants.length === 0
                    ? 'You have no assistants yet'
                    : `${assistants.length} total`}
              </p>
            </div>
          </div>

          {!loaded ? (
            <Card className="flex items-center justify-center gap-3 border-dashed py-16 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading your assistants\u2026
            </Card>
          ) : filtered.length === 0 ? (
            <Card className="flex flex-col items-center justify-center gap-4 border-dashed py-16">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-primary">
                <Sparkles className="size-7" />
              </div>
              <div className="text-center">
                <p className="font-medium">No assistants yet</p>
                <p className="text-sm text-muted-foreground">
                  Create your first one to get started
                </p>
              </div>
              <Button variant="gradient" onClick={() => setShowCreate(true)}>
                <Plus className="size-4" /> Create assistant
              </Button>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((a) => (
                <div key={a.id} className="group relative">
                  <Link href={`/editor/${a.id}/canvas`} className="block h-full">
                    <Card className="h-full p-5 transition-all hover:-translate-y-0.5 hover:shadow-md">
                      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-primary">
                        <Workflow className="size-5" />
                      </div>
                      <h3 className="font-semibold">{a.name}</h3>
                      {a.description && (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {a.description}
                        </p>
                      )}
                      <div className="mt-4 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <Badge
                          variant={
                            a.status === 'active'
                              ? 'success'
                              : a.status === 'archived'
                                ? 'secondary'
                                : 'info'
                          }
                        >
                          {a.status}
                        </Badge>
                        <span className="truncate">
                          {a.graph.nodes.length} nodes · Updated {formatRelativeTime(a.updatedAt)}
                        </span>
                      </div>
                    </Card>
                  </Link>
                  <button
                    type="button"
                    aria-label={`Delete ${a.name}`}
                    title="Delete assistant"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setConfirmDelete(a);
                    }}
                    className="absolute right-2.5 top-2.5 z-10 rounded-md border border-border bg-card/90 p-1.5 text-muted-foreground opacity-0 shadow-sm backdrop-blur transition hover:border-destructive/40 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 group-hover:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Create modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setShowCreate(false)}
        >
          <Card
            className="w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-lg font-bold tracking-tight">
              Create assistant
            </h3>
            <p className="text-sm text-muted-foreground">
              Give it a name and a short description
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="My customer support bot"
                  className="mt-1"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
              </div>
              <div>
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="What does this assistant do?"
                  className="mt-1"
                  rows={3}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button
                variant="gradient"
                onClick={handleCreate}
                disabled={!newName.trim() || creating}
              >
                {creating ? <Loader2 className="size-4 animate-spin" /> : null}
                Create
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setConfirmDelete(null)}
        >
          <Card className="w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                <AlertTriangle className="size-4" />
              </span>
              <div>
                <h3 className="font-display text-lg font-bold tracking-tight">
                  Delete assistant?
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  This permanently deletes{' '}
                  <span className="font-medium text-foreground">{confirmDelete.name}</span>
                  {confirmDelete.status === 'draft' ? ' (draft)' : ''} and its flow. This can&apos;t
                  be undone.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleConfirmDelete}>
                <Trash2 className="size-4" /> Delete
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
