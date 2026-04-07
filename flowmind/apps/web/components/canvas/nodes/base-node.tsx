'use client';

import { Handle, Position } from '@xyflow/react';
import { cn } from '@/lib/utils';
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
import { useGraphStore } from '@/stores/graph-store';

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

const GRADIENTS: Record<NodeType, string> = {
  message: 'from-blue-500 to-blue-600',
  input: 'from-emerald-500 to-emerald-600',
  choice: 'from-violet-500 to-violet-600',
  condition: 'from-amber-500 to-orange-600',
  rag_query: 'from-cyan-500 to-cyan-600',
  llm_response: 'from-rose-500 to-pink-600',
  http_action: 'from-slate-500 to-slate-600',
  transform: 'from-indigo-500 to-indigo-600',
  validator: 'from-yellow-500 to-yellow-600',
  human_handoff: 'from-fuchsia-500 to-fuchsia-600',
  loop: 'from-teal-500 to-teal-600',
  subflow: 'from-purple-500 to-purple-600',
  end: 'from-gray-500 to-gray-700',
};

interface BaseNodeProps {
  id: string;
  type: NodeType;
  label: string;
  selected?: boolean;
  showSourceHandle?: boolean;
  showTargetHandle?: boolean;
  children?: React.ReactNode;
}

export function BaseNode({
  id,
  type,
  label,
  selected,
  showSourceHandle = true,
  showTargetHandle = true,
  children,
}: BaseNodeProps) {
  const Icon = ICONS[type];
  const gradient = GRADIENTS[type];
  const activeNodeId = useGraphStore((s) => s.activeNodeId);
  const isActive = activeNodeId === id;

  return (
    <div
      className={cn(
        'min-w-[220px] rounded-xl border bg-zinc-900/95 text-white shadow-xl transition-all',
        'border-zinc-700/60 backdrop-blur',
        selected && 'border-violet-400 ring-2 ring-violet-400/40',
        isActive && 'node-active border-blue-400',
      )}
    >
      {showTargetHandle && (
        <Handle
          type="target"
          position={Position.Top}
          className="!h-2.5 !w-2.5 !border-2 !border-zinc-900 !bg-zinc-400"
        />
      )}

      {/* Header */}
      <div
        className={cn(
          'flex items-center gap-2 rounded-t-xl bg-gradient-to-r px-3 py-2',
          gradient,
        )}
      >
        <Icon className="size-4" />
        <span className="text-xs font-semibold uppercase tracking-wider">
          {label}
        </span>
      </div>

      {/* Body */}
      {children && (
        <div className="space-y-1 px-3 py-2.5 text-xs text-zinc-300">
          {children}
        </div>
      )}

      <div className="px-3 pb-2 text-[10px] font-mono text-zinc-500">{id}</div>

      {showSourceHandle && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!h-2.5 !w-2.5 !border-2 !border-zinc-900 !bg-zinc-400"
        />
      )}
    </div>
  );
}
