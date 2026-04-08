import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import type { Graph } from '@flowmind/shared';
import { getSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';

export const runtime = 'nodejs';

interface PublishBody {
  assistantId?: string;
  name?: string;
  description?: string;
  graph?: Graph;
}

const MAX_NAME_LEN = 200;
const MAX_DESCRIPTION_LEN = 2000;
const MAX_GRAPH_BYTES = 512 * 1024; // matches the DB CHECK constraint

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      {
        error:
          'Cloud publishing is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
      },
      { status: 503 },
    );
  }

  let body: PublishBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const assistantId = body.assistantId?.trim();
  const name = body.name?.trim();
  const description = body.description?.trim() || null;
  const graph = body.graph;

  if (!assistantId) {
    return NextResponse.json({ error: 'assistantId is required' }, { status: 400 });
  }
  if (!name || name.length > MAX_NAME_LEN) {
    return NextResponse.json(
      { error: `name is required and must be <= ${MAX_NAME_LEN} chars` },
      { status: 400 },
    );
  }
  if (description && description.length > MAX_DESCRIPTION_LEN) {
    return NextResponse.json(
      { error: `description must be <= ${MAX_DESCRIPTION_LEN} chars` },
      { status: 400 },
    );
  }
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    return NextResponse.json({ error: 'graph must include nodes and edges arrays' }, { status: 400 });
  }
  if (graph.nodes.length === 0) {
    return NextResponse.json(
      { error: 'graph must have at least one node before publishing' },
      { status: 400 },
    );
  }

  const graphJson = JSON.stringify(graph);
  if (Buffer.byteLength(graphJson, 'utf8') > MAX_GRAPH_BYTES) {
    return NextResponse.json(
      { error: `graph payload exceeds ${MAX_GRAPH_BYTES} bytes` },
      { status: 413 },
    );
  }

  const supabase = getSupabaseServerClient();

  // Look up the latest existing version for this assistant so we can bump it.
  const { data: existing, error: lookupErr } = await supabase
    .from('flowmind_published_assistants')
    .select('version')
    .eq('assistant_id', assistantId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lookupErr) {
    console.error('[api/publish] lookup error:', lookupErr);
    return NextResponse.json({ error: 'Failed to look up previous publishes' }, { status: 500 });
  }

  const nextVersion = (existing?.version ?? 0) + 1;
  const publishId = `pub_${nanoid(12)}`;

  const { error: insertErr } = await supabase
    .from('flowmind_published_assistants')
    .insert({
      id: publishId,
      assistant_id: assistantId,
      name,
      description,
      graph,
      version: nextVersion,
    });

  if (insertErr) {
    console.error('[api/publish] insert error:', insertErr);
    return NextResponse.json(
      { error: 'Failed to publish', details: insertErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    publishId,
    version: nextVersion,
  });
}
