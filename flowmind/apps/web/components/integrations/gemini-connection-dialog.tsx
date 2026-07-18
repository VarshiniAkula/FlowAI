'use client';

import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ExternalLink, Loader2, Lock, ShieldCheck, X } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface ConnectError {
  message: string;
}

/**
 * BYOK connection dialog. Holds the key only in local input state, and only
 * until submission — on success (or close) the field is cleared and no
 * reference to the value is kept anywhere in client state.
 */
export function GeminiConnectionDialog({
  open,
  onOpenChange,
  onConnect,
  isConnecting,
  error,
  onClearError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnect: (apiKey: string) => Promise<boolean>;
  isConnecting: boolean;
  error: ConnectError | null;
  onClearError: () => void;
}) {
  const [apiKey, setApiKey] = useState('');

  // Never retain the typed value once the dialog is closed.
  useEffect(() => {
    if (!open) setApiKey('');
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim() || isConnecting) return;
    const ok = await onConnect(apiKey.trim());
    if (ok) {
      setApiKey(''); // clear immediately on success
      onOpenChange(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 shadow-lift focus:outline-none"
          onOpenAutoFocus={onClearError}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-md bg-secondary text-primary">
                <Lock className="size-4" />
              </span>
              <Dialog.Title className="font-display text-lg font-bold tracking-tight">
                Connect Gemini
              </Dialog.Title>
            </div>
            <Dialog.Close className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="size-4" />
            </Dialog.Close>
          </div>

          <Dialog.Description className="text-sm text-muted-foreground">
            Connect your own Gemini API key to enable real flow generation and LLM responses.
            Requests will use your Google AI quota. FlowMind uses the key only on the server and
            does not permanently store it.
          </Dialog.Description>

          <form onSubmit={submit} className="mt-4 space-y-3">
            <div>
              <label htmlFor="gemini-key" className="mb-1.5 block text-xs font-semibold text-foreground">
                Gemini API key
              </label>
              <input
                id="gemini-key"
                type="password"
                autoComplete="off"
                autoFocus
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  if (error) onClearError();
                }}
                placeholder="Paste your key…"
                className="flex h-10 w-full rounded-md border border-transparent bg-muted px-3.5 text-sm transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              />
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Get a key from Google AI Studio <ExternalLink className="size-3" />
              </a>
            </div>

            {error && (
              <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                {error.message}
              </p>
            )}

            <div className="flex items-start gap-2 rounded-md bg-muted/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-mint" />
              <span>
                For additional safety, use a dedicated key and revoke it when you have finished
                testing. Your connection expires automatically.
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="gradient" disabled={!apiKey.trim() || isConnecting}>
                {isConnecting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Validating…
                  </>
                ) : (
                  'Connect and validate'
                )}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
