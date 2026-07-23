import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import { GuardError, requireAssistantAccess } from '@/lib/auth/guards';
import { chunkText } from '@/lib/knowledge/chunker';
import { extractText, isSupportedFile, SUPPORTED_EXTENSIONS } from '@/lib/knowledge/extract';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';

const BUCKET = 'knowledge-files';
const MAX_BYTES = 4 * 1024 * 1024; // 4 MB

/**
 * POST /api/knowledge/ingest  (multipart: file, assistantId)
 *
 * Stores the raw file in the private Supabase Storage bucket, parses its text
 * server-side, chunks it, and writes `documents` + `document_chunks` rows —
 * all scoped to the caller's org. The caller's access is verified first, then
 * the service role performs the writes (org_id/assistant_id resolved
 * server-side, never trusted from input).
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData().catch(() => null);
    if (!form) throw new GuardError('NOT_FOUND', 'Expected multipart form-data.');

    const file = form.get('file');
    const assistantId = String(form.get('assistantId') ?? '');
    if (!(file instanceof File)) {
      return errJson('NOT_FOUND', 'Missing "file".', 400);
    }
    if (!assistantId) {
      return errJson('NOT_FOUND', 'Missing "assistantId".', 400);
    }

    // Verify the caller owns the assistant; resolve its org server-side.
    const { orgId } = await requireAssistantAccess(assistantId, 'member');

    if (file.size > MAX_BYTES) {
      return errJson('FILE_TOO_LARGE', `File too large. Max ${MAX_BYTES / 1024 / 1024} MB.`, 413);
    }
    if (!isSupportedFile(file.name)) {
      return errJson(
        'UNSUPPORTED_FILE_TYPE',
        `Unsupported type. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}.`,
        415,
      );
    }

    const service = createSupabaseServiceClient();
    const documentId = randomUUID();
    const safeName = file.name.replace(/[^\w.\-]+/g, '_').slice(0, 120) || 'file';
    const storagePath = `orgs/${orgId}/assistants/${assistantId}/documents/${documentId}/${safeName}`;

    const bytes = new Uint8Array(await file.arrayBuffer());

    // 1) Store the original file privately.
    const up = await service.storage
      .from(BUCKET)
      .upload(storagePath, bytes, { contentType: file.type || 'text/plain', upsert: true });
    if (up.error) {
      console.error('[knowledge/ingest] storage upload failed', up.error.message);
      return errJson('EXTRACTION_FAILED', 'Could not store the file.', 500);
    }

    // 2) Parse + chunk.
    const text = extractText(bytes, file.name);
    const chunks = text ? chunkText(text) : [];

    // 3) Persist the document row.
    const { error: docErr } = await service.from('documents').insert({
      id: documentId,
      org_id: orgId,
      assistant_id: assistantId,
      storage_path: storagePath,
      name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      status: chunks.length > 0 ? 'ready' : 'failed',
      error: chunks.length > 0 ? null : 'No text extracted',
      metadata: { chars: text.length },
    });
    if (docErr) {
      console.error('[knowledge/ingest] document insert failed', docErr.message);
      await service.storage.from(BUCKET).remove([storagePath]);
      return errJson('EXTRACTION_FAILED', 'Could not save the document.', 500);
    }

    // 4) Persist chunks.
    if (chunks.length > 0) {
      const rows = chunks.map((c) => ({
        org_id: orgId,
        assistant_id: assistantId,
        document_id: documentId,
        chunk_index: c.index,
        content: c.text,
        token_count: Math.ceil(c.text.length / 4),
        metadata: {},
      }));
      const { error: chunkErr } = await service.from('document_chunks').insert(rows);
      if (chunkErr) {
        console.error('[knowledge/ingest] chunk insert failed', chunkErr.message);
        // Roll back so no half-ingested document lingers.
        await service.from('documents').delete().eq('id', documentId);
        await service.storage.from(BUCKET).remove([storagePath]);
        return errJson('EXTRACTION_FAILED', 'Could not index the document.', 500);
      }
    }

    return NextResponse.json({
      document: {
        id: documentId,
        name: file.name,
        status: chunks.length > 0 ? 'ready' : 'failed',
        chunkCount: chunks.length,
        sizeBytes: file.size,
        createdAt: Date.now(),
      },
    });
  } catch (err) {
    if (err instanceof GuardError) {
      return errJson(err.code, err.message, err.status);
    }
    console.error('[knowledge/ingest] error', err);
    return errJson('EXTRACTION_FAILED', 'Ingestion failed.', 500);
  }
}

function errJson(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}
