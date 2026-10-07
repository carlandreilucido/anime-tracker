import { supabase } from '../lib/supabase'
import { PAGE_SIZE } from '../constants'

const ANIME_WITH_SEASONS = '*, seasons:anime_seasons(*)'

function ensureClient() {
  if (!supabase) throw new Error('Connect Supabase to use your personal watchlist. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.')
}

export function sortSeasons(seasons = []) {
  return [...seasons].sort((a, b) => a.season_number - b.season_number)
}

function seriesSummary(seasons = []) {
  const statuses = seasons.map(season => season.status)
  const status = !seasons.length ? 'plan_to_watch'
    : statuses.every(value => value === 'completed') ? 'completed'
      : statuses.includes('watching') ? 'watching'
        : statuses.includes('plan_to_watch') ? 'plan_to_watch'
          : statuses.includes('on_hold') ? 'on_hold' : 'dropped'
  const activeSeason = [...seasons].sort((a, b) => {
    const rank = value => ({ watching: 0, plan_to_watch: 1, on_hold: 2, dropped: 3, completed: 4 })[value] ?? 5
    return rank(a.status) - rank(b.status) || b.season_number - a.season_number
  })[0]
  const allTotalsKnown = seasons.length > 0 && seasons.every(season => season.total_episodes !== null && season.total_episodes !== undefined)
  return {
    status,
    current_episode: seasons.reduce((sum, season) => sum + (Number(season.current_episode) || 0), 0),
    total_episodes: allTotalsKnown ? seasons.reduce((sum, season) => sum + Number(season.total_episodes), 0) : null,
    season_number: activeSeason?.season_number ?? null,
    date_started: seasons.map(season => season.date_started).filter(Boolean).sort()[0] || null,
    date_completed: status === 'completed' ? seasons.map(season => season.date_completed).filter(Boolean).sort().at(-1) || new Date().toISOString().slice(0, 10) : null,
  }
}

export function withOptimisticEpisodeChange(anime, seasonId, increment) {
  const seasons = sortSeasons(anime.seasons || [])
  const target = seasons.find(season => season.id === seasonId) || seasons.find(season => season.status === 'watching') || seasons[0]
  if (!target) return anime
  const current = Number(target.current_episode) || 0
  const next = Math.max(0, Math.min(target.total_episodes || Infinity, current + increment))
  const today = new Date().toISOString().slice(0, 10)
  const nextStatus = target.total_episodes > 0 && next >= target.total_episodes ? 'completed' : (increment > 0 || target.status === 'completed') ? 'watching' : target.status
  const updatedSeasons = seasons.map(season => season.id !== target.id ? season : {
    ...season,
    current_episode: next,
    status: nextStatus,
    date_started: season.date_started || (increment > 0 ? today : null),
    date_completed: nextStatus === 'completed' ? (season.date_completed || today) : null,
  })
  return { ...anime, ...seriesSummary(updatedSeasons), seasons: updatedSeasons }
}

export function withOptimisticEpisodeNumber(anime, seasonId, episodeNumber) {
  const seasons = sortSeasons(anime.seasons || [])
  const target = seasons.find(season => season.id === seasonId)
  if (!target) return anime
  const current = Number(target.current_episode) || 0
  const today = new Date().toISOString().slice(0, 10)
  const status = target.total_episodes !== null && target.total_episodes !== undefined && episodeNumber >= target.total_episodes
    ? 'completed'
    : episodeNumber > current && target.status !== 'watching' ? 'watching' : target.status === 'completed' ? 'watching' : target.status
  const updatedSeasons = seasons.map(season => season.id !== target.id ? season : {
    ...season,
    current_episode: episodeNumber,
    status,
    date_started: season.date_started || (episodeNumber > 0 ? today : null),
    date_completed: status === 'completed' ? (season.date_completed || today) : null,
  })
  return { ...anime, ...seriesSummary(updatedSeasons), seasons: updatedSeasons }
}

export async function getAnime({ page = 0, search = '', status = '', genre = '', favorites = false, rating = '', sort = 'created_at', direction = 'desc' } = {}) {
  ensureClient()
  let query = supabase.from('anime').select(ANIME_WITH_SEASONS, { count: 'exact' })
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
  return { data: (data || []).map(anime => ({ ...anime, seasons: sortSeasons(anime.seasons) })), count: count || 0, hasMore: (page + 1) * PAGE_SIZE < (count || 0) }
}

export async function getAnimeById(id) {
  ensureClient()
  const { data, error } = await supabase.from('anime').select(ANIME_WITH_SEASONS).eq('id', id).single()
  if (error) throw error
  return { ...data, seasons: sortSeasons(data.seasons) }
}

export async function getStats() {
  ensureClient()
  const results = await Promise.all(['watching','plan_to_watch','completed','on_hold','dropped'].map(status => supabase.from('anime').select('id', { count: 'exact', head: true }).eq('status', status)))
  const failed = results.find(result => result.error)
  if (failed) throw failed.error
  return Object.fromEntries(['watching','plan_to_watch','completed','on_hold','dropped'].map((status, i) => [status, results[i].count || 0]))
}

export async function getRecentlyWatched() {
  ensureClient()
  const { data, error } = await supabase.from('anime').select(ANIME_WITH_SEASONS).eq('status', 'watching').order('updated_at', { ascending: false }).limit(5)
  if (error) throw error
  return (data || []).map(anime => ({ ...anime, seasons: sortSeasons(anime.seasons) }))
}

export async function createAnime(values) {
  ensureClient()
  const seasons = sortSeasons(values.seasons || [])
  if (!seasons.length) throw new Error('Add at least one season before saving this anime.')
  const { seasons: _seasons, ...series } = values
  const { data: created, error } = await supabase.from('anime').insert(series).select('id').single()
  if (error) {
    if (error.code === '23505') throw new Error('This anime is already in your library. Open it and add the season there.')
    throw error
  }
  const seasonRows = seasons.map(season => ({
    anime_id: created.id,
    season_number: Number(season.season_number),
    season_title: season.season_title?.trim() || `Season ${season.season_number}`,
    total_episodes: season.total_episodes === '' ? null : season.total_episodes,
    current_episode: Number(season.current_episode) || 0,
    status: season.status || 'plan_to_watch',
    date_started: season.date_started || null,
    date_completed: season.date_completed || null,
  }))
  const { error: seasonError } = await supabase.from('anime_seasons').insert(seasonRows)
  if (seasonError) {
    await supabase.from('anime').delete().eq('id', created.id)
    if (seasonError.code === '23505') throw new Error('Season numbers must be unique for this anime.')
    throw seasonError
  }
  return getAnimeById(created.id)
}

export async function addAnimeSeason(animeId, season) {
  ensureClient()
  const { error } = await supabase.from('anime_seasons').insert({
    anime_id: animeId,
    season_number: Number(season.season_number),
    season_title: season.season_title?.trim() || `Season ${season.season_number}`,
    total_episodes: season.total_episodes === '' ? null : season.total_episodes,
    current_episode: Number(season.current_episode) || 0,
    status: season.status || 'plan_to_watch',
    date_started: season.date_started || null,
    date_completed: season.date_completed || null,
  })
  if (error) {
    if (error.code === '23505') throw new Error('That season number already exists for this anime.')
    throw error
  }
  return getAnimeById(animeId)
}

export async function updateAnimeSeason(animeId, seasonId, season) {
  ensureClient()
  const { error } = await supabase.from('anime_seasons').update({
    season_number: Number(season.season_number),
    season_title: season.season_title?.trim() || `Season ${season.season_number}`,
    total_episodes: season.total_episodes === '' ? null : season.total_episodes,
    current_episode: Number(season.current_episode) || 0,
    status: season.status,
    date_started: season.date_started || null,
    date_completed: season.date_completed || null,
  }).eq('id', seasonId).eq('anime_id', animeId)
  if (error) {
    if (error.code === '23505') throw new Error('That season number already exists for this anime.')
    throw error
  }
  return getAnimeById(animeId)
}

export async function updateAnime(id, values) {
  ensureClient()
  const { data, error } = await supabase.from('anime').update(values).eq('id', id).select(ANIME_WITH_SEASONS).single()
  if (error) throw error
  return { ...data, seasons: sortSeasons(data.seasons) }
}

export async function deleteAnime(id) {
  ensureClient()
  const { error } = await supabase.from('anime').delete().eq('id', id)
  if (error) throw error
}

export async function updateEpisodeProgress(anime, increment, seasonId) {
  ensureClient()
  const target = anime.seasons?.find(season => season.id === seasonId) || anime.seasons?.find(season => season.status === 'watching') || anime.seasons?.[0]
  if (!target) throw new Error('This anime does not have a season yet.')
  const next = Math.max(0, Math.min(target.total_episodes || Infinity, (target.current_episode || 0) + increment))
  const today = new Date().toISOString().slice(0, 10)
  const status = target.total_episodes > 0 && next >= target.total_episodes ? 'completed' : (increment > 0 || target.status === 'completed') ? 'watching' : target.status
  const { error } = await supabase.from('anime_seasons').update({
    current_episode: next,
    status,
    date_started: target.date_started || (increment > 0 ? today : null),
    date_completed: status === 'completed' ? (target.date_completed || today) : null,
  }).eq('id', target.id)
  if (error) throw error
  return getAnimeById(anime.id)
}

export async function setSeasonEpisodeProgress(anime, seasonId, episodeNumber) {
  ensureClient()
  const target = anime.seasons?.find(season => season.id === seasonId)
  if (!target) throw new Error('Season not found in this series.')
  if (!Number.isSafeInteger(episodeNumber) || episodeNumber < 0 || (target.total_episodes !== null && target.total_episodes !== undefined && episodeNumber > target.total_episodes)) {
    throw new Error(`Episode number must be between 0 and ${target.total_episodes ?? 'the available total'}.`)
  }
  const current = Number(target.current_episode) || 0
  const today = new Date().toISOString().slice(0, 10)
  const status = target.total_episodes !== null && target.total_episodes !== undefined && episodeNumber >= target.total_episodes
    ? 'completed'
    : episodeNumber > current && target.status !== 'watching' ? 'watching' : target.status === 'completed' ? 'watching' : target.status
  const { error } = await supabase.from('anime_seasons').update({
    current_episode: episodeNumber,
    status,
    date_started: target.date_started || (episodeNumber > 0 ? today : null),
    date_completed: status === 'completed' ? (target.date_completed || today) : null,
  }).eq('id', target.id)
  if (error) throw error
  return getAnimeById(anime.id)
}

export async function markAnimeCompleted(anime) {
  ensureClient()
  const today = new Date().toISOString().slice(0, 10)
  const { error } = await supabase.from('anime_seasons').update({
    status: 'completed',
    date_completed: today,
  }).eq('anime_id', anime.id)
  if (error) throw error
  return getAnimeById(anime.id)
}

export async function toggleFavorite(anime) {
  return updateAnime(anime.id, { is_favorite: !anime.is_favorite })
}
