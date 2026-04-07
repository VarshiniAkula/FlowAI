import { redirect } from 'next/navigation';

export default async function EditorRootPage({
  params,
}: {
  params: Promise<{ assistantId: string }>;
}) {
  const { assistantId } = await params;
  redirect(`/editor/${assistantId}/canvas`);
}
