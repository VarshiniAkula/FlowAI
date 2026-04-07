'use client';

import { Plus, X } from 'lucide-react';
import { nanoid } from 'nanoid';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import type { ChoiceNodeData, ChoiceOption } from '@flowmind/shared';

interface Props {
  data: ChoiceNodeData;
  onChange: (patch: Partial<ChoiceNodeData>) => void;
}

export function ChoiceInspector({ data, onChange }: Props) {
  const options = data.options ?? [];

  const updateOption = (id: string, patch: Partial<ChoiceOption>) => {
    onChange({
      options: options.map((opt) => (opt.id === id ? { ...opt, ...patch } : opt)),
    });
  };

  const addOption = () => {
    onChange({
      options: [
        ...options,
        { id: nanoid(6), label: `Option ${options.length + 1}`, value: `opt_${options.length + 1}` },
      ],
    });
  };

  const removeOption = (id: string) => {
    onChange({ options: options.filter((opt) => opt.id !== id) });
  };

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="choice-prompt">Prompt</Label>
        <Textarea
          id="choice-prompt"
          value={data.prompt ?? ''}
          rows={2}
          onChange={(e) => onChange({ prompt: e.target.value })}
          placeholder="What would you like to do?"
          className="mt-1.5 text-sm"
        />
      </div>

      <div>
        <Label htmlFor="choice-var">Save selection to</Label>
        <Input
          id="choice-var"
          value={data.variableName ?? ''}
          onChange={(e) =>
            onChange({
              variableName: e.target.value.replace(/[^a-zA-Z0-9_]/g, ''),
            })
          }
          className="mt-1.5 font-mono text-xs"
        />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Label>Options</Label>
          <Button size="sm" variant="ghost" onClick={addOption} className="h-7 px-2">
            <Plus className="size-3" />
            Add
          </Button>
        </div>
        <div className="mt-1.5 space-y-2">
          {options.map((opt, i) => (
            <div
              key={opt.id}
              className="rounded-md border bg-card p-2"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono text-muted-foreground w-4">
                  {i + 1}
                </span>
                <Input
                  value={opt.label}
                  onChange={(e) => updateOption(opt.id, { label: e.target.value })}
                  placeholder="Label"
                  className="h-7 text-xs"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => removeOption(opt.id)}
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-rose-600"
                  disabled={options.length <= 1}
                >
                  <X className="size-3" />
                </Button>
              </div>
              <Input
                value={opt.value}
                onChange={(e) =>
                  updateOption(opt.id, {
                    value: e.target.value.replace(/[^a-zA-Z0-9_]/g, ''),
                  })
                }
                placeholder="value"
                className="mt-1.5 h-6 font-mono text-[10px]"
              />
            </div>
          ))}
          {options.length === 0 && (
            <p className="text-[10px] text-muted-foreground">
              No options yet. Add at least one.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
