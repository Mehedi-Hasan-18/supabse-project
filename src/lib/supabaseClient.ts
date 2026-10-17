import { createClient } from '@supabase/supabase-js'

/**
 * Supabase client for the browser.
 *
 * The values below are read from `.env.local` (Vite exposes vars prefixed with
 * `VITE_`). They are the project URL and the **publishable / anon** key, which
 * are intentionally public. Access control is NOT done by hiding this key — it
 * is enforced by the Row Level Security policies in
 * `supabase/migrations/0001_init.sql`.
 *
 * The `service_role` key and the Google OAuth client secret must NEVER be placed
 * in this file, in `.env` files that are committed, or anywhere bundled for the
 * browser.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env.local and fill in your project values.',
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Needed so the OAuth redirect back to the app is picked up automatically.
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
})
