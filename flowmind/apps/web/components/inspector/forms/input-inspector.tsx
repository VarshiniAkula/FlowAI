'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { InputNodeData } from '@flowmind/shared';

interface Props {
  data: InputNodeData;
  onChange: (patch: Partial<InputNodeData>) => void;
}

export function InputInspector({ data, onChange }: Props) {
  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="input-prompt">Prompt</Label>
        <Textarea
          id="input-prompt"
          value={data.prompt ?? ''}
          rows={3}
          onChange={(e) => onChange({ prompt: e.target.value })}
          placeholder="What is your name?"
          className="mt-1.5 text-sm"
        />
      </div>
      <div>
        <Label htmlFor="input-var">Save answer to variable</Label>
        <Input
          id="input-var"
          value={data.variableName ?? ''}
          onChange={(e) =>
            onChange({ variableName: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })
          }
          placeholder="user_name"
          className="mt-1.5 font-mono text-xs"
        />
        <p className="mt-1 text-[10px] text-muted-foreground">
          Reference later as{' '}
          <code className="rounded bg-muted px-1 font-mono">
            {'{{' + (data.variableName || 'variable') + '}}'}
          </code>
        </p>
      </div>
    </div>
  );
}
