import { createClient } from '@supabase/supabase-js'
import { createSupabaseFetch } from './supabaseFetch'

const configuredUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim()
const configuredKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()
let normalizedUrl = ''
let urlIsValid = false

try {
  const parsed = new URL(configuredUrl)
  urlIsValid = (parsed.protocol === 'https:' || (parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname)))
    && parsed.pathname === '/' && !parsed.search && !parsed.hash && Boolean(parsed.hostname)
  if (urlIsValid) normalizedUrl = parsed.origin
} catch { /* The setup screen reports a missing/invalid URL without echoing values. */ }

const keyIsValid = Boolean(configuredKey) && !/\s/.test(configuredKey)
export const hasSupabaseConfig = urlIsValid && keyIsValid
export const supabaseConfigError = !urlIsValid
  ? 'Set VITE_SUPABASE_URL to your Supabase project URL.'
  : !keyIsValid
    ? 'Set VITE_SUPABASE_ANON_KEY to your Supabase publishable or anon key.'
    : null

let clientInstance = null
if (hasSupabaseConfig) {
  const fetchWithRecovery = createSupabaseFetch({
    url: normalizedUrl,
    apiKey: configuredKey,
    refreshSession: () => clientInstance.auth.refreshSession(),
    onAuthFailure: detail => {
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('kitsu:session-recovery-failed', { detail }))
    },
  })
  clientInstance = createClient(normalizedUrl, configuredKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    global: { fetch: fetchWithRecovery },
  })
}

export const supabase = clientInstance
