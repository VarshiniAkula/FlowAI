'use client';

import { use } from 'react';
import { EditorShell } from '@/components/editor/editor-shell';
import { KnowledgeManager } from '@/components/knowledge/knowledge-manager';

export default function KnowledgePage({
  params,
}: {
  params: Promise<{ assistantId: string }>;
}) {
  const { assistantId } = use(params);

  return (
    <EditorShell assistantId={assistantId}>
      <KnowledgeManager assistantId={assistantId} />
    </EditorShell>
  );
}
