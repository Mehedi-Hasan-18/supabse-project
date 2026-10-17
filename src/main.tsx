import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

const root = createRoot(document.getElementById('root')!)

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Read the env vars HERE, at the entry point, and show a readable message if they
 * are missing. Doing it this way means a missing .env.local can never leave you
 * staring at a blank page — the error is rendered instead of thrown at import time.
 */
if (!url || !anonKey) {
  root.render(
    <div style={{ maxWidth: 640, margin: '4rem auto', fontFamily: 'system-ui' }}>
      <h1 style={{ color: 'var(--danger)' }}>Configuration missing</h1>
      <p>
        <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> are not
        defined.
      </p>
      <ol>
        <li>
          Copy <code>.env.example</code> to <code>.env.local</code> in the project root.
        </li>
        <li>
          Paste your project URL and anon/publishable key from Supabase → Project
          Settings → API.
        </li>
        <li>
          <strong>Restart the dev server</strong> — Vite only reads <code>.env</code>{' '}
          files at startup.
        </li>
      </ol>
    </div>,
  )
} else {
  // Import lazily so the Supabase client is only created once config is present.
  void import('./App.tsx').then(({ default: App }) => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
}
