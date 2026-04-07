'use client';

import {
  MessageCircle,
  TextCursorInput,
  GitBranch,
  GitCompareArrows,
  Database,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import type { NodeType } from '@flowmind/shared';
import { CORE_NODE_TYPES, NODE_LABELS, NODE_DESCRIPTIONS } from '@flowmind/shared';

const ICONS: Record<NodeType, LucideIcon> = {
  message: MessageCircle,
  input: TextCursorInput,
  choice: GitBranch,
  condition: GitCompareArrows,
  rag_query: Database,
  llm_response: Sparkles,
  http_action: MessageCircle,
  transform: MessageCircle,
  validator: MessageCircle,
  human_handoff: MessageCircle,
  loop: MessageCircle,
  subflow: MessageCircle,
  end: MessageCircle,
};

const COLORS: Record<NodeType, string> = {
  message: 'text-blue-600 bg-blue-50',
  input: 'text-emerald-600 bg-emerald-50',
  choice: 'text-violet-600 bg-violet-50',
  condition: 'text-amber-600 bg-amber-50',
  rag_query: 'text-cyan-600 bg-cyan-50',
  llm_response: 'text-rose-600 bg-rose-50',
  http_action: 'text-slate-600 bg-slate-50',
  transform: 'text-indigo-600 bg-indigo-50',
  validator: 'text-yellow-600 bg-yellow-50',
  human_handoff: 'text-fuchsia-600 bg-fuchsia-50',
  loop: 'text-teal-600 bg-teal-50',
  subflow: 'text-purple-600 bg-purple-50',
  end: 'text-gray-600 bg-gray-50',
};

export function NodePalette() {
  const onDragStart = (e: React.DragEvent, type: NodeType) => {
    e.dataTransfer.setData('application/flowmind-node-type', type);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-3 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Nodes
        </h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Drag onto canvas
        </p>
      </div>
      <div className="flex-1 space-y-1.5 overflow-y-auto p-3">
        {CORE_NODE_TYPES.map((type) => {
          const Icon = ICONS[type];
          return (
            <div
              key={type}
              draggable
              onDragStart={(e) => onDragStart(e, type)}
              className="group flex cursor-grab items-start gap-2.5 rounded-lg border bg-card p-2.5 transition-all hover:border-violet-300 hover:bg-accent active:cursor-grabbing"
            >
              <div
                className={`flex size-7 shrink-0 items-center justify-center rounded ${COLORS[type]}`}
              >
                <Icon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium leading-tight">
                  {NODE_LABELS[type]}
                </div>
                <p className="mt-0.5 line-clamp-2 text-[10px] leading-tight text-muted-foreground">
                  {NODE_DESCRIPTIONS[type]}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
