'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { LlmResponseNodeData } from '@flowmind/shared';

interface Props {
  data: LlmResponseNodeData;
  onChange: (patch: Partial<LlmResponseNodeData>) => void;
}

const MODELS: Array<{ value: LlmResponseNodeData['model']; label: string; subtitle: string }> = [
  { value: 'auto', label: 'Auto (recommended)', subtitle: 'Gemini → Groq fallback' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', subtitle: 'Google · fast & cheap' },
  { value: 'llama-3.3-70b', label: 'Llama 3.3 70B', subtitle: 'Groq · ultra low latency' },
];

export function LlmResponseInspector({ data, onChange }: Props) {
  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="llm-system">System prompt</Label>
        <Textarea
          id="llm-system"
          value={data.systemPrompt ?? ''}
          rows={4}
          onChange={(e) => onChange({ systemPrompt: e.target.value })}
          placeholder="You are a helpful assistant. Use this context: {{context}}"
          className="mt-1.5 text-xs"
        />
      </div>

      <div>
        <Label htmlFor="llm-user">User message template</Label>
        <Textarea
          id="llm-user"
          value={data.userTemplate ?? ''}
          rows={3}
          onChange={(e) => onChange({ userTemplate: e.target.value })}
          placeholder="{{question}}"
          className="mt-1.5 font-mono text-xs"
        />
      </div>

      <div>
        <Label htmlFor="llm-model">Model</Label>
        <select
          id="llm-model"
          value={data.model}
          onChange={(e) =>
            onChange({ model: e.target.value as LlmResponseNodeData['model'] })
          }
          className="mt-1.5 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {MODELS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label} - {m.subtitle}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="llm-temp">Temperature</Label>
          <Input
            id="llm-temp"
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={data.temperature ?? 0.7}
            onChange={(e) => onChange({ temperature: Number(e.target.value) })}
            className="mt-1.5 text-xs"
          />
        </div>
        <div>
          <Label htmlFor="llm-tokens">Max tokens</Label>
          <Input
            id="llm-tokens"
            type="number"
            min={1}
            max={8192}
            value={data.maxTokens ?? 1024}
            onChange={(e) => onChange({ maxTokens: Number(e.target.value) })}
            className="mt-1.5 text-xs"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="llm-result">Save reply to</Label>
        <Input
          id="llm-result"
          value={data.resultVariable ?? ''}
          onChange={(e) =>
            onChange({
              resultVariable: e.target.value.replace(/[^a-zA-Z0-9_]/g, ''),
            })
          }
          placeholder="answer"
          className="mt-1.5 font-mono text-xs"
        />
      </div>
    </div>
  );
}
