# AGENTS.md

Single-page React (Vite + TS) app talking to a **hosted** Supabase project: Google
OAuth login, and a `notes` table where RLS restricts every row to its owner. There
is no backend and no local Supabase.

## Commands

- `npm run dev` — Vite dev server on :5173. Vite reads `.env.local` **only at
  startup**, so restart it after changing env values.
- `npm run build` — `tsc --noEmit && vite build`.
- `npm run typecheck` — the same tsc pass on its own.
- `npm run check:secrets` — static scan of tracked files; no dependencies.
- Two-user RLS test: `node --env-file=.env.local scripts/rls-test.mjs` (exit 0 = pass).
  - `npm run test:rls` **alone fails** — it does not load `.env.local`, so it exits
    with `Missing SUPABASE_URL`. Always use the `--env-file` form or pass vars inline.
- There is **no test runner, linter, or formatter** in this repo. `npm test`,
  eslint, and prettier do not exist; don't add or invoke them.

## Gotchas that are easy to miss

- `supabase/migrations/0001_init.sql` is applied **by hand** (paste into the Supabase
  dashboard SQL Editor). There is no `supabase/config.toml`, no `supabase start`,
  no Docker — don't assume a local database. Re-running the SQL is safe (idempotent:
  `if not exists` / `drop policy if exists`).
- `force row level security` is enabled, so `select * from public.notes;` in the
  dashboard **SQL Editor returns 0 rows** because it runs as the table owner
  (`postgres`). Prepend `set local role service_role;` to inspect all rows. The
  dashboard Table Editor is unaffected.
- `scripts/rls-test.mjs` runs against the **live hosted project**, not a sandbox: it
  creates/reuses `test-a@example.com` / `test-b@example.com` and inserts and deletes
  real rows.
- Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` may reach the browser (both
  public by design). The **service_role** key lives only in `.env.local` for the test
  script — never prefix it with `VITE_`, never import it from `src/`.
- Env vars are validated in `src/main.tsx` (the entrypoint), which renders a
  "Configuration missing" screen. Keep it there: reading them inside
  `supabaseClient.ts` threw at module scope and produced a blank page.

## Conventions to not break

- `src/lib/notes.ts` deliberately does **not** filter by `user_id`, and the client
  never sends `user_id` (the column defaults to `auth.uid()`). RLS is the only access
  control. Don't "fix" this by adding client-side filters, and don't remove the
  `with check` clauses on the insert/update policies.
- All UI colors are CSS custom properties in `src/index.css` with a
  `prefers-color-scheme: dark` block and a per-theme `color-scheme`. Use the tokens
  (`var(--text)`, `var(--surface)`, `var(--border)`, …) in new UI; hardcoded
  light-only colors previously caused white-on-white text.
- `tsconfig.json` is `strict` with `noUnusedLocals`/`noUnusedParameters` and
  `"include": ["src"]`, so `vite.config.ts` and `scripts/*.mjs` are not typechecked.
- `.gitignore` ignores `*.local`; a mistyped env filename (e.g. `.env.loval`) would be
  committed. `check:secrets` fails if `.env` / `.env.local` exist and are not ignored.
- CI: `.github/workflows/secret-scan.yml` runs `check:secrets` on push and PR. The git
  remote is `git@github.com:Mehedi-Hasan-18/supabse-project.git` — the "supabse" typo
  is the real repo name; don't correct the URL.
- The README's "How I tested it with two different users" section embeds real test
  output and user UUIDs. Re-running the test should update that block.
