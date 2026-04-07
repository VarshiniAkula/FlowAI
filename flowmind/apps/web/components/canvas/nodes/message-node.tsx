'use client';

import type { NodeProps } from '@xyflow/react';
import { BaseNode } from './base-node';
import type { MessageNodeData } from '@flowmind/shared';

export function MessageNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as MessageNodeData & { label: string };
  return (
    <BaseNode id={id} type="message" label={d.label || 'Message'} selected={selected}>
      <p className="line-clamp-3 text-zinc-200">{d.text || '(empty)'}</p>
    </BaseNode>
  );
}
