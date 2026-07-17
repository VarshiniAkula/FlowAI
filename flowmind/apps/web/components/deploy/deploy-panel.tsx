'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Rocket,
  Code2,
  Globe,
  Copy,
  Check,
  ExternalLink,
  Sparkles,
  ShieldCheck,
  Share2,
  AlertCircle,
  CloudUpload,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useAssistantStore } from '@/stores/assistant-store';
import { cn } from '@/lib/utils';

interface Props {
  assistantId: string;
}

type Channel = 'embed' | 'link' | 'api';

export function DeployPanel({ assistantId }: Props) {
  const assistant = useAssistantStore((s) => s.getAssistant(assistantId));
  const updateAssistant = useAssistantStore((s) => s.updateAssistant);

  const [origin, setOrigin] = useState<string>('');
  const [copied, setCopied] = useState<string | null>(null);
  const [channel, setChannel] = useState<Channel>('embed');
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const isPublished = assistant?.status === 'active';
  const cloudPublishId = assistant?.cloudPublishId;
  const cloudVersion = assistant?.cloudVersion;
  // Visitors should hit the immutable cloud id; the owner-preview falls back
  // to the local assistantId so the editor still works without a publish.
  const publicId = cloudPublishId ?? assistantId;
  const shareUrl = useMemo(
    () => (origin ? `${origin}/chat/${publicId}` : ''),
    [origin, publicId],
  );
  const apiUrl = useMemo(
    () => (origin ? `${origin}/api/assistants/${assistantId}/chat` : ''),
    [origin, assistantId],
  );

  const embedSnippet = useMemo(() => {
    if (!origin) return '';
    return `<!-- FlowMind Assistant - ${assistant?.name ?? assistantId} -->
<script
  src="${origin}/widget.js"
  data-flowmind-assistant="${publicId}"
  data-flowmind-host="${origin}"
  data-flowmind-theme="auto"
  defer
></script>`;
  }, [origin, publicId, assistantId, assistant?.name]);

  const reactSnippet = useMemo(() => {
    if (!origin) return '';
    return `import { FlowMindWidget } from '@flowmind/widget-react';

export default function App() {
  return (
    <FlowMindWidget
      assistantId="${publicId}"
      host="${origin}"
      theme="auto"
    />
  );
}`;
  }, [origin, publicId]);

  const apiSnippet = useMemo(() => {
    if (!origin) return '';
    return `curl -X POST ${apiUrl} \\
  -H "Content-Type: application/json" \\
  -d '{
    "message": "Hi there",
    "session_id": "user-42"
  }'`;
  }, [origin, apiUrl]);

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // Clipboard API may be blocked in iframes - silently degrade
    }
  };

  const togglePublish = () => {
    if (!assistant) return;
    updateAssistant(assistantId, {
      status: isPublished ? 'draft' : 'active',
    });
  };

  const publishToCloud = async () => {
    if (!assistant) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assistantId,
          name: assistant.name,
          description: assistant.description ?? null,
          graph: assistant.graph,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        publishId?: string;
        version?: number;
        error?: string;
      };
      if (!res.ok || !data.publishId) {
        throw new Error(data.error ?? `Publish failed (${res.status})`);
      }
      updateAssistant(assistantId, {
        status: 'active',
        cloudPublishId: data.publishId,
        cloudVersion: data.version,
        cloudPublishedAt: Date.now(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Publish failed';
      setPublishError(message);
    } finally {
      setPublishing(false);
    }
  };

  if (!assistant) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Assistant not found.
      </div>
    );
  }

  const nodeCount = assistant.graph.nodes.length;
  const ready = nodeCount > 0;

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-background via-background to-indigo-950/5">
      <div className="mx-auto max-w-4xl px-6 py-10">
        {/* Hero */}
        <div className="mb-8 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-600 text-white shadow-lg">
            <Rocket className="size-6" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">Deploy</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Ship your assistant to the world. Embed it on any site, share a
              hosted link, or talk to it from your own backend.
            </p>
          </div>
        </div>

        {/* Status banner */}
        <div
          className={cn(
            'mb-6 flex items-center gap-4 rounded-xl border p-4',
            cloudPublishId
              ? 'border-emerald-200/60 bg-gradient-to-r from-emerald-50/60 to-teal-50/40 dark:border-emerald-900/40 dark:from-emerald-950/30 dark:to-teal-950/20'
              : isPublished
                ? 'border-indigo-200/60 bg-gradient-to-r from-indigo-50/60 to-indigo-50/40 dark:border-indigo-900/40 dark:from-indigo-950/30 dark:to-indigo-950/20'
                : 'border-amber-200/60 bg-gradient-to-r from-amber-50/60 to-orange-50/40 dark:border-amber-900/40 dark:from-amber-950/30 dark:to-orange-950/20',
          )}
        >
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-full',
              cloudPublishId
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                : isPublished
                  ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
            )}
          >
            {cloudPublishId ? (
              <ShieldCheck className="size-5" />
            ) : isPublished ? (
              <CloudUpload className="size-5" />
            ) : (
              <Sparkles className="size-5" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold">
              {cloudPublishId
                ? 'Live in cloud'
                : isPublished
                  ? 'Local draft'
                  : 'Draft'}
              <Badge
                variant={
                  cloudPublishId ? 'success' : isPublished ? 'info' : 'warning'
                }
              >
                {cloudPublishId
                  ? `v${cloudVersion ?? 1}`
                  : isPublished
                    ? 'Owner-only'
                    : 'Not published'}
              </Badge>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {cloudPublishId
                ? 'Anyone with your link can chat with this assistant.'
                : ready
                  ? 'Publish to the cloud to share a public link that works for visitors.'
                  : 'Add at least one node on the canvas before publishing.'}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="gradient"
              size="sm"
              onClick={publishToCloud}
              disabled={!ready || publishing}
            >
              {publishing ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Publishing...
                </>
              ) : cloudPublishId ? (
                <>
                  <CloudUpload className="size-3.5" />
                  Republish
                </>
              ) : (
                <>
                  <CloudUpload className="size-3.5" />
                  Publish to cloud
                </>
              )}
            </Button>
            {!cloudPublishId && (
              <Button
                variant="outline"
                size="sm"
                onClick={togglePublish}
                disabled={!ready}
              >
                {isPublished ? 'Unpublish' : 'Mark live'}
              </Button>
            )}
          </div>
        </div>

        {publishError && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{publishError}</span>
          </div>
        )}

        {!ready && (
          <div className="mb-6 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>
              Your canvas is empty. Open the{' '}
              <span className="font-semibold">Canvas</span> tab and add a few
              nodes, then come back to deploy.
            </span>
          </div>
        )}

        {/* Channels */}
        <Tabs value={channel} onValueChange={(v) => setChannel(v as Channel)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="embed">
              <Code2 className="mr-1.5 size-3.5" /> Embed
            </TabsTrigger>
            <TabsTrigger value="link">
              <Share2 className="mr-1.5 size-3.5" /> Hosted link
            </TabsTrigger>
            <TabsTrigger value="api">
              <Globe className="mr-1.5 size-3.5" /> HTTP API
            </TabsTrigger>
          </TabsList>

          <TabsContent value="embed" className="mt-4 space-y-4">
            <SnippetCard
              title="HTML / vanilla"
              description="Drop this once before </body> on any page. The widget renders a floating chat bubble in the corner."
              code={embedSnippet}
              copied={copied === 'embed-html'}
              onCopy={() => copy('embed-html', embedSnippet)}
            />
            <SnippetCard
              title="React"
              description="Use the typed React wrapper if you're shipping a Next.js, Vite, or CRA app."
              code={reactSnippet}
              copied={copied === 'embed-react'}
              onCopy={() => copy('embed-react', reactSnippet)}
            />
            <div className="rounded-lg border bg-card p-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Theming
              </div>
              <p className="text-sm text-muted-foreground">
                The widget inherits your site's color scheme by default. Pass{' '}
                <code className="rounded bg-muted px-1 text-[11px]">
                  data-flowmind-theme="dark"
                </code>{' '}
                or{' '}
                <code className="rounded bg-muted px-1 text-[11px]">
                  "light"
                </code>{' '}
                to lock it.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="link" className="mt-4 space-y-4">
            <div className="rounded-xl border bg-card p-5">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Shareable URL
                </div>
                {cloudPublishId ? (
                  <Badge variant="success">Public · v{cloudVersion ?? 1}</Badge>
                ) : (
                  <Badge variant="warning">Owner preview</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 font-mono text-xs">
                <span className="flex-1 truncate">{shareUrl || '…'}</span>
                <button
                  onClick={() => copy('link', shareUrl)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Copy link"
                >
                  {copied === 'link' ? (
                    <Check className="size-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </button>
                <a
                  href={shareUrl || '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Open"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {cloudPublishId
                  ? "Send this link to anyone - they'll get a full-page chat experience without needing to install anything."
                  : 'This URL only works in your browser until you click Publish to cloud above. Then it becomes a real public link.'}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Nodes" value={nodeCount.toString()} />
              <Stat
                label="Variables"
                value={(assistant.graph.variables ?? []).length.toString()}
              />
              <Stat
                label="Cloud version"
                value={cloudPublishId ? `v${cloudVersion ?? 1}` : '-'}
              />
            </div>
          </TabsContent>

          <TabsContent value="api" className="mt-4 space-y-4">
            <SnippetCard
              title="cURL"
              description="POST a message and receive the assistant's reply. Pass session_id to keep multi-turn state."
              code={apiSnippet}
              copied={copied === 'api-curl'}
              onCopy={() => copy('api-curl', apiSnippet)}
            />
            <div className="rounded-lg border bg-card p-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Endpoint
              </div>
              <code className="block rounded bg-muted px-3 py-2 text-[11px]">
                POST {apiUrl || '…'}
              </code>
              <p className="mt-3 text-sm text-muted-foreground">
                Authentication will be required once you add an API key in
                Settings. For local Phase-1 demos the endpoint is open from
                same-origin.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function SnippetCard({
  title,
  description,
  code,
  copied,
  onCopy,
}: {
  title: string;
  description: string;
  code: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onCopy}
          className={cn(copied && 'text-emerald-600')}
        >
          {copied ? (
            <>
              <Check className="size-3.5" /> Copied
            </>
          ) : (
            <>
              <Copy className="size-3.5" /> Copy
            </>
          )}
        </Button>
      </div>
      <pre className="overflow-x-auto bg-muted/40 px-4 py-3 font-mono text-[11px] leading-relaxed">
        <code>{code || '…'}</code>
      </pre>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </div>
  );
}
