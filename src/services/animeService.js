import { supabase } from '../lib/supabase'
import { PAGE_SIZE } from '../constants'

function ensureClient() { if (!supabase) throw new Error('Connect Supabase to use your personal watchlist. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.') }
export async function getAnime({ page = 0, search = '', status = '', genre = '', favorites = false, rating = '', sort = 'created_at', direction = 'desc' } = {}) {
  ensureClient()
  let query = supabase.from('anime').select('*', { count: 'exact' })
  if (search.trim()) {
    const term = search.trim().replace(/[{}",]/g, '')
    query = query.or(`title.ilike.%${term}%,alternative_title.ilike.%${term}%,genres.cs.{${term}}`)
  }
  if (status) query = query.eq('status', status)
  if (genre) query = query.contains('genres', [genre])
  if (favorites) query = query.eq('is_favorite', true)
  if (rating === 'rated') query = query.not('rating', 'is', null)
  if (/^[1-9]$|^10$/.test(rating)) query = query.gte('rating', Number(rating))
  const sortColumn = ({ 'Recently added': 'created_at', 'Recently updated': 'updated_at', 'Title A–Z': 'title', 'Title Z–A': 'title', 'Highest rated': 'rating', 'Lowest rated': 'rating', Progress: 'current_episode' })[sort] || sort
  query = query.order(sortColumn, { ascending: direction === 'asc', nullsFirst: false }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
  const { data, error, count } = await query
  if (error) throw error
  return { data: data || [], count: count || 0, hasMore: (page + 1) * PAGE_SIZE < (count || 0) }
}
export async function getAnimeById(id) { ensureClient(); const { data, error } = await supabase.from('anime').select('*').eq('id', id).single(); if (error) throw error; return data }
export async function getStats() {
  ensureClient()
  const results = await Promise.all(['watching','plan_to_watch','completed','on_hold','dropped'].map(status => supabase.from('anime').select('id', { count: 'exact', head: true }).eq('status', status)))
  const failed = results.find(result => result.error); if (failed) throw failed.error
  return Object.fromEntries(['watching','plan_to_watch','completed','on_hold','dropped'].map((status, i) => [status, results[i].count || 0]))
}
export async function getRecentlyWatched() { ensureClient(); const { data, error } = await supabase.from('anime').select('*').eq('status','watching').order('updated_at',{ascending:false}).limit(5); if(error) throw error; return data || [] }
export async function createAnime(values) { ensureClient(); const { data, error } = await supabase.from('anime').insert(values).select().single(); if(error) throw error; return data }
export async function updateAnime(id, values) { ensureClient(); const { data, error } = await supabase.from('anime').update(values).eq('id',id).select().single(); if(error) throw error; return data }
export async function deleteAnime(id) { ensureClient(); const { error } = await supabase.from('anime').delete().eq('id',id); if(error) throw error }
export async function updateEpisodeProgress(anime, increment) {
  const next = Math.max(0, Math.min(anime.total_episodes || Infinity, (anime.current_episode || 0) + increment))
  const values = { current_episode: next }
  if (anime.total_episodes && next === anime.total_episodes) { values.status = 'completed'; values.date_completed = new Date().toISOString().slice(0,10) }
  else if (anime.status === 'completed' && next < anime.total_episodes) { values.status = 'watching'; values.date_completed = null }
  return updateAnime(anime.id, values)
}
export async function toggleFavorite(anime) { return updateAnime(anime.id, { is_favorite: !anime.is_favorite }) }
