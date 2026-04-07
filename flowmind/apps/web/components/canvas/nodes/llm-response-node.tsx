'use client';

import type { NodeProps } from '@xyflow/react';
import { BaseNode } from './base-node';
import type { LlmResponseNodeData } from '@flowmind/shared';

export function LlmResponseNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as LlmResponseNodeData & { label: string };
  return (
    <BaseNode id={id} type="llm_response" label={d.label || 'LLM Response'} selected={selected}>
      <p className="line-clamp-2 text-zinc-200">{d.systemPrompt || '(no system prompt)'}</p>
      <div className="mt-2 flex items-center gap-1 text-[10px]">
        <span className="rounded bg-rose-500/10 px-1.5 py-0.5 font-mono text-rose-300">
          {d.model || 'auto'}
        </span>
        <span className="text-zinc-500">·</span>
        <span className="text-zinc-400">temp {d.temperature ?? 0.7}</span>
      </div>
    </BaseNode>
  );
}
