const API_ROOT = 'https://api.tvmaze.com'
const CACHE_PREFIX = 'kitsu:tvmaze:v1:'
const CACHE_TTL = 60 * 60 * 1000
const MAX_CACHE_ENTRIES = 60
const memoryCache = new Map()

function readCache(key) {
  const memory = memoryCache.get(key)
  if (memory && Date.now() - memory.savedAt < CACHE_TTL) return memory.value
  try {
    const cached = JSON.parse(localStorage.getItem(key) || 'null')
    if (cached && Date.now() - cached.savedAt < CACHE_TTL) {
      memoryCache.set(key, cached)
      return cached.value
    }
    if (cached) localStorage.removeItem(key)
  } catch { /* Storage may be unavailable or contain old/corrupt data. */ }
  return null
}

function writeCache(key, value) {
  const cached = { savedAt: Date.now(), value }
  memoryCache.set(key, cached)
  if (memoryCache.size > MAX_CACHE_ENTRIES) memoryCache.delete(memoryCache.keys().next().value)
  try {
    localStorage.setItem(key, JSON.stringify(cached))
    const keys = []
    for (let index = 0; index < localStorage.length; index += 1) {
      const item = localStorage.key(index)
      if (item?.startsWith(CACHE_PREFIX)) keys.push(item)
    }
    if (keys.length > MAX_CACHE_ENTRIES) {
      keys.slice(0, keys.length - MAX_CACHE_ENTRIES).forEach(item => localStorage.removeItem(item))
    }
  } catch { /* The in-memory cache remains useful when storage is full/disabled. */ }
}

async function getJson(path, { signal, bypassCache = false } = {}) {
  const cacheKey = `${CACHE_PREFIX}${path}`
  if (!bypassCache) {
    const cached = readCache(cacheKey)
    if (cached !== null) return cached
  }

  let response
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      signal,
      headers: { Accept: 'application/json' },
    })
  } catch (cause) {
    if (cause.name === 'AbortError') throw cause
    throw new Error('Could not reach TVmaze. Check your connection and try again.')
  }

  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('Retry-After'))
    throw new Error(Number.isFinite(retryAfter) && retryAfter > 0
      ? `TVmaze is rate limiting searches. Please retry in about ${retryAfter} seconds.`
      : 'TVmaze is rate limiting searches. Please wait a moment and try again.')
  }
  if (!response.ok) {
    if (response.status === 404) return null
    throw new Error(`TVmaze request failed (${response.status}). Please retry or add the anime manually.`)
  }

  const data = await response.json()
  writeCache(cacheKey, data)
  return data
}

export async function searchTvmazeShows(query, { signal, bypassCache = false } = {}) {
  const term = query.trim()
  if (term.length < 2) return []
  const data = await getJson(`/search/shows?q=${encodeURIComponent(term)}`, { signal, bypassCache })
  return Array.isArray(data) ? data.map(item => item.show).filter(Boolean) : []
}

export async function getTvmazeShowById(showId, { signal, bypassCache = false } = {}) {
  if (!showId) return null
  return getJson(`/shows/${encodeURIComponent(showId)}`, { signal, bypassCache })
}

export async function getTvmazeShowAliases(showId, { signal } = {}) {
  const aliases = await getJson(`/shows/${encodeURIComponent(showId)}/akas`, { signal })
  return Array.isArray(aliases) ? aliases : []
}

export async function getTvmazeInstallments(show, { signal, bypassCache = false } = {}) {
  const [seasonsResult, episodesResult] = await Promise.allSettled([
    getJson(`/shows/${encodeURIComponent(show.id)}/seasons`, { signal, bypassCache }),
    getJson(`/shows/${encodeURIComponent(show.id)}/episodes`, { signal, bypassCache }),
  ])

  if (seasonsResult.status === 'rejected' && episodesResult.status === 'rejected') {
    throw seasonsResult.reason
  }
  const seasons = seasonsResult.status === 'fulfilled' && Array.isArray(seasonsResult.value)
    ? seasonsResult.value
    : []
  const episodes = episodesResult.status === 'fulfilled' && Array.isArray(episodesResult.value)
    ? episodesResult.value
    : []
  const counts = new Map()
  for (const episode of episodes) {
    if (Number.isInteger(episode.season) && episode.season > 0) {
      counts.set(episode.season, (counts.get(episode.season) || 0) + 1)
    }
  }

  if (!seasons.length) {
    return [{
      key: `show-${show.id}`,
      show_id: show.id,
      show_name: show.name,
      season_id: null,
      season_number: 1,
      season_title: show.name,
      total_episodes: episodes.length || null,
      premiere_date: show.premiered || null,
      external_url: show.url || `https://www.tvmaze.com/shows/${show.id}`,
      media_type: 'tv',
      related: false,
    }]
  }

  return seasons.map(season => ({
    key: `season-${season.id}`,
    show_id: show.id,
    show_name: show.name,
    season_id: season.id,
    season_number: season.number,
    season_title: season.name || `Season ${season.number}`,
    total_episodes: Number.isInteger(season.episodeOrder)
      ? season.episodeOrder
      : counts.get(season.number) ?? null,
    premiere_date: season.premiereDate || null,
    external_url: season.url || `https://www.tvmaze.com/seasons/${season.id}`,
    media_type: 'tv',
    related: false,
  }))
}
