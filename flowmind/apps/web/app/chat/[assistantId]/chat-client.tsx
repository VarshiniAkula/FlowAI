'use client';

import { useSearchParams } from 'next/navigation';
import { HostedChat } from '@/components/chat/hosted-chat';

export function HostedChatClient({ assistantId }: { assistantId: string }) {
  const searchParams = useSearchParams();
  const embed = searchParams.get('embed') === '1';

  return (
    <div className="h-screen w-full">
      <HostedChat assistantId={assistantId} embed={embed} />
    </div>
  );
}
