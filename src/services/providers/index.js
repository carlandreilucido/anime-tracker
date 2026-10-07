import { supabase } from '../../lib/supabase'

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export async function getEnabledProviders() {
  const { data, error } = await requireClient().from('streaming_providers')
    .select('provider_key,name,logo_url,website_url,allowed_hostnames,brand_color,access_model,is_free,pricing_note,priority,is_enabled')
    .eq('is_enabled', true)
    .order('priority', { ascending: true })
  if (error) throw error
  return data || []
}

export async function getAnimeWatchProviders(animeId) {
  const { data, error } = await requireClient().from('watch_providers')
    .select('id,anime_id,provider_key,provider_name,url,link_type,confidence,is_available,country_code,last_checked_at,created_at,updated_at')
    .eq('anime_id', animeId)
  if (error) throw error
  return data || []
}

export async function findAnimeWatchProviders(animeId, { force = false } = {}) {
  const { data, error } = await requireClient().functions.invoke('find-watch-providers', {
    body: { anime_id: animeId, force },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data || { providers: [], errors: [] }
}

export async function getUserWatchPreferences(userId) {
  const { data, error } = await requireClient().from('user_preferences')
    .select('user_id,preferred_provider,country_code,created_at,updated_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function saveUserWatchPreferences(userId, preferences) {
  const { data, error } = await requireClient().from('user_preferences')
    .upsert({ user_id: userId, ...preferences }, { onConflict: 'user_id' })
    .select('user_id,preferred_provider,country_code,created_at,updated_at')
    .single()
  if (error) throw error
  return data
}

export function isApprovedProviderUrl(url, provider) {
  try {
    const parsed = new URL(url)
    const allowed = (provider?.allowed_hostnames || []).map(host => host.toLowerCase())
    return parsed.protocol === 'https:'
      && !parsed.username
      && !parsed.password
      && allowed.includes(parsed.hostname.toLowerCase())
  } catch {
    return false
  }
}

export function sortProviderResults(results = [], providers = [], preferredProvider = null) {
  const priority = new Map(providers.map(provider => [provider.provider_key, provider.priority]))
  return [...results].sort((left, right) => {
    if (left.provider_key === preferredProvider) return -1
    if (right.provider_key === preferredProvider) return 1
    return (priority.get(left.provider_key) ?? Number.MAX_SAFE_INTEGER) - (priority.get(right.provider_key) ?? Number.MAX_SAFE_INTEGER)
  })
}
