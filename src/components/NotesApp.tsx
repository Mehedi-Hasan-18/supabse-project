import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { createNote, deleteNote, listNotes, updateNote, type Note } from '../lib/notes'

export default function NotesApp({ session }: { session: Session }) {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [newTitle, setNewTitle] = useState('')
  const [newBody, setNewBody] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')

  const user = session.user

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setNotes(await listNotes())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newTitle.trim()) return
    setError(null)
    try {
      const note = await createNote(newTitle.trim(), newBody)
      setNotes((prev) => [note, ...prev])
      setNewTitle('')
      setNewBody('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function startEdit(note: Note) {
    setEditingId(note.id)
    setEditTitle(note.title)
    setEditBody(note.body ?? '')
  }

  async function saveEdit(id: string) {
    setError(null)
    try {
      const updated = await updateNote(id, editTitle.trim(), editBody)
      if (!updated) {
        // RLS refused the write: no rows matched auth.uid() = user_id.
        setError('Update was blocked by the database (this row is not yours).')
      } else {
        setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)))
      }
      setEditingId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleDelete(id: string) {
    setError(null)
    try {
      const deleted = await deleteNote(id)
      if (!deleted) {
        setError('Delete was blocked by the database (this row is not yours).')
      } else {
        setNotes((prev) => prev.filter((n) => n.id !== id))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Your notes</h1>
          <p className="muted">
            Signed in as {user.email} · <code>{user.id}</code>
          </p>
        </div>
        <button onClick={() => void supabase.auth.signOut()}>Sign out</button>
      </div>

      {error && <p className="error" style={{ marginBottom: '1rem' }}>{error}</p>}

      <form className="card stack" onSubmit={handleCreate} style={{ marginBottom: '1.5rem' }}>
        <strong>New note</strong>
        <input
          placeholder="Title"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />
        <textarea
          placeholder="Body (optional)"
          rows={3}
          value={newBody}
          onChange={(e) => setNewBody(e.target.value)}
        />
        <div>
          <button className="primary" type="submit" disabled={!newTitle.trim()}>
            Add note
          </button>
        </div>
      </form>

      <div className="row" style={{ justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <strong>{notes.length} note{notes.length === 1 ? '' : 's'}</strong>
        <button onClick={() => void refresh()} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {!loading && notes.length === 0 && (
        <p className="muted">
          No notes yet. If another account created rows, you still won't see them —
          RLS only returns rows where <code>user_id = auth.uid()</code>.
        </p>
      )}

      <div className="stack">
        {notes.map((note) => (
          <div className="card" key={note.id}>
            {editingId === note.id ? (
              <div className="stack">
                <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                <textarea
                  rows={3}
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                />
                <div className="row">
                  <button className="primary" onClick={() => void saveEdit(note.id)}>
                    Save
                  </button>
                  <button onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="note">
                <div>
                  <div style={{ fontWeight: 600 }}>{note.title}</div>
                  {note.body && <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{note.body}</p>}
                </div>
                <div className="row">
                  <button onClick={() => startEdit(note)}>Edit</button>
                  <button className="danger" onClick={() => void handleDelete(note.id)}>
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
