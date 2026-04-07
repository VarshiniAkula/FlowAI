'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { BaseNode } from './base-node';
import type { ConditionNodeData } from '@flowmind/shared';

export function ConditionNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as ConditionNodeData & { label: string };
  const expr = d.expression;
  const summary = expr
    ? `${expr.field} ${expr.operator} ${
        expr.value === null || expr.value === undefined ? '∅' : String(expr.value)
      }`
    : '(no condition)';

  return (
    <div className="relative">
      <BaseNode
        id={id}
        type="condition"
        label={d.label || 'Condition'}
        selected={selected}
        showSourceHandle={false}
      >
        <code className="block rounded bg-amber-500/10 px-2 py-1 font-mono text-[11px] text-amber-200">
          {summary}
        </code>
        <div className="mt-2 flex items-center justify-between text-[10px]">
          <span className="text-emerald-400">true ↓</span>
          <span className="text-rose-400">false ↓</span>
        </div>
      </BaseNode>
      <Handle
        type="source"
        position={Position.Bottom}
        id="true"
        style={{ left: '25%' }}
        className="!h-2.5 !w-2.5 !border-2 !border-zinc-900 !bg-emerald-400"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="false"
        style={{ left: '75%' }}
        className="!h-2.5 !w-2.5 !border-2 !border-zinc-900 !bg-rose-400"
      />
    </div>
  );
}
