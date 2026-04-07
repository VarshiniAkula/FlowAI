'use client';

import { use } from 'react';
import { EditorShell } from '@/components/editor/editor-shell';
import { Simulator } from '@/components/simulator/simulator';

export default function TestPage({
  params,
}: {
  params: Promise<{ assistantId: string }>;
}) {
  const { assistantId } = use(params);

  return (
    <EditorShell assistantId={assistantId}>
      <Simulator assistantId={assistantId} />
    </EditorShell>
  );
}
