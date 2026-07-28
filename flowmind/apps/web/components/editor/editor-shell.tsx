'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Brain,
  ArrowLeft,
  Workflow,
  Database,
  Beaker,
  Rocket,
  BarChart3,
  Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GeminiConnectionButton } from '@/components/integrations/gemini-connection-button';
import { useAssistantStore } from '@/stores/assistant-store';
import { useGraphStore } from '@/stores/graph-store';
import { cn } from '@/lib/utils';

const TABS = [
  // Story is hidden for now; Canvas is the entry point.
  { id: 'canvas', label: 'Canvas', icon: Workflow },
  { id: 'knowledge', label: 'Knowledge', icon: Database },
  { id: 'test', label: 'Test', icon: Beaker },
  { id: 'deploy', label: 'Deploy', icon: Rocket },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
];

interface EditorShellProps {
  assistantId: string;
  children: React.ReactNode;
  rightPanel?: React.ReactNode;
  leftPanel?: React.ReactNode;
}

export function EditorShell({
  assistantId,
  children,
  rightPanel,
  leftPanel,
}: EditorShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const assistant = useAssistantStore((s) => s.getAssistant(assistantId));
  const saveGraph = useAssistantStore((s) => s.saveGraph);
  const updateAssistant = useAssistantStore((s) => s.updateAssistant);
  const load = useAssistantStore((s) => s.load);
  const loaded = useAssistantStore((s) => s.loaded);
  const { nodes, edges, setGraph } = useGraphStore();
  const [saved, setSaved] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Load the current user's assistants from Supabase (once per session).
  useEffect(() => {
    void load();
  }, [load]);

  // If loaded and this assistant isn't ours (or was deleted), leave the editor.
  useEffect(() => {
    if (mounted && loaded && !assistant) router.replace('/dashboard');
  }, [mounted, loaded, assistant, router]);

  // Hydrate graph store from assistant on first load
  useEffect(() => {
    if (assistant && !hydrated) {
      setGraph(assistant.graph.nodes as any, assistant.graph.edges as any);
      setHydrated(true);
    }
  }, [assistant, hydrated, setGraph]);

  // Auto-save on graph changes (debounced).
  //
  // IMPORTANT: depend only on the graph data + hydration, NOT on the `assistant`
  // object. saveGraph replaces the assistant in the store with a new identity
  // ({ ...a, graph, updatedAt }), so listing `assistant` here made this effect
  // re-fire after every save — an infinite 500ms save loop that hammered
  // Supabase for as long as the editor stayed open. Read the assistant
  // imperatively at save time instead.
  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => {
      const current = useAssistantStore.getState().getAssistant(assistantId);
      if (!current) return;
      saveGraph(assistantId, {
        nodes: nodes as any,
        edges: edges as any,
        variables: current.graph.variables,
      });
    }, 500);
    return () => clearTimeout(t);
    // saveGraph is a stable Zustand action; `assistant` is intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, hydrated, assistantId]);

  const currentTab = TABS.find((t) => pathname.endsWith(`/${t.id}`))?.id || 'canvas';

  const handleManualSave = () => {
    if (!assistant) return;
    saveGraph(assistantId, {
      nodes: nodes as any,
      edges: edges as any,
      variables: assistant.graph.variables,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handlePublish = () => {
    updateAssistant(assistantId, { status: 'active' });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  if (!mounted || !assistant) {
    // Wait for client mount and persist hydration to avoid SSR/CSR mismatch
    return (
      <div className="flex h-screen items-center justify-center bg-muted/20">
        <p className="text-sm text-muted-foreground">Loading assistant...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-muted/20">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href="/dashboard">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Brain className="size-4" />
            </div>
          </Link>
          <div className="text-sm">
            <span className="font-display font-semibold">{assistant.name}</span>
            <Badge
              variant={assistant.status === 'active' ? 'success' : 'info'}
              className="ml-2"
            >
              {assistant.status}
            </Badge>
          </div>
        </div>

        {/* Tabs */}
        <nav className="flex items-center gap-0.5 rounded-lg bg-muted p-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() =>
                  router.push(`/editor/${assistantId}/${tab.id}`)
                }
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  currentTab === tab.id
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-3.5" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <GeminiConnectionButton compact />
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualSave}
            className={saved ? 'text-emerald-600' : ''}
          >
            <Save className="size-3.5" />
            {saved ? 'Saved' : 'Save'}
          </Button>
          <Button variant="gradient" size="sm" onClick={handlePublish}>
            Publish
          </Button>
        </div>
      </header>

      {/* Main */}
      <div className="flex flex-1 overflow-hidden">
        {leftPanel && (
          <aside className="w-60 shrink-0 border-r bg-background">
            {leftPanel}
          </aside>
        )}
        <main className="flex-1 overflow-hidden">{children}</main>
        {rightPanel && (
          <aside className="w-80 shrink-0 border-l bg-background">
            {rightPanel}
          </aside>
        )}
      </div>
    </div>
  );
}
