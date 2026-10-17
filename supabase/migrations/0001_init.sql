-- ============================================================================
-- 0001_init.sql
--
-- Creates the private per-user `notes` table and locks it down with RLS so a
-- signed-in user can only read and edit rows they own.
--
-- Apply with the Supabase CLI (`supabase db push`) or paste into the SQL editor
-- of your hosted project.
-- ============================================================================

-- `gen_random_uuid()` is built into Postgres 13+ (Supabase runs 15+), so no
-- extension is required.
create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  -- Defaulted to the caller's auth uid so the client never has to send it.
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null check (char_length(btrim(title)) > 0),
  body        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Keep updated_at honest on every write.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists notes_set_updated_at on public.notes;
create trigger notes_set_updated_at
  before update on public.notes
  for each row
  execute function public.set_updated_at();

create index if not exists notes_user_id_created_at_idx
  on public.notes (user_id, created_at desc);

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.notes enable row level security;
-- Also apply RLS to the table owner, so a mistake elsewhere can't bypass it.
alter table public.notes force row level security;

-- A user may only read their own rows.
drop policy if exists "notes_select_own" on public.notes;
create policy "notes_select_own"
  on public.notes
  for select
  to authenticated
  using (auth.uid() = user_id);

-- A user may only insert rows that belong to themselves.
drop policy if exists "notes_insert_own" on public.notes;
create policy "notes_insert_own"
  on public.notes
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- A user may only update their own rows, and may not hand them to someone else.
drop policy if exists "notes_update_own" on public.notes;
create policy "notes_update_own"
  on public.notes
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- A user may only delete their own rows.
drop policy if exists "notes_delete_own" on public.notes;
create policy "notes_delete_own"
  on public.notes
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- No policy is created for `anon`, so signed-out callers can never read or write
-- anything, even with the public publishable/anon key.

-- Explicit grants: RLS narrows this down to the caller's own rows.
grant select, insert, update, delete on public.notes to authenticated;
