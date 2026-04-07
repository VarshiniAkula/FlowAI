'use client';

import { use } from 'react';
import { EditorShell } from '@/components/editor/editor-shell';
import { AnalyticsPanel } from '@/components/analytics/analytics-panel';

export default function AnalyticsPage({
  params,
}: {
  params: Promise<{ assistantId: string }>;
}) {
  const { assistantId } = use(params);

  return (
    <EditorShell assistantId={assistantId}>
      <AnalyticsPanel assistantId={assistantId} />
    </EditorShell>
  );
}
