'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { BaseNode } from './base-node';
import type { ChoiceNodeData } from '@flowmind/shared';

export function ChoiceNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as ChoiceNodeData & { label: string };
  const options = d.options || [];

  return (
    <div className="relative">
      <BaseNode
        id={id}
        type="choice"
        label={d.label || 'Choice'}
        selected={selected}
        showSourceHandle={false}
      >
        <p className="line-clamp-2 text-zinc-200">{d.prompt || '(no prompt)'}</p>
        <div className="mt-2 space-y-1">
          {options.map((opt, idx) => (
            <div
              key={opt.id}
              className="relative flex items-center justify-between rounded bg-violet-500/10 px-2 py-1 text-[11px] text-violet-200"
            >
              <span>{opt.label}</span>
              <span className="font-mono text-[10px] text-violet-400">
                {opt.value}
              </span>
              <Handle
                type="source"
                position={Position.Right}
                id={opt.id}
                style={{
                  right: -14,
                  top: '50%',
                  transform: 'translateY(-50%)',
                }}
                className="!h-2.5 !w-2.5 !border-2 !border-zinc-900 !bg-violet-400"
              />
            </div>
          ))}
        </div>
      </BaseNode>
    </div>
  );
}
