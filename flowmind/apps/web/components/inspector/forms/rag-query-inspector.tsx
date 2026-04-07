'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { RagQueryNodeData } from '@flowmind/shared';

interface Props {
  data: RagQueryNodeData;
  onChange: (patch: Partial<RagQueryNodeData>) => void;
}

export function RagQueryInspector({ data, onChange }: Props) {
  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="rag-query">Query template</Label>
        <Textarea
          id="rag-query"
          value={data.queryTemplate ?? ''}
          rows={3}
          onChange={(e) => onChange({ queryTemplate: e.target.value })}
          placeholder="{{question}}"
          className="mt-1.5 font-mono text-xs"
        />
        <p className="mt-1 text-[10px] text-muted-foreground">
          Use{' '}
          <code className="rounded bg-muted px-1">{'{{variable}}'}</code> to
          interpolate user input.
        </p>
      </div>

      <div>
        <Label htmlFor="rag-topk">Results to retrieve (top-K)</Label>
        <Input
          id="rag-topk"
          type="number"
          min={1}
          max={20}
          value={data.topK ?? 5}
          onChange={(e) => onChange({ topK: Number(e.target.value) })}
          className="mt-1.5 text-xs"
        />
      </div>

      <div>
        <Label htmlFor="rag-result">Save context to</Label>
        <Input
          id="rag-result"
          value={data.resultVariable ?? ''}
          onChange={(e) =>
            onChange({
              resultVariable: e.target.value.replace(/[^a-zA-Z0-9_]/g, ''),
            })
          }
          placeholder="context"
          className="mt-1.5 font-mono text-xs"
        />
        <p className="mt-1 text-[10px] text-muted-foreground">
          Reference later as{' '}
          <code className="rounded bg-muted px-1 font-mono">
            {'{{' + (data.resultVariable || 'context') + '}}'}
          </code>
        </p>
      </div>

      <div className="rounded-md border border-dashed border-cyan-500/20 bg-cyan-500/5 p-2.5">
        <p className="text-[10px] font-medium text-cyan-600">
          Tip: pair with an LLM Response node
        </p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          The retrieved chunks become a variable that you can pass into a
          system prompt or message.
        </p>
      </div>
    </div>
  );
}
