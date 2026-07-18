'use client';

import { useState } from 'react';
import { Plug, Unplug } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useGeminiConnection } from '@/hooks/use-gemini-connection';
import { cn } from '@/lib/utils';

import { GeminiConnectionDialog } from './gemini-connection-dialog';
import { GeminiStatusBadge } from './gemini-status-badge';

/**
 * Self-contained Gemini connection control: a live status badge plus the
 * connect / disconnect actions and the connection dialog. Drop it into the
 * editor header, dashboard, Story Builder, or Simulator.
 *
 * `compact` hides the connect/disconnect text button and makes the badge itself
 * the trigger — for tight header rows.
 */
export function GeminiConnectionButton({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const { status, isConnecting, error, connect, disconnect, clearError } =
    useGeminiConnection();
  const [open, setOpen] = useState(false);

  const isByok = status?.connected && status.mode === 'byok';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {compact ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="cursor-pointer rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          title={isByok ? 'Manage Gemini connection' : 'Connect Gemini'}
        >
          <GeminiStatusBadge status={status} />
        </button>
      ) : (
        <>
          <GeminiStatusBadge status={status} />
          {isByok ? (
            <Button variant="ghost" size="sm" onClick={() => void disconnect()}>
              <Unplug className="size-3.5" /> Disconnect
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              <Plug className="size-3.5" />
              {status?.mode === 'platform' ? 'Use your key' : 'Connect Gemini'}
            </Button>
          )}
        </>
      )}

      <GeminiConnectionDialog
        open={open}
        onOpenChange={setOpen}
        onConnect={connect}
        isConnecting={isConnecting}
        error={error}
        onClearError={clearError}
      />
    </div>
  );
}
