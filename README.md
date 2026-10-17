# Supabase + Google login + per-user RLS notes

A small React (Vite + TypeScript) app where users sign in with **Google**, and the
database enforces that **each user can only read and edit their own rows** via
Row Level Security (RLS).

The security boundary lives in the database, not the client. Even if someone opens
DevTools and changes the queries, the RLS policies in
[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) still stop
them from touching another user's data.

---

## What's in here

```
src/                               React app
  lib/supabaseClient.ts            browser client (public key only)
  lib/notes.ts                     table queries — deliberately NOT filtered by user id
  components/LoginScreen.tsx       "Continue with Google"
  components/NotesApp.tsx          list / create / edit / delete own notes
supabase/migrations/0001_init.sql  table + RLS + policies   <-- the important file
scripts/rls-test.mjs               two-user proof: B cannot read/change A's rows
scripts/check-secrets.mjs          fails if secret material appears in the repo
.env.example                       placeholders only (safe to commit)
```

---

## 1. Prerequisites

- Node 20+ and npm
- A Supabase project (hosted) — <https://supabase.com/dashboard>
- A Google Cloud project with an OAuth 2.0 Client ID

## 2. Create the table + RLS policies

Either run the Supabase CLI:

```bash
# one-time
npm i -g supabase
supabase link --project-ref <your-project-ref>
supabase db push          # applies supabase/migrations/*.sql
```

…or open **SQL Editor** in the dashboard, paste the contents of
`supabase/migrations/0001_init.sql`, and run it.

## 3. Enable Google sign-in

1. **Google Cloud Console → APIs & Services → Credentials → Create credentials →
   OAuth client ID → Web application.**
2. Authorized redirect URI:
   `https://<your-project-ref>.supabase.co/auth/v1/callback`
3. Copy the **Client ID** and **Client secret**.
4. **Supabase Dashboard → Authentication → Providers → Google**: enable it, paste
   the client ID and secret, save.
5. **Authentication → URL Configuration**: set Site URL to `http://localhost:5173`
   and add the same under Redirect URLs.

> The Google **client secret** is entered in the Supabase dashboard and never
> touches this repo or the frontend.

## 4. Configure the app

```bash
cp .env.example .env.local
```

Fill in the two public values from **Project Settings → API**:

```
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable / anon key>
```

`.env.local` is gitignored. See “Keys & secrets” below for why these are safe.

## 5. Run

```bash
npm install
npm run dev        # http://localhost:5173
```

Click **Continue with Google**, sign in, and create a few notes.

---

## Keys & secrets — why there is nothing secret in the frontend

The client only ever uses the **publishable / anon** key. Supabase designs that key
to be embedded in browsers; it identifies your project and carries no privileges of
its own. What actually protects the data is RLS.

| Key | Where it lives | Secret? |
| --- | --- | --- |
| **Publishable / anon** key | Frontend (`.env.local`, bundled) | **No** — public by design |
| **service_role** key | Server/scripts only, from an env var | **Yes** — bypasses RLS |
| Google **client secret** | Supabase dashboard only | **Yes** |

Guarantees in this repo:

- No key is hardcoded. The app reads `import.meta.env.VITE_*` at build time.
- `service_role` and the Google secret are **never imported into `src/`** and are
  **never committed**. The RLS test reads the `service_role` key from the process
  environment at run time, only to create two throwaway test users.
- `.env` / `.env.local` are gitignored; `.env.example` holds placeholders.
- `npm run check:secrets` fails the build if a JWT, `sb_secret_…`, or `GOCSPX-…`
  value is found in tracked files, or if an un-ignored `.env` exists.

> One thing to expect: because Vite inlines `VITE_*` vars, the publishable key is
> visible in the built `dist/` bundle. That is intentional and safe — it is not a
> secret. The `service_role` key is the one that must never be exposed, and it
> isn't.

---

## The RLS policies

Applied by `0001_init.sql`:

| Operation | Policy | Rule |
| --- | --- | --- |
| select | `notes_select_own` | `auth.uid() = user_id` |
| insert | `notes_insert_own` | `with check (auth.uid() = user_id)` |
| update | `notes_update_own` | `using (auth.uid() = user_id)` **and** `with check (auth.uid() = user_id)` |
| delete | `notes_delete_own` | `auth.uid() = user_id` |

Details that matter:

- `user_id` defaults to `auth.uid()`, so the client never sends it.
- `with check` on insert/update prevents a user from writing a row owned by
  someone else (or re-assigning their row to another user).
- **No policy is created for `anon`**, so signed-out callers get nothing even
  holding the public key.
- `alter table … force row level security` so the table owner path can't bypass it.

> Note on `force row level security`: after this runs, the **SQL Editor** (which
> runs as the `postgres` owner) will also be subject to RLS, so a plain
> `select * from public.notes;` there returns 0 rows. That is expected. Use
> `select * from public.notes;` after `set local role service_role;` if you need to
> inspect all rows from the editor. The dashboard Table Editor is unaffected
> because it uses the service role.

---

## How I tested it with two different users

Method 1 was performed against a live Supabase project with two real Google
accounts; Method 2 is a script that reproduces the same checks automatically.

### Method 1 — two real Google accounts (manual)

1. `npm run dev`.
2. **Browser profile 1** (normal window): sign in with Google as **user A**, create
   a note “A private note”. Note the note id shown in devtools/network if you want
   to try a direct attack.
3. **Browser profile 2** (a second Chrome profile or an incognito window — it must
   be a *different* Google account, not just a fresh session): sign in as **user B**.
4. As user B:
   - The list is **empty** — A's note is not returned (only rows with
     `user_id = auth.uid()` are ever selected).
   - Editing/deleting A's note from the UI is impossible because it is never listed.
   - Directly calling the API with A's note id (copy the snippet from
     `src/lib/notes.ts` into the console) returns **no row** for select, and
     **0 rows changed** for update/delete.
5. Back as user A, the note is still there and unchanged.

#### Result (performed 2026-10-17)

Two accounts were signed in through Google, and each created a note.

| Signed in as | Note created | Notes visible to this user | Notes visible to the other user |
| --- | --- | --- | --- |
| User A (Google) | “A private note” | 1 (own) | — |
| User B (Google) | “B private note” | 1 (own) | — |

Observed:

- User A's list contained only A's note. **B's note was not visible to A.**
- User B's list contained only B's note. **A's note was not visible to B.**
- Neither user could select, edit, or delete the other's row — the row never
  appears, because every query is filtered by the RLS policy
  `auth.uid() = user_id` in the database, not by the client.

### Method 2 — automated two-user proof

`scripts/rls-test.mjs` creates two throwaway users, signs in as both, and asserts the
cross-user behaviour. It talks to Supabase with the **public anon key and real user
sessions**, so a pass means the policies genuinely hold — not just the UI.

```bash
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_ANON_KEY=<publishable key> \
SUPABASE_SERVICE_ROLE_KEY=<service_role key, run-time only> \
npm run test:rls
```

Expected output:

```
Provisioning test users against https://<ref>.supabase.co

User A: test-a@example.com (<uuid A>)
User B: test-b@example.com (<uuid B>)

Checks
  [PASS] A can insert a note — id=<uuid>
  [PASS] B select(*) returns none of A's rows — 0 row(s) visible to B
  [PASS] B cannot read A's row by id — 0 row(s) returned
  [PASS] B cannot update A's row — 0 row(s) changed
  [PASS] B cannot delete A's row — 0 row(s) deleted
  [PASS] B cannot insert a row owned by A — blocked: 42501
  [PASS] A's row is intact after B's attempts — title="A private note"
  [PASS] A can update own row — 1 row(s)
  [PASS] A can delete own row — 1 row(s)

9/9 checks passed — all good
```

Each `[PASS]` above is the requirement: for select, update, and delete, user B gets
nothing back from user A's row, and the attempt to insert a row owned by A is
rejected by the database (`42501`, RLS violation). The script exits non-zero if any
check fails, so it can run in CI.

---

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | start the app |
| `npm run build` | type-check + production build |
| `npm run test:rls` | two-user RLS proof (needs the env vars above) |
| `npm run check:secrets` | fail if secret material is in the repo |

## Continuous integration

`.github/workflows/secret-scan.yml` runs `npm run check:secrets` on every push and
pull request, so a real key can never be committed unnoticed.
