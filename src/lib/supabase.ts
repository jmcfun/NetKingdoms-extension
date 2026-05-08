import { createClient, type Session } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Supabase variables are not configured. Auth will be disabled.')
}

export const supabase = createClient(SUPABASE_URL ?? '', SUPABASE_ANON_KEY ?? '', {
  auth: {
    persistSession: false,
  },
})

export async function getStoredSession(): Promise<Session | null> {
  const result = await chrome.storage.local.get(['supabaseSession'])
  return result.supabaseSession ?? null
}

export async function storeSession(session: Session | null) {
  if (session) {
    await chrome.storage.local.set({ supabaseSession: session })
  } else {
    await chrome.storage.local.remove(['supabaseSession'])
  }
}

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
