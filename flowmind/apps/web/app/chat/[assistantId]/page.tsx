import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { HostedChatClient } from './chat-client';

interface RouteParams {
  params: Promise<{ assistantId: string }>;
}

/**
 * Server-side metadata for hosted chats. For cloud-published assistants
 * (`pub_*` ids) we hit Supabase to get the real assistant name + description
 * so social previews and tab titles match the bot the visitor is about to
 * talk to. Local-only ids fall back to a generic title since we can't read
 * client-side localStorage from the server.
 */
export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { assistantId } = await params;
  const fallback: Metadata = {
    title: 'Chat',
    description: 'Powered by FlowMind - visual AI assistant builder.',
    robots: { index: false, follow: false },
  };

  if (!assistantId.startsWith('pub_') || !isSupabaseConfigured()) {
    return fallback;
  }

  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from('flowmind_published_assistants')
      .select('name, description')
      .eq('id', assistantId)
      .maybeSingle();

    if (error || !data) return fallback;

    const description =
      data.description ?? `Chat with ${data.name}, built on FlowMind.`;
    return {
      title: data.name,
      description,
      openGraph: {
        type: 'website',
        title: data.name,
        description,
        siteName: 'FlowMind',
      },
      twitter: {
        card: 'summary',
        title: data.name,
        description,
      },
      // Hosted chats are intentionally noindexed: they're product surfaces,
      // not content pages, and we don't want SERP noise from every publish.
      robots: { index: false, follow: false },
    };
  } catch {
    return fallback;
  }
}

export default async function HostedChatPage({ params }: RouteParams) {
  const { assistantId } = await params;
  return (
    <Suspense fallback={null}>
      <HostedChatClient assistantId={assistantId} />
    </Suspense>
  );
}
