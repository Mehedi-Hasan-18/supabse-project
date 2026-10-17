import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function LoginScreen() {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function signInWithGoogle() {
    setBusy(true)
    setError(null)

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Send the user back to this app after Google redirects.
        redirectTo: window.location.origin,
      },
    })

    // On success the browser is redirected away, so we only get here if it failed.
    if (error) {
      setError(error.message)
      setBusy(false)
    }
  }

  return (
    <div className="center">
      <div className="login-box">
        <h1>Notes</h1>
        <p className="muted">
          Sign in to manage your private notes. Each account can only see and edit
          its own data.
        </p>
        <button className="primary" onClick={signInWithGoogle} disabled={busy}>
          {busy ? 'Redirecting…' : 'Continue with Google'}
        </button>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  )
}
