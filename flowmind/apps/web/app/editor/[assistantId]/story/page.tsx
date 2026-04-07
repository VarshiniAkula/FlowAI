'use client';

import { use } from 'react';
import { EditorShell } from '@/components/editor/editor-shell';
import { StoryBuilder } from '@/components/story/story-builder';

export default function StoryPage({
  params,
}: {
  params: Promise<{ assistantId: string }>;
}) {
  const { assistantId } = use(params);

  return (
    <EditorShell assistantId={assistantId}>
      <StoryBuilder assistantId={assistantId} />
    </EditorShell>
  );
}
