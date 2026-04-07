'use client';

import { use } from 'react';
import { EditorShell } from '@/components/editor/editor-shell';
import { DeployPanel } from '@/components/deploy/deploy-panel';

export default function DeployPage({
  params,
}: {
  params: Promise<{ assistantId: string }>;
}) {
  const { assistantId } = use(params);

  return (
    <EditorShell assistantId={assistantId}>
      <DeployPanel assistantId={assistantId} />
    </EditorShell>
  );
}
