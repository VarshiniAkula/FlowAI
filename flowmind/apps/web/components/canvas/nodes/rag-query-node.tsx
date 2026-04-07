'use client';

import type { NodeProps } from '@xyflow/react';
import { BaseNode } from './base-node';
import type { RagQueryNodeData } from '@flowmind/shared';

export function RagQueryNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as RagQueryNodeData & { label: string };
  return (
    <BaseNode id={id} type="rag_query" label={d.label || 'RAG Query'} selected={selected}>
      <code className="block truncate rounded bg-cyan-500/10 px-2 py-1 font-mono text-[11px] text-cyan-200">
        {d.queryTemplate || '(no query)'}
      </code>
      <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-400">
        <span>top {d.topK ?? 5}</span>
        <span className="font-mono text-cyan-300">→ {d.resultVariable || 'context'}</span>
      </div>
    </BaseNode>
  );
}
