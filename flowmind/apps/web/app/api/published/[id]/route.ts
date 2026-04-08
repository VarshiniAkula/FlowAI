import { NextResponse } from 'next/server';
import { getSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'cloud hosting not configured' }, { status: 503 });
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('flowmind_published_assistants')
    .select('id, assistant_id, name, description, graph, version, published_at')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[api/published] fetch error:', error);
    return NextResponse.json({ error: 'failed to fetch published assistant' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  return NextResponse.json(
    {
      id: data.id,
      assistantId: data.assistant_id,
      name: data.name,
      description: data.description,
      graph: data.graph,
      version: data.version,
      publishedAt: data.published_at,
    },
    {
      headers: {
        // Cache published graphs aggressively at the edge - they're immutable
        // by design (each publish creates a new id).
        'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400',
      },
    },
  );
}
