'use client';

import type { NodeProps } from '@xyflow/react';
import { BaseNode } from './base-node';
import type { InputNodeData } from '@flowmind/shared';

export function InputNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as InputNodeData & { label: string };
  return (
    <BaseNode id={id} type="input" label={d.label || 'Input'} selected={selected}>
      <p className="line-clamp-2 text-zinc-200">{d.prompt || '(no prompt)'}</p>
      <div className="mt-1 inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
        → {d.variableName || 'var'}
      </div>
    </BaseNode>
  );
}
