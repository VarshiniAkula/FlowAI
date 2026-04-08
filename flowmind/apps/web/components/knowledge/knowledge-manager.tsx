'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Database,
  Upload,
  FileText,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useKnowledgeStore } from '@/lib/knowledge/store';
import type { SearchHit } from '@/lib/knowledge/search';
import type { KnowledgeSource } from '@flowmind/shared';
import { cn } from '@/lib/utils';

interface Props {
  assistantId: string;
}

export function KnowledgeManager({ assistantId }: Props) {
  // Subscribe to the knowledge store imperatively to avoid React 19 +
  // Zustand persist `useSyncExternalStore` snapshot-stability issues.
  const [documents, setDocuments] = useState<KnowledgeSource[]>([]);

  useEffect(() => {
    const read = () =>
      useKnowledgeStore
        .getState()
        .documents.filter((d) => d.assistantId === assistantId);
    setDocuments(read());
    const unsub = useKnowledgeStore.subscribe(() => setDocuments(read()));
    return unsub;
  }, [assistantId]);

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Test-search panel state
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searched, setSearched] = useState(false);

  useEffect(() => setMounted(true), []);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/parse-document', { method: 'POST', body: fd });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Upload failed (${res.status})`);
        }
        const { name, text } = await res.json();
        useKnowledgeStore.getState().addDocument(assistantId, name, text);
      }
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const runSearch = () => {
    if (!query.trim()) {
      setHits([]);
      setSearched(false);
      return;
    }
    setHits(useKnowledgeStore.getState().search(assistantId, query, 5));
    setSearched(true);
  };

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-background via-background to-violet-950/5">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-8 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-pink-600 text-white shadow-lg">
            <Database className="size-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Knowledge</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload documents your assistant can reference. Use a{' '}
              <code className="rounded bg-muted px-1 text-[11px]">RAG Query</code> node
              on the canvas to retrieve them at runtime.
            </p>
          </div>
        </div>

        {/* Upload zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFiles(e.dataTransfer.files);
          }}
          className={cn(
            'rounded-xl border-2 border-dashed bg-card p-10 text-center transition-colors',
            dragOver
              ? 'border-violet-500 bg-violet-50/40 dark:bg-violet-950/20'
              : 'border-border hover:border-violet-300',
          )}
        >
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-400">
            <Upload className="size-5" />
          </div>
          <div className="text-sm font-medium">Drop files here or click to upload</div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Supports .txt, .md, .csv, .html - up to 4 MB per file
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> Uploading...
              </>
            ) : (
              <>
                <Upload className="size-3.5" /> Choose files
              </>
            )}
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".txt,.md,.markdown,.csv,.html,.htm"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Document list */}
        <div className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <FileText className="size-3.5" /> Documents{' '}
            {mounted && documents.length > 0 && (
              <span className="text-muted-foreground">({documents.length})</span>
            )}
          </h2>
          {!mounted ? null : documents.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
              No documents yet. Upload one above to get started.
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-400">
                    <FileText className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-medium">{doc.name}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Badge
                        variant={doc.status === 'ready' ? 'success' : 'warning'}
                        className="text-[10px]"
                      >
                        {doc.status === 'ready' ? (
                          <CheckCircle2 className="mr-1 size-2.5" />
                        ) : null}
                        {doc.status}
                      </Badge>
                      <span>{doc.chunkCount ?? 0} chunks</span>
                      <span>·</span>
                      <span>{new Date(doc.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => useKnowledgeStore.getState().removeDocument(doc.id)}
                    className="text-muted-foreground hover:text-rose-500"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Test search */}
        {mounted && documents.length > 0 && (
          <div className="mt-10">
            <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Search className="size-3.5" /> Test retrieval
            </h2>
            <div className="rounded-xl border bg-card p-4">
              <div className="flex gap-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                  placeholder="Ask a question your bot might receive..."
                  className="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <Button onClick={runSearch} variant="gradient" size="sm">
                  <Search className="size-3.5" /> Search
                </Button>
              </div>
              {searched && (
                <div className="mt-3 space-y-2">
                  {hits.length === 0 ? (
                    <div className="rounded-md border border-dashed bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
                      No matches.
                    </div>
                  ) : (
                    hits.map((h) => (
                      <div
                        key={h.chunk.id}
                        className="rounded-md border bg-background px-3 py-2"
                      >
                        <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
                          <span className="font-mono">
                            {h.chunk.documentId} · chunk #{h.chunk.index}
                          </span>
                          <span>score {h.score.toFixed(3)}</span>
                        </div>
                        <p className="line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed">
                          {h.chunk.text}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
