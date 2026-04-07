'use client';

import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { MessageNodeData } from '@flowmind/shared';

interface Props {
  data: MessageNodeData;
  onChange: (patch: Partial<MessageNodeData>) => void;
}

export function MessageInspector({ data, onChange }: Props) {
  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="message-text">Message text</Label>
        <Textarea
          id="message-text"
          value={data.text ?? ''}
          rows={6}
          onChange={(e) => onChange({ text: e.target.value })}
          placeholder="Hello! How can I help you today?"
          className="mt-1.5 font-sans text-sm"
        />
        <p className="mt-1 text-[10px] text-muted-foreground">
          Plain text or markdown. Insert variables with{' '}
          <code className="rounded bg-muted px-1 font-mono">{'{{name}}'}</code>.
        </p>
      </div>
    </div>
  );
}
