'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import type { ConditionExpression, ConditionNodeData } from '@flowmind/shared';

interface Props {
  data: ConditionNodeData;
  onChange: (patch: Partial<ConditionNodeData>) => void;
}

const OPERATORS: Array<{ value: ConditionExpression['operator']; label: string }> = [
  { value: 'eq', label: '== equals' },
  { value: 'neq', label: '!= not equals' },
  { value: 'gt', label: '>  greater than' },
  { value: 'lt', label: '<  less than' },
  { value: 'gte', label: '>= greater or equal' },
  { value: 'lte', label: '<= less or equal' },
  { value: 'contains', label: 'contains' },
  { value: 'matches', label: 'matches regex' },
  { value: 'exists', label: 'exists' },
];

export function ConditionInspector({ data, onChange }: Props) {
  const expr = data.expression ?? {
    field: '',
    operator: 'exists',
    value: null,
  };

  const update = (patch: Partial<ConditionExpression>) => {
    onChange({ expression: { ...expr, ...patch } });
  };

  const showValueField = expr.operator !== 'exists';

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="cond-field">Variable</Label>
        <Input
          id="cond-field"
          value={expr.field}
          onChange={(e) => update({ field: e.target.value })}
          placeholder="user_intent"
          className="mt-1.5 font-mono text-xs"
        />
      </div>

      <div>
        <Label htmlFor="cond-op">Operator</Label>
        <select
          id="cond-op"
          value={expr.operator}
          onChange={(e) =>
            update({ operator: e.target.value as ConditionExpression['operator'] })
          }
          className="mt-1.5 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {OPERATORS.map((op) => (
            <option key={op.value} value={op.value}>
              {op.label}
            </option>
          ))}
        </select>
      </div>

      {showValueField && (
        <div>
          <Label htmlFor="cond-val">Value</Label>
          <Input
            id="cond-val"
            value={String(expr.value ?? '')}
            onChange={(e) => update({ value: e.target.value })}
            placeholder="expected value"
            className="mt-1.5 text-xs"
          />
        </div>
      )}

      <div className="rounded-md border border-dashed bg-muted/30 p-2.5">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Branches
        </p>
        <div className="mt-1.5 space-y-1 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-500" />
            <span className="font-medium text-emerald-600">true</span>
            <span className="text-muted-foreground">→ goes down "true" handle</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-rose-500" />
            <span className="font-medium text-rose-600">false</span>
            <span className="text-muted-foreground">→ goes down "false" handle</span>
          </div>
        </div>
      </div>
    </div>
  );
}
