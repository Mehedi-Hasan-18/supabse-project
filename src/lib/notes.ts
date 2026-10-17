import { supabase } from './supabaseClient'

export interface Note {
  id: string
  user_id: string
  title: string
  body: string | null
  created_at: string
  updated_at: string
}

/**
 * NOTE: none of these queries filter by user id.
 *
 * That is deliberate — the database decides what the signed-in user may see or
 * change via RLS (`auth.uid() = user_id`). A malicious user could edit these
 * calls in DevTools, but the policies still stop them from reading or writing
 * another user's rows.
 */
export async function listNotes(): Promise<Note[]> {
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function createNote(title: string, body: string): Promise<Note> {
  const { data, error } = await supabase
    .from('notes')
    // user_id is defaulted to auth.uid() in the database.
    .insert({ title, body: body || null })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateNote(
  id: string,
  title: string,
  body: string,
): Promise<Note | null> {
  const { data, error } = await supabase
    .from('notes')
    .update({ title, body: body || null })
    .eq('id', id)
    .select()
    .maybeSingle()

  if (error) throw error
  // If RLS blocked the update, Supabase returns no rows instead of an error.
  return data ?? null
}

export async function deleteNote(id: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('notes')
    .delete()
    .eq('id', id)
    .select()

  if (error) throw error
  return (data?.length ?? 0) > 0
}
