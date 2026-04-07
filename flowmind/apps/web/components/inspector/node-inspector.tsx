'use client';

import { useMemo } from 'react';
import { Trash2, Settings2, Sparkles } from 'lucide-react';
import { useGraphStore } from '@/stores/graph-store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { NODE_LABELS } from '@flowmind/shared';
import { MessageInspector } from './forms/message-inspector';
import { InputInspector } from './forms/input-inspector';
import { ChoiceInspector } from './forms/choice-inspector';
import { ConditionInspector } from './forms/condition-inspector';
import { RagQueryInspector } from './forms/rag-query-inspector';
import { LlmResponseInspector } from './forms/llm-response-inspector';

export function NodeInspector() {
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const nodes = useGraphStore((s) => s.nodes);
  const updateNodeData = useGraphStore((s) => s.updateNodeData);
  const updateNodeLabel = useGraphStore((s) => s.updateNodeLabel);
  const deleteNode = useGraphStore((s) => s.deleteNode);

  const node = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  if (!node) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
          <Settings2 className="size-5 text-muted-foreground" />
        </div>
        <p className="mt-3 text-sm font-medium">No node selected</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Click any node on the canvas to edit its properties.
        </p>
      </div>
    );
  }

  const renderForm = () => {
    switch (node.type) {
      case 'message':
        return (
          <MessageInspector
            data={node.data as any}
            onChange={(patch) => updateNodeData(node.id, patch)}
          />
        );
      case 'input':
        return (
          <InputInspector
            data={node.data as any}
            onChange={(patch) => updateNodeData(node.id, patch)}
          />
        );
      case 'choice':
        return (
          <ChoiceInspector
            data={node.data as any}
            onChange={(patch) => updateNodeData(node.id, patch)}
          />
        );
      case 'condition':
        return (
          <ConditionInspector
            data={node.data as any}
            onChange={(patch) => updateNodeData(node.id, patch)}
          />
        );
      case 'rag_query':
        return (
          <RagQueryInspector
            data={node.data as any}
            onChange={(patch) => updateNodeData(node.id, patch)}
          />
        );
      case 'llm_response':
        return (
          <LlmResponseInspector
            data={node.data as any}
            onChange={(patch) => updateNodeData(node.id, patch)}
          />
        );
      default:
        return (
          <p className="text-xs text-muted-foreground">
            No editor available for this node type.
          </p>
        );
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Sparkles className="size-3.5 text-violet-500" />
            <Badge variant="info" className="text-[10px]">
              {NODE_LABELS[node.type]}
            </Badge>
          </div>
          <input
            value={node.label}
            onChange={(e) => updateNodeLabel(node.id, e.target.value)}
            className="mt-1.5 w-full bg-transparent text-sm font-semibold outline-none focus:bg-accent/50 focus:px-1 focus:py-0.5 focus:rounded"
          />
          <p className="font-mono text-[10px] text-muted-foreground">
            id: {node.id}
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => deleteNode(node.id)}
          className="h-7 w-7 text-rose-500 hover:bg-rose-50 hover:text-rose-600"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-4 py-3">{renderForm()}</div>

      <Separator />

      {/* Footer hint */}
      <div className="px-4 py-2 text-[10px] text-muted-foreground">
        Use{' '}
        <code className="rounded bg-muted px-1 py-0.5 font-mono">
          {'{{variable}}'}
        </code>{' '}
        to interpolate context vars.
      </div>
    </div>
  );
}
