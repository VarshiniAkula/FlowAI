import { NextResponse } from 'next/server';
import { generateGraphFromStory } from '@/lib/graph-generator';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: { story?: string };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const story = body.story?.trim();
  if (!story) {
    return NextResponse.json(
      { error: 'Missing required field: story' },
      { status: 400 },
    );
  }
  if (story.length > 4000) {
    return NextResponse.json(
      { error: 'Story is too long (max 4000 characters)' },
      { status: 400 },
    );
  }

  try {
    const result = await generateGraphFromStory(story);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[api/generate-graph] error:', err);
    return NextResponse.json(
      { error: 'Failed to generate graph', details: String(err) },
      { status: 500 },
    );
  }
}
