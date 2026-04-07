'use client';

import { use } from 'react';
import { useSearchParams } from 'next/navigation';
import { HostedChat } from '@/components/chat/hosted-chat';

export default function HostedChatPage({
  params,
}: {
  params: Promise<{ assistantId: string }>;
}) {
  const { assistantId } = use(params);
  const searchParams = useSearchParams();
  const embed = searchParams.get('embed') === '1';

  return (
    <div className="h-screen w-full">
      <HostedChat assistantId={assistantId} embed={embed} />
    </div>
  );
}
