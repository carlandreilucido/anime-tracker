export interface AnimeMetadata {
  id: string
  title: string
  english_title?: string | null
  romaji_title?: string | null
  japanese_title?: string | null
  alternative_title?: string | null
  alternative_titles?: string[] | null
  mal_id?: number | null
  anilist_id?: number | null
  provider_ids?: Record<string, string | number> | null
}

export interface StreamingProvider {
  provider_key: string
  name: string
  website_url: string
  search_url_template: string
  allowed_hostnames: string[]
  adapter_key: string
  priority: number
}

export interface ProviderResult {
  provider_key: string
  provider_name: string
  url: string
  type: 'direct' | 'search'
  confidence: number | null
  is_available: boolean
  matched_title: string | null
}

export interface WatchProviderAdapter {
  resolveProviderId?(anime: AnimeMetadata, provider: StreamingProvider): Promise<ProviderResult | null>
  resolveMalId?(anime: AnimeMetadata, provider: StreamingProvider): Promise<ProviderResult | null>
  resolveAniListId?(anime: AnimeMetadata, provider: StreamingProvider): Promise<ProviderResult | null>
  search(anime: AnimeMetadata, provider: StreamingProvider): Promise<ProviderResult | null>
}

export function normalizeTitle(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[‐‑‒–—―]/g, '-')
    .replace(/['-]+/g, ' ')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function preferredSearchTitle(anime: AnimeMetadata): string {
  const candidates = [anime.english_title, anime.title, anime.romaji_title, anime.japanese_title, anime.alternative_title, ...(anime.alternative_titles || [])]
    .filter((value): value is string => Boolean(value?.trim()))
  const seen = new Set<string>()
  for (const candidate of candidates) {
    const normalized = normalizeTitle(candidate)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    return candidate.trim()
  }
  return anime.title.trim()
}

const searchFallback: WatchProviderAdapter = {
  async search(anime, provider) {
    if (!provider.search_url_template?.includes('{query}')) return null
    const title = preferredSearchTitle(anime)
    return {
      provider_key: provider.provider_key,
      provider_name: provider.name,
      url: provider.search_url_template.replaceAll('{query}', encodeURIComponent(title)),
      type: 'search',
      confidence: null,
      // A search link is useful but does not assert regional availability.
      is_available: false,
      matched_title: title,
    }
  },
}

// Official provider API adapters can be registered by adapter_key. The providers
// seeded today have no reliable public catalog lookup, so they use search fallback.
const adapters: Record<string, WatchProviderAdapter> = {
  search: searchFallback,
  bilibili: searchFallback,
  crunchyroll: searchFallback,
  netflix: searchFallback,
  disney_plus: searchFallback,
  prime_video: searchFallback,
  youtube: searchFallback,
  animekai: searchFallback,
  loklok: searchFallback,
}

export async function getWatchLink(anime: AnimeMetadata, provider: StreamingProvider): Promise<ProviderResult | null> {
  const adapter = adapters[provider.adapter_key] || searchFallback
  const providerId = anime.provider_ids?.[provider.provider_key]
  if (providerId && adapter.resolveProviderId) {
    const exact = await adapter.resolveProviderId(anime, provider)
    if (exact) return exact
  }
  if (anime.mal_id && adapter.resolveMalId) {
    const malMatch = await adapter.resolveMalId(anime, provider)
    if (malMatch) return malMatch
  }
  if (anime.anilist_id && adapter.resolveAniListId) {
    const aniListMatch = await adapter.resolveAniListId(anime, provider)
    if (aniListMatch) return aniListMatch
  }
  return adapter.search(anime, provider)
}
