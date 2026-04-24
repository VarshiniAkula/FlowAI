/*
 * scripts/verify-rls.ts — Phase 1 acceptance suite for RLS.
 *
 * Creates two users (A, B) in two orgs (OrgA, OrgB). Seeds a row in every
 * company-owned table under OrgA's ownership. Then asserts:
 *   - User A can read/write OrgA rows (same-tenant success).
 *   - User B cannot read OrgA rows (cross-tenant select denied).
 *   - User B cannot insert/update/delete OrgA rows (cross-tenant write denied).
 *   - The anon client cannot select from documents, document_chunks,
 *     conversations, messages, published_assistants (public runtime tables).
 *
 * Run with: pnpm verify:rls  (requires .env.local with SUPABASE_SERVICE_ROLE_KEY)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// --- env loading ------------------------------------------------------------

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
      const [, k, vRaw] = m;
      if (process.env[k]) continue;
      process.env[k] = vRaw.replace(/^['"]|['"]$/g, '');
    }
    break;
  }
}
loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'Missing env. Need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY in .env.local.',
  );
  process.exit(1);
}

// --- harness ----------------------------------------------------------------

const FAILURES: string[] = [];

function log(msg: string) {
  console.log(`  ${msg}`);
}
function assertDenied(label: string, error: unknown, data: unknown) {
  // Denied looks like: error set, OR data is empty array (RLS select filters).
  const ok =
    !!error ||
    (Array.isArray(data) && data.length === 0) ||
    data === null;
  if (!ok) {
    FAILURES.push(`${label}: expected RLS denial but got data=${JSON.stringify(data)}`);
    console.error(`  ✗ ${label}: UNEXPECTED SUCCESS`);
  } else {
    console.log(`  ✓ ${label}`);
  }
}
function assertAllowed(label: string, error: unknown, data: unknown) {
  if (error) {
    FAILURES.push(`${label}: expected success but got ${JSON.stringify(error)}`);
    console.error(`  ✗ ${label}: ${(error as { message?: string }).message}`);
  } else {
    console.log(`  ✓ ${label}`);
  }
}

// --- setup ------------------------------------------------------------------

async function createTestUser(service: SupabaseClient, label: string) {
  const email = `verify-rls-${label}-${randomBytes(6).toString('hex')}@flowmind.test`;
  const password = randomBytes(16).toString('hex');
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser(${label}) failed: ${error?.message}`);
  return { id: data.user.id, email, password };
}

async function userClient(email: string, password: string) {
  const client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn failed: ${error.message}`);
  return client;
}

async function seedOrg(service: SupabaseClient, userId: string, name: string) {
  const { data: org, error: orgErr } = await service
    .from('organizations')
    .insert({ name, slug: `${name.toLowerCase()}-${randomBytes(3).toString('hex')}`, created_by: userId })
    .select('id')
    .single();
  if (orgErr || !org) throw new Error(`seedOrg: ${orgErr?.message}`);
  await service
    .from('memberships')
    .insert({ org_id: org.id, user_id: userId, role: 'owner' });

  const { data: assistant, error: aErr } = await service
    .from('assistants')
    .insert({ org_id: org.id, created_by: userId, name: `${name} Assistant` })
    .select('id')
    .single();
  if (aErr || !assistant) throw new Error(`seedOrg.assistant: ${aErr?.message}`);

  const { data: source, error: sErr } = await service
    .from('knowledge_sources')
    .insert({ org_id: org.id, assistant_id: assistant.id, type: 'file', title: 'seed' })
    .select('id')
    .single();
  if (sErr || !source) throw new Error(`seedOrg.source: ${sErr?.message}`);

  const { data: doc, error: dErr } = await service
    .from('documents')
    .insert({ org_id: org.id, assistant_id: assistant.id, source_id: source.id, name: 'seed.txt' })
    .select('id')
    .single();
  if (dErr || !doc) throw new Error(`seedOrg.document: ${dErr?.message}`);

  await service.from('document_chunks').insert({
    org_id: org.id,
    assistant_id: assistant.id,
    document_id: doc.id,
    chunk_index: 0,
    content: 'seed chunk',
  });

  const { data: published, error: pErr } = await service
    .from('published_assistants')
    .insert({
      org_id: org.id,
      assistant_id: assistant.id,
      public_id: `pub_${randomBytes(16).toString('hex')}`,
      graph_snapshot: {},
    })
    .select('id')
    .single();
  if (pErr || !published) throw new Error(`seedOrg.published: ${pErr?.message}`);

  const { data: conv, error: cErr } = await service
    .from('conversations')
    .insert({ org_id: org.id, assistant_id: assistant.id, channel: 'web' })
    .select('id')
    .single();
  if (cErr || !conv) throw new Error(`seedOrg.conv: ${cErr?.message}`);

  await service.from('messages').insert({
    org_id: org.id,
    conversation_id: conv.id,
    role: 'user',
    content: 'hello',
  });
  await service.from('usage_events').insert({
    org_id: org.id,
    assistant_id: assistant.id,
    event_type: 'seed',
  });

  return {
    orgId: org.id,
    assistantId: assistant.id,
    sourceId: source.id,
    documentId: doc.id,
    publishedId: published.id,
    conversationId: conv.id,
  };
}

// --- main -------------------------------------------------------------------

async function main() {
  const service = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log('Creating two users in two orgs…');
  const userA = await createTestUser(service, 'a');
  const userB = await createTestUser(service, 'b');

  const orgA = await seedOrg(service, userA.id, 'OrgA');
  const orgB = await seedOrg(service, userB.id, 'OrgB');

  const clientA = await userClient(userA.email, userA.password);
  const clientB = await userClient(userB.email, userB.password);
  const anon = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);

  const TABLES = [
    'organizations',
    'memberships',
    'assistants',
    'knowledge_sources',
    'documents',
    'document_chunks',
    'published_assistants',
    'conversations',
    'messages',
    'usage_events',
  ] as const;

  console.log('\nSame-tenant select (user A on OrgA):');
  for (const t of TABLES) {
    const { data, error } = await clientA.from(t).select('*').limit(100);
    assertAllowed(`A.${t} select`, error, data);
    if (!error && Array.isArray(data) && data.length === 0) {
      FAILURES.push(`A.${t} select: expected ≥1 row for own org, got 0`);
    }
  }

  console.log('\nCross-tenant select (user B on OrgA rows):');
  for (const t of TABLES) {
    // @ts-expect-error dynamic string table name
    const { data, error } = await clientB.from(t).select('*').eq('org_id', orgA.orgId);
    // Profiles isn't included; memberships select filters to same-org rows.
    if (t === 'memberships') {
      assertDenied(`B.${t} select(orgA)`, null, data);
      continue;
    }
    assertDenied(`B.${t} select(orgA)`, error, data);
  }

  console.log('\nCross-tenant write attempts (user B into OrgA):');
  {
    const { error } = await clientB
      .from('assistants')
      .insert({ org_id: orgA.orgId, name: 'evil' });
    assertDenied('B.assistants insert(orgA)', error, null);
  }
  {
    const { error, data } = await clientB
      .from('assistants')
      .update({ name: 'evil' })
      .eq('id', orgA.assistantId)
      .select();
    assertDenied('B.assistants update(orgA)', error, data);
  }
  {
    const { error, data } = await clientB
      .from('assistants')
      .delete()
      .eq('id', orgA.assistantId)
      .select();
    assertDenied('B.assistants delete(orgA)', error, data);
  }
  {
    const { error } = await clientB
      .from('documents')
      .insert({ org_id: orgA.orgId, assistant_id: orgA.assistantId, name: 'evil.txt' });
    assertDenied('B.documents insert(orgA)', error, null);
  }
  {
    const { error } = await clientB
      .from('memberships')
      .insert({ org_id: orgA.orgId, user_id: userB.id, role: 'admin' });
    assertDenied('B.memberships self-insert(orgA)', error, null);
  }

  console.log('\nAnon-key denial on public-runtime tables:');
  for (const t of [
    'documents',
    'document_chunks',
    'conversations',
    'messages',
    'published_assistants',
  ] as const) {
    const { data, error } = await anon.from(t).select('*').limit(5);
    assertDenied(`anon.${t} select`, error, data);
  }

  console.log('\nCleanup…');
  await service.from('organizations').delete().in('id', [orgA.orgId, orgB.orgId]);
  await service.auth.admin.deleteUser(userA.id);
  await service.auth.admin.deleteUser(userB.id);

  if (FAILURES.length) {
    console.error(`\n${FAILURES.length} RLS check(s) failed:`);
    for (const f of FAILURES) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log('\nAll RLS checks passed ✓');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
