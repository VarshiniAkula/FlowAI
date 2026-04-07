'use client';

import { use } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { EditorShell } from '@/components/editor/editor-shell';
import { FlowCanvas } from '@/components/canvas/flow-canvas';
import { NodePalette } from '@/components/canvas/node-palette';
import { NodeInspector } from '@/components/inspector/node-inspector';

export default function CanvasPage({
  params,
}: {
  params: Promise<{ assistantId: string }>;
}) {
  const { assistantId } = use(params);

  return (
    <ReactFlowProvider>
      <EditorShell
        assistantId={assistantId}
        leftPanel={<NodePalette />}
        rightPanel={<NodeInspector />}
      >
        <FlowCanvas />
      </EditorShell>
    </ReactFlowProvider>
  );
}
