'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Workflow,
  Database,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  TrendingUp,
  Layers,
  Network,
  FileText,
  Activity,
  CloudOff,
  Users,
  RefreshCw,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAssistantStore } from '@/stores/assistant-store';
import { dbListDocuments, type KnowledgeDoc } from '@/lib/db/knowledge';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { NODE_LABELS, NODE_COLORS, type NodeType } from '@flowmind/shared';
import type { Assistant, GraphEdge, GraphNode } from '@flowmind/shared';
import { cn } from '@/lib/utils';

interface Props {
  assistantId: string;
}

interface LintFinding {
  level: 'error' | 'warning' | 'info';
  message: string;
  nodeId?: string;
}

interface AnalyticsSummary {
  configured: boolean;
  totalConversations: number;
  activeConversations: number;
  completedConversations: number;
  totalTurns: number;
  avgTurnsPerConversation: number;
  conversationsLast24h: number;
  byDay: Array<{ day: string; count: number }>;
}

/**
 * Builder-facing analytics. Combines locally-derived static analysis (graph
 * composition, knowledge inventory, structural lints) with live conversation
 * telemetry pulled from Supabase via /api/analytics/[assistantId]. The
 * aggregator rolls up across every publish version of the same owner-side
 * assistant id, so renaming or republishing doesn't reset the dashboard.
 */
export function AnalyticsPanel({ assistantId }: Props) {
  const [hydrated, setHydrated] = useState(false);
  const [assistant, setAssistant] = useState<Assistant | undefined>(undefined);
  const [documents, setDocuments] = useState<KnowledgeDoc[]>([]);
  const [chunkCount, setChunkCount] = useState(0);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryFetchedAt, setSummaryFetchedAt] = useState<number | null>(null);

  // Assistant comes from the (Supabase-backed) store; knowledge documents are
  // fetched from Supabase (RLS-scoped to the user's org).
  useEffect(() => {
    const readAssistant = () => useAssistantStore.getState().getAssistant(assistantId);
    setAssistant(readAssistant());
    setHydrated(true);
    const unsubA = useAssistantStore.subscribe(() => setAssistant(readAssistant()));

    const supabase = createSupabaseBrowserClient();
    dbListDocuments(supabase, assistantId)
      .then((docs) => {
        setDocuments(docs);
        setChunkCount(docs.reduce((sum, d) => sum + d.chunkCount, 0));
      })
      .catch((err) => console.error('[analytics] knowledge load failed', err));

    return () => {
      unsubA();
    };
  }, [assistantId]);

  const loadSummary = async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const res = await fetch(`/api/analytics/${encodeURIComponent(assistantId)}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const data = (await res.json()) as AnalyticsSummary;
      setSummary(data);
      setSummaryFetchedAt(Date.now());
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setSummaryLoading(false);
    }
  };

  // Fetch live conversation stats once we have the assistantId. The API
  // returns a zeroed payload when Supabase isn't configured, so we always
  // call it instead of branching on cloudPublishId.
  useEffect(() => {
    void loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistantId]);

  const nodes = (assistant?.graph.nodes ?? []) as GraphNode[];
  const edges = (assistant?.graph.edges ?? []) as GraphEdge[];
  const variables = assistant?.graph.variables ?? [];

  const composition = useMemo(() => {
    const counts: Partial<Record<NodeType, number>> = {};
    for (const n of nodes) {
      counts[n.type] = (counts[n.type] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([type, count]) => ({ type: type as NodeType, count: count as number }))
      .sort((a, b) => b.count - a.count);
  }, [nodes]);

  const findings: LintFinding[] = useMemo(() => {
    const out: LintFinding[] = [];
    if (nodes.length === 0) {
      out.push({ level: 'warning', message: 'Canvas is empty - add at least one node to deploy.' });
      return out;
    }

    // Find unreachable nodes (no inbound edge AND not a start candidate).
    const inbound = new Set(edges.map((e) => e.target));
    const outbound = new Set(edges.map((e) => e.source));
    const startCandidates = nodes.filter((n) => !inbound.has(n.id));

    if (startCandidates.length === 0) {
      out.push({
        level: 'error',
        message: 'No start node found - every node has an incoming edge (cycle?).',
      });
    } else if (startCandidates.length > 1) {
      out.push({
        level: 'warning',
        message: `Multiple possible start nodes (${startCandidates.length}). The runtime will pick one.`,
      });
    }

    // Find dead-end nodes that aren't terminals.
    for (const n of nodes) {
      const hasOutbound = outbound.has(n.id);
      const isTerminal = n.type === 'end' || n.type === 'human_handoff';
      if (!hasOutbound && !isTerminal) {
        out.push({
          level: 'warning',
          message: `Node "${n.label || n.id}" has no outgoing connection.`,
          nodeId: n.id,
        });
      }
    }

    // RAG nodes without any indexed documents.
    const ragCount = nodes.filter((n) => n.type === 'rag_query').length;
    if (ragCount > 0 && documents.length === 0) {
      out.push({
        level: 'warning',
        message: `${ragCount} RAG node${ragCount > 1 ? 's' : ''} but no documents uploaded - retrieval will return nothing.`,
      });
    }

    // Self-loops.
    for (const e of edges) {
      if (e.source === e.target) {
        out.push({
          level: 'warning',
          message: `Self-loop on node "${e.source}".`,
          nodeId: e.source,
        });
      }
    }

    if (out.length === 0) {
      out.push({ level: 'info', message: 'No issues detected. Looking good!' });
    }
    return out;
  }, [nodes, edges, documents.length]);

  if (!hydrated) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading analytics...
      </div>
    );
  }

  if (!assistant) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Assistant not found.
      </div>
    );
  }

  const errorCount = findings.filter((f) => f.level === 'error').length;
  const warningCount = findings.filter((f) => f.level === 'warning').length;
  const healthScore = computeHealthScore(nodes.length, errorCount, warningCount);

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-background via-background to-indigo-950/5">
      <div className="mx-auto max-w-5xl px-6 py-10">
        {/* Hero */}
        <div className="mb-8 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-600 text-white shadow-lg">
            <BarChart3 className="size-6" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Health checks, graph composition, and live conversation telemetry
              from your cloud-published assistants.
            </p>
          </div>
        </div>

        {/* Top stats */}
        <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<Activity className="size-4" />}
            label="Health"
            value={`${healthScore}%`}
            tone={healthScore >= 80 ? 'success' : healthScore >= 50 ? 'warning' : 'danger'}
            sublabel={
              errorCount > 0
                ? `${errorCount} error${errorCount > 1 ? 's' : ''}`
                : warningCount > 0
                  ? `${warningCount} warning${warningCount > 1 ? 's' : ''}`
                  : 'All checks pass'
            }
          />
          <StatCard
            icon={<Workflow className="size-4" />}
            label="Nodes"
            value={nodes.length.toString()}
            sublabel={`${edges.length} edge${edges.length === 1 ? '' : 's'}`}
          />
          <StatCard
            icon={<Database className="size-4" />}
            label="Documents"
            value={documents.length.toString()}
            sublabel={`${chunkCount} chunk${chunkCount === 1 ? '' : 's'} indexed`}
          />
          <StatCard
            icon={<Users className="size-4" />}
            label="Sessions"
            value={(summary?.totalConversations ?? 0).toString()}
            tone={summary && summary.totalConversations > 0 ? 'success' : undefined}
            sublabel={
              summary && summary.totalConversations > 0
                ? `${summary.conversationsLast24h} in last 24h`
                : variables.length > 0
                  ? `${variables.length} variable${variables.length > 1 ? 's' : ''}`
                  : 'No traffic yet'
            }
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          {/* Health checks */}
          <div className="lg:col-span-3">
            <Section
              icon={<CheckCircle2 className="size-4" />}
              title="Health checks"
              subtitle="Static analysis run against your current canvas."
            >
              <div className="space-y-2">
                {findings.map((f, i) => (
                  <FindingRow key={i} finding={f} />
                ))}
              </div>
            </Section>
          </div>

          {/* Graph composition */}
          <div className="lg:col-span-2">
            <Section
              icon={<Layers className="size-4" />}
              title="Graph composition"
              subtitle="Distribution of node types."
            >
              {composition.length === 0 ? (
                <div className="rounded-md border border-dashed bg-muted/20 px-3 py-6 text-center text-xs text-muted-foreground">
                  No nodes yet.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {composition.map(({ type, count }) => (
                    <CompositionBar
                      key={type}
                      type={type}
                      count={count}
                      total={nodes.length}
                    />
                  ))}
                </div>
              )}
            </Section>
          </div>

          {/* Knowledge inventory */}
          <div className="lg:col-span-3">
            <Section
              icon={<FileText className="size-4" />}
              title="Knowledge inventory"
              subtitle="Documents available for RAG retrieval."
            >
              {documents.length === 0 ? (
                <div className="rounded-md border border-dashed bg-muted/20 px-3 py-6 text-center text-xs text-muted-foreground">
                  No documents uploaded yet. Open the{' '}
                  <span className="font-semibold">Knowledge</span> tab to add some.
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.slice(0, 6).map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center gap-3 rounded-md border bg-card px-3 py-2"
                    >
                      <FileText className="size-3.5 shrink-0 text-indigo-500" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium">{doc.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {doc.chunkCount ?? 0} chunks
                        </div>
                      </div>
                      <Badge
                        variant={doc.status === 'ready' ? 'success' : 'warning'}
                        className="text-[10px]"
                      >
                        {doc.status}
                      </Badge>
                    </div>
                  ))}
                  {documents.length > 6 && (
                    <div className="px-2 text-center text-[11px] text-muted-foreground">
                      + {documents.length - 6} more
                    </div>
                  )}
                </div>
              )}
            </Section>
          </div>

          {/* Live conversations */}
          <div className="lg:col-span-2">
            <Section
              icon={<TrendingUp className="size-4" />}
              title="Live conversations"
              subtitle={
                summaryFetchedAt
                  ? `Updated ${formatRelative(summaryFetchedAt)}`
                  : 'Production telemetry from cloud-published chats.'
              }
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void loadSummary()}
                  disabled={summaryLoading}
                  aria-label="Refresh"
                >
                  <RefreshCw
                    className={cn(
                      'size-3.5',
                      summaryLoading && 'animate-spin',
                    )}
                  />
                </Button>
              }
            >
              <LiveConversations
                summary={summary}
                loading={summaryLoading}
                error={summaryError}
                published={Boolean(assistant?.cloudPublishId)}
              />
            </Section>
          </div>
        </div>

        {/* Connectivity summary */}
        <div className="mt-6">
          <Section
            icon={<Network className="size-4" />}
            title="Connectivity"
            subtitle="Reachability stats - useful for spotting orphaned branches."
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <MiniStat
                label="Avg outbound"
                value={
                  nodes.length === 0 ? '0' : (edges.length / nodes.length).toFixed(2)
                }
                sublabel="edges per node"
              />
              <MiniStat
                label="Branching factor"
                value={maxBranchingFactor(nodes, edges).toString()}
                sublabel="max outgoing edges"
              />
              <MiniStat
                label="Depth"
                value={estimateDepth(nodes, edges).toString()}
                sublabel="longest path"
              />
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  subtitle,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="mb-4 flex items-start gap-2">
        <div className="mt-0.5 text-indigo-500">{icon}</div>
        <div className="flex-1">
          <h2 className="text-sm font-semibold">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
}

function LiveConversations({
  summary,
  loading,
  error,
  published,
}: {
  summary: AnalyticsSummary | null;
  loading: boolean;
  error: string | null;
  published: boolean;
}) {
  if (loading && !summary) {
    return (
      <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
        Loading...
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-3 text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
        {error}
      </div>
    );
  }
  if (!summary || !summary.configured) {
    return (
      <div className="rounded-lg border border-dashed bg-gradient-to-br from-indigo-50 to-indigo-50 p-5 text-center dark:from-indigo-950/20 dark:to-indigo-950/20">
        <CloudOff className="mx-auto mb-2 size-5 text-indigo-500" />
        <div className="text-xs font-semibold">Cloud telemetry off</div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          Configure Supabase to start collecting hosted-chat metrics.
        </p>
      </div>
    );
  }
  if (summary.totalConversations === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/20 p-5 text-center">
        <Sparkles className="mx-auto mb-2 size-5 text-indigo-500" />
        <div className="text-xs font-semibold">No conversations yet</div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          {published
            ? 'Share your hosted link - the first visitor will show up here.'
            : 'Publish to cloud from the Deploy tab to start collecting data.'}
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <MiniStat
          label="Total"
          value={summary.totalConversations.toString()}
          sublabel="all-time"
        />
        <MiniStat
          label="Last 24h"
          value={summary.conversationsLast24h.toString()}
          sublabel="new sessions"
        />
        <MiniStat
          label="Active"
          value={summary.activeConversations.toString()}
          sublabel="in progress"
        />
        <MiniStat
          label="Avg turns"
          value={summary.avgTurnsPerConversation.toString()}
          sublabel="per chat"
        />
      </div>
      {summary.byDay.length > 0 && (
        <div>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Last {summary.byDay.length} day{summary.byDay.length === 1 ? '' : 's'}
          </div>
          <DaySpark byDay={summary.byDay} />
        </div>
      )}
    </div>
  );
}

function DaySpark({ byDay }: { byDay: Array<{ day: string; count: number }> }) {
  const max = Math.max(1, ...byDay.map((d) => d.count));
  return (
    <div className="flex h-12 items-end gap-1">
      {byDay.map((d) => (
        <div
          key={d.day}
          title={`${d.day}: ${d.count} conversation${d.count === 1 ? '' : 's'}`}
          className="flex-1 rounded-sm bg-gradient-to-t from-indigo-500 to-indigo-500"
          style={{ height: `${Math.max(6, (d.count / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function formatRelative(ts: number): string {
  const delta = Date.now() - ts;
  if (delta < 5_000) return 'just now';
  if (delta < 60_000) return `${Math.floor(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  return `${Math.floor(delta / 3_600_000)}h ago`;
}

function StatCard({
  icon,
  label,
  value,
  sublabel,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel?: string;
  tone?: 'success' | 'warning' | 'danger';
}) {
  const toneClasses =
    tone === 'success'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'warning'
        ? 'text-amber-600 dark:text-amber-400'
        : tone === 'danger'
          ? 'text-rose-600 dark:text-rose-400'
          : 'text-foreground';
  return (
    <div className="rounded-xl border bg-card px-4 py-4">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="text-indigo-500">{icon}</span>
        {label}
      </div>
      <div className={cn('mt-2 text-2xl font-bold', toneClasses)}>{value}</div>
      {sublabel && (
        <div className="mt-0.5 text-[11px] text-muted-foreground">{sublabel}</div>
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <div className="rounded-lg border bg-background px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-xl font-bold">{value}</div>
      {sublabel && (
        <div className="text-[10px] text-muted-foreground">{sublabel}</div>
      )}
    </div>
  );
}

function CompositionBar({
  type,
  count,
  total,
}: {
  type: NodeType;
  count: number;
  total: number;
}) {
  const pct = total === 0 ? 0 : Math.round((count / total) * 100);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="font-medium">{NODE_LABELS[type]}</span>
        <span className="text-muted-foreground">
          {count} <span className="opacity-60">· {pct}%</span>
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full bg-gradient-to-r', NODE_COLORS[type])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function FindingRow({ finding }: { finding: LintFinding }) {
  const styles =
    finding.level === 'error'
      ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200'
      : finding.level === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200'
        : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200';
  const Icon =
    finding.level === 'error' || finding.level === 'warning'
      ? AlertTriangle
      : CheckCircle2;
  return (
    <div className={cn('flex items-start gap-2 rounded-md border px-3 py-2 text-xs', styles)}>
      <Icon className="mt-0.5 size-3.5 shrink-0" />
      <span className="flex-1 leading-relaxed">{finding.message}</span>
    </div>
  );
}

function computeHealthScore(nodeCount: number, errors: number, warnings: number): number {
  if (nodeCount === 0) return 0;
  let score = 100;
  score -= errors * 30;
  score -= warnings * 8;
  return Math.max(0, Math.min(100, score));
}

function maxBranchingFactor(nodes: GraphNode[], edges: GraphEdge[]): number {
  if (nodes.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const e of edges) {
    counts.set(e.source, (counts.get(e.source) ?? 0) + 1);
  }
  let max = 0;
  for (const v of counts.values()) if (v > max) max = v;
  return max;
}

function estimateDepth(nodes: GraphNode[], edges: GraphEdge[]): number {
  if (nodes.length === 0) return 0;
  const fallback = nodes[0]!.id;
  // Simple BFS from each candidate start to find longest acyclic path length.
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) adj.get(e.source)?.push(e.target);
  const inbound = new Set(edges.map((e) => e.target));
  const starts = nodes.filter((n) => !inbound.has(n.id)).map((n) => n.id);
  const startSet = starts.length > 0 ? starts : [fallback];

  let maxDepth = 0;
  const dfs = (id: string, depth: number, visited: Set<string>) => {
    if (visited.has(id)) return;
    visited.add(id);
    if (depth > maxDepth) maxDepth = depth;
    for (const next of adj.get(id) ?? []) dfs(next, depth + 1, visited);
    visited.delete(id);
  };
  for (const s of startSet) dfs(s, 1, new Set());
  return maxDepth;
}
