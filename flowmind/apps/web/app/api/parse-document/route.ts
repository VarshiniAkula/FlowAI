import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB

/**
 * Server-side document text extraction.
 *
 * Phase 1 supports plain text and markdown directly. PDF/DOCX support arrives
 * with the full Phase 2 ingestion pipeline; for now we accept any *.txt /
 * *.md / *.csv / *.html and strip HTML tags.
 */
export async function POST(req: Request) {
  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: 'Expected multipart form-data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing "file" field' }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 4 MB.` },
      { status: 413 },
    );
  }

  const name = file.name || 'untitled';
  const lower = name.toLowerCase();
  const allowed = ['.txt', '.md', '.markdown', '.csv', '.html', '.htm'];
  if (!allowed.some((ext) => lower.endsWith(ext))) {
    return NextResponse.json(
      {
        error: `Unsupported file type. Phase 1 supports: ${allowed.join(', ')}. PDF/DOCX coming in Phase 2.`,
      },
      { status: 415 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  let text = buf.toString('utf-8');

  if (lower.endsWith('.html') || lower.endsWith('.htm')) {
    text = stripHtml(text);
  }

  // Normalize whitespace a bit so chunking is cleaner.
  text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

  return NextResponse.json({
    name,
    bytes: file.size,
    chars: text.length,
    text,
  });
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}
