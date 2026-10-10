import { supabase } from '../lib/supabase'

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export async function searchUsers(query, { limit = 10, offset = 0 } = {}) {
  const term = query.trim()
  if (term.length < 2) return []
  const { data, error } = await requireClient().rpc('search_public_profiles', {
    p_query: term,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw error
  return data || []
}

export async function getPublicProfile(username) {
  const { data, error } = await requireClient().rpc('get_public_profile', { p_username: username })
  if (error) throw error
  return data
}

export async function getPublicUserLibrary(username, {
  limit = 20,
  offset = 0,
  search = '',
  status = '',
  genre = '',
} = {}) {
  const { data, error } = await requireClient().rpc('get_public_user_library', {
    p_username: username,
    p_limit: limit,
    p_offset: offset,
    p_search: search,
    p_status: status,
    p_genre: genre,
  })
  if (error) throw error
  return data
}

export async function getMyAnimeMatchKeys(anime = []) {
  if (!anime.length) return new Set()
  const titleKeys = [...new Set(anime.map(item => item.title?.trim().toLowerCase()).filter(Boolean))]
  const externalKeys = [...new Set(anime.flatMap(item => [
    ...(item.external_provider && item.external_id ? [`${item.external_provider}:${item.external_id}`] : []),
    ...(item.seasons || []).filter(season => season.external_provider && season.external_id)
      .map(season => `${season.external_provider}:${season.external_id}`),
  ]))]
  const { data, error } = await requireClient().rpc('get_my_anime_match_keys', {
    p_title_keys: titleKeys,
    p_external_keys: externalKeys,
  })
  if (error) throw error
  return new Set((data || []).flatMap(item => [
    item.title_key ? `title:${item.title_key}` : null,
    item.external_key ? `external:${item.external_key}` : null,
  ]).filter(Boolean))
}

export function animeMatchKeys(anime) {
  const keys = [`title:${anime.title?.trim().toLowerCase()}`]
  if (anime.external_provider && anime.external_id) keys.push(`external:${anime.external_provider}:${anime.external_id}`)
  for (const season of anime.seasons || []) {
    if (season.external_provider && season.external_id) keys.push(`external:${season.external_provider}:${season.external_id}`)
  }
  return keys
}
