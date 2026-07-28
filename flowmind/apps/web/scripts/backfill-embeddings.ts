/*
 * scripts/backfill-embeddings.ts
 *
 * One-off maintenance: embed any document_chunks that were ingested before
 * embeddings existed (embedding IS NULL). New ingests already embed inline, so
 * this only needs to run once after enabling vector retrieval.
 *
 * Uses the platform GEMINI_API_KEY (RETRIEVAL_DOCUMENT, gemini-embedding-001 at
 * 768 dims) and the service role to update rows. Self-contained — it does not
 * import the app's `server-only` modules so it can run under tsx.
 *
 * Run:  pnpm --filter @flowmind/web backfill:embeddings
 *       (requires .env.local with SUPABASE_SERVICE_ROLE_KEY + GEMINI_API_KEY)
 */

import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function loadEnvLocal() {
  const paths = [
    join(process.cwd(), '.env.local'),
    join(process.cwd(), 'flowmind/apps/web/.env.local'),
    join(__dirname, '..', '.env.local'),
  ];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (!m) continue;
      const k = m[1];
      if (!k || process.env[k]) continue;
      process.env[k] = (m[2] ?? '').replace(/^['"]|['"]$/g, '');
    }
    break;
  }
}
loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local.');
  process.exit(1);
}
if (!GEMINI_API_KEY) {
  console.error('Missing GEMINI_API_KEY — embeddings need a Gemini key to backfill.');
  process.exit(1);
}

const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIMS = 768;
const BATCH = 100;

function normalize(v: number[]): number[] {
  let s = 0;
  for (const x of v) s += x * x;
  const n = Math.sqrt(s);
  return n === 0 ? v : v.map((x) => x / n);
}
const toPgVector = (v: number[]) => `[${v.join(',')}]`;

async function main() {
  const db = createClient(SUPABASE_URL!, SERVICE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  const { data, error } = await db
    .from('document_chunks')
    .select('id, content')
    .is('embedding', null)
    .limit(10_000);
  if (error) throw error;

  const rows = data ?? [];
  if (rows.length === 0) {
    console.log('Nothing to backfill — every chunk already has an embedding.');
    return;
  }
  console.log(`Backfilling ${rows.length} chunk(s)…`);

  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const res = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: batch.map((r) => r.content),
      config: { taskType: 'RETRIEVAL_DOCUMENT', outputDimensionality: EMBEDDING_DIMS },
    });
    const embeddings = res.embeddings ?? [];
    for (let j = 0; j < batch.length; j++) {
      const vec = embeddings[j]?.values;
      if (!vec) continue;
      const { error: upErr } = await db
        .from('document_chunks')
        .update({ embedding: toPgVector(normalize(vec)) })
        .eq('id', batch[j]!.id);
      if (upErr) console.error(`  update failed for ${batch[j]!.id}: ${upErr.message}`);
      else done++;
    }
    console.log(`  ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }
  console.log(`Done — embedded ${done}/${rows.length} chunk(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
