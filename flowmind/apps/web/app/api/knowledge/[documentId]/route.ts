import { NextResponse } from 'next/server';

import { GuardError, requireAssistantAccess } from '@/lib/auth/guards';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';

const BUCKET = 'knowledge-files';

/**
 * DELETE /api/knowledge/[documentId]
 * Removes the document's chunks (via FK cascade), its row, and the stored file.
 * Verifies the caller owns the assistant the document belongs to.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  try {
    const { documentId } = await params;
    const service = createSupabaseServiceClient();

    const { data: doc, error } = await service
      .from('documents')
      .select('id, assistant_id, storage_path')
      .eq('id', documentId)
      .maybeSingle();
    if (error || !doc) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Document not found.' } }, { status: 404 });
    }

    // Authorize against the owning assistant's org.
    await requireAssistantAccess(doc.assistant_id, 'member');

    if (doc.storage_path) {
      await service.storage.from(BUCKET).remove([doc.storage_path]);
    }
    // Deleting the document cascades to document_chunks.
    await service.from('documents').delete().eq('id', documentId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof GuardError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
    }
    console.error('[knowledge/delete] error', err);
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Delete failed.' } }, { status: 500 });
  }
}
