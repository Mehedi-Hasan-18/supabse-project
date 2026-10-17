#!/usr/bin/env node
/**
 * Two-user RLS proof for `public.notes`.
 *
 * It signs in as two different users (A and B) and asserts that B can never
 * read, update, delete, or hijack A's row. Everything is done through the
 * public dataset/anon key plus per-user sessions — i.e. exactly what a browser
 * would have — so a PASS here means the RLS policies genuinely hold.
 *
 * Required environment (read at run time, never stored in the repo):
 *   SUPABASE_URL              https://<ref>.supabase.co   (falls back to VITE_SUPABASE_URL)
 *   SUPABASE_ANON_KEY         the public publishable/anon key (falls back to
 *                             VITE_SUPABASE_ANON_KEY)
 *   SUPABASE_SERVICE_ROLE_KEY service_role key — ONLY used to provision the two
 *                             throwaway test users, never for the checks
 *
 * Handy shortcut: the URL and anon key already live in `.env.local`, so just add
 * `SUPABASE_SERVICE_ROLE_KEY=...` there and run:
 *   node --env-file=.env.local scripts/rls-test.mjs
 *
 * Optional (defaults shown):
 *   TEST_A_EMAIL=test-a@example.com   TEST_A_PASSWORD=password-a
 *   TEST_B_EMAIL=test-b@example.com   TEST_B_PASSWORD=password-b
 *
 * Usage:  SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
 *         npm run test:rls
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const A_EMAIL = process.env.TEST_A_EMAIL ?? 'test-a@example.com'
const A_PASSWORD = process.env.TEST_A_PASSWORD ?? 'password-a'
const B_EMAIL = process.env.TEST_B_EMAIL ?? 'test-b@example.com'
const B_PASSWORD = process.env.TEST_B_PASSWORD ?? 'password-b'

if (!url || !anonKey) {
  console.error('Missing SUPABASE_URL and/or SUPABASE_ANON_KEY.')
  process.exit(2)
}
if (!serviceKey) {
  console.error(
    'Missing SUPABASE_SERVICE_ROLE_KEY. It is used only to create the two test users.',
  )
  process.exit(2)
}

// --- helpers ---------------------------------------------------------------

/** Fresh client with its own in-memory session store. */
const anonClient = () =>
  createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

const results = []
function check(name, pass, detail) {
  results.push({ name, pass, detail })
  const tag = pass ? 'PASS' : 'FAIL'
  console.log(`  [${tag}] ${name}${detail ? ` — ${detail}` : ''}`)
}

async function ensureUser(admin, email, password) {
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (!error) return

  // Probably already exists — find it and reset the password so we can sign in.
  const { data, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })
  if (listError) throw listError

  const existing = data.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  )
  if (!existing) throw error

  const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
  })
  if (updateError) throw updateError
}

async function signIn(client, email, password) {
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`)
  return data.user
}

// --- run -------------------------------------------------------------------

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

console.log(`\nProvisioning test users against ${url}`)
await ensureUser(admin, A_EMAIL, A_PASSWORD)
await ensureUser(admin, B_EMAIL, B_PASSWORD)

const clientA = anonClient()
const clientB = anonClient()
const userA = await signIn(clientA, A_EMAIL, A_PASSWORD)
const userB = await signIn(clientB, B_EMAIL, B_PASSWORD)

console.log(`\nUser A: ${A_EMAIL} (${userA.id})`)
console.log(`User B: ${B_EMAIL} (${userB.id})\n`)

// Clean slate for A.
await clientA.from('notes').delete().eq('user_id', userA.id)

console.log('Checks')

// 1. A can create their own note.
const { data: aNote, error: aInsertError } = await clientA
  .from('notes')
  .insert({ title: 'A private note', body: 'owned by A' })
  .select()
  .single()

check(
  'A can insert a note',
  !aInsertError && aNote?.user_id === userA.id,
  aInsertError?.message ?? `id=${aNote?.id}`,
)
if (!aNote) {
  console.error('\nCannot continue without note A. Aborting.')
  process.exit(1)
}
const noteId = aNote.id

// 2. B's list does not contain A's row.
const { data: bList, error: bListError } = await clientB.from('notes').select('*')
check(
  'B select(*) returns none of A\'s rows',
  !bListError && (bList ?? []).every((n) => n.user_id === userB.id),
  bListError?.message ?? `${bList?.length ?? 0} row(s) visible to B`,
)

// 3. B cannot read A's specific row even knowing its id.
const { data: bRead, error: bReadError } = await clientB
  .from('notes')
  .select('*')
  .eq('id', noteId)
check(
  'B cannot read A\'s row by id',
  !bReadError && (bRead?.length ?? 0) === 0,
  bReadError?.message ?? `${bRead?.length ?? 0} row(s) returned`,
)

// 4. B cannot update A's row.
const { data: bUpdate, error: bUpdateError } = await clientB
  .from('notes')
  .update({ title: 'hijacked by B' })
  .eq('id', noteId)
  .select()
check(
  'B cannot update A\'s row',
  !bUpdateError && (bUpdate?.length ?? 0) === 0,
  bUpdateError?.message ?? `${bUpdate?.length ?? 0} row(s) changed`,
)

// 5. B cannot delete A's row.
const { data: bDelete, error: bDeleteError } = await clientB
  .from('notes')
  .delete()
  .eq('id', noteId)
  .select()
check(
  'B cannot delete A\'s row',
  !bDeleteError && (bDelete?.length ?? 0) === 0,
  bDeleteError?.message ?? `${bDelete?.length ?? 0} row(s) deleted`,
)

// 6. B cannot insert a row pretending to be A.
const { data: bSpoof, error: bSpoofError } = await clientB
  .from('notes')
  .insert({ title: 'spoofed', user_id: userA.id })
  .select()
check(
  'B cannot insert a row owned by A',
  Boolean(bSpoofError) && (bSpoof?.length ?? 0) === 0,
  bSpoofError ? `blocked: ${bSpoofError.code ?? bSpoofError.message}` : 'NOT blocked',
)

// 7. A's row survived all of B's attempts, unchanged.
const { data: aVerify, error: aVerifyError } = await clientA
  .from('notes')
  .select('*')
  .eq('id', noteId)
check(
  'A\'s row is intact after B\'s attempts',
  !aVerifyError && aVerify?.[0]?.title === 'A private note',
  aVerifyError?.message ?? `title="${aVerify?.[0]?.title}"`,
)

// 8. A can still update and delete their own row.
const { data: aUpdate } = await clientA
  .from('notes')
  .update({ title: 'A edited own note' })
  .eq('id', noteId)
  .select()
check('A can update own row', (aUpdate?.length ?? 0) === 1, `${aUpdate?.length ?? 0} row(s)`)

const { data: aDelete } = await clientA
  .from('notes')
  .delete()
  .eq('id', noteId)
  .select()
check('A can delete own row', (aDelete?.length ?? 0) === 1, `${aDelete?.length ?? 0} row(s)`)

// --- summary ---------------------------------------------------------------
const failed = results.filter((r) => !r.pass)
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed` +
    (failed.length ? ` — ${failed.length} FAILED\n` : ' — all good\n'),
)

process.exit(failed.length ? 1 : 0)
