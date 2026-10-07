import { createClient } from 'npm:@supabase/supabase-js@2'
import { getWatchLink, type AnimeMetadata, type ProviderResult, type StreamingProvider } from '../_shared/providerAdapters.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function validateProviderUrl(result: ProviderResult, provider: StreamingProvider): boolean {
  try {
    const parsed = new URL(result.url)
    const allowed = (provider.allowed_hostnames || []).map(host => host.toLowerCase())
    const hostname = parsed.hostname.toLowerCase()
    const hostApproved = allowed.some(host => hostname === host || hostname.endsWith(`.${host}`))
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password && hostApproved
  } catch {
    return false
  }
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405)

  const authorization = request.headers.get('Authorization')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!authorization?.startsWith('Bearer ') || !supabaseUrl || !anonKey || !serviceRoleKey) {
    return respond({ error: 'A valid signed-in session is required.' }, 401)
  }

  try {
    const body = await request.json()
    const animeId = typeof body.anime_id === 'string' ? body.anime_id : ''
    const force = body.force === true
    if (!UUID_PATTERN.test(animeId)) return respond({ error: 'A valid anime_id is required.' }, 400)

    const accessToken = authorization.slice('Bearer '.length)
    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser(accessToken)
    if (authError || !user) return respond({ error: 'Authentication could not be verified.' }, 401)

    // The user's JWT and anime RLS policy verify this anime belongs to the caller.
    // Never trust title/ID metadata supplied in the request body.
    const { data: anime, error: animeError } = await userClient.from('anime')
      .select('id,title,alternative_title,alternative_titles,english_title,romaji_title,japanese_title,mal_id,anilist_id,provider_ids')
      .eq('id', animeId)
      .single()
    if (animeError || !anime) return respond({ error: 'Anime not found in your watchlist.' }, 404)

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const [{ data: providers, error: providerError }, { data: preferences }] = await Promise.all([
      serviceClient.from('streaming_providers')
        .select('provider_key,name,website_url,search_url_template,allowed_hostnames,adapter_key,brand_color,priority,is_enabled')
        .eq('is_enabled', true)
        .order('priority', { ascending: true }),
      userClient.from('user_preferences').select('preferred_provider,country_code').eq('user_id', user.id).maybeSingle(),
    ])
    if (providerError) throw providerError
    const enabledProviders = (providers || []) as StreamingProvider[]

    const { data: cachedLinks, error: cacheError } = await userClient.from('watch_providers')
      .select('id,anime_id,provider_key,provider_name,url,link_type,confidence,is_available,country_code,last_checked_at,created_at,updated_at')
      .eq('anime_id', animeId)
    if (cacheError) throw cacheError

    const existing = cachedLinks || []
    const existingByKey = new Map(existing.map(link => [link.provider_key, link]))
    const freshAfter = Date.now() - CACHE_TTL_MS
    const cacheIsFresh = !force && enabledProviders.every(provider => {
      const link = existingByKey.get(provider.provider_key)
      return link
        && new Date(link.last_checked_at).getTime() >= freshAfter
        && (link.country_code || null) === (preferences?.country_code || null)
    })
    if (!enabledProviders.length || cacheIsFresh) {
      return respond({ providers: existing.filter(link => enabledProviders.some(provider => provider.provider_key === link.provider_key)), cached: true, errors: [] })
    }

    const metadata = anime as AnimeMetadata
    const checkedAt = new Date().toISOString()
    const lookups = await Promise.allSettled(enabledProviders.map(async provider => {
      const result = await getWatchLink(metadata, provider)
      if (!result) return null
      if (!validateProviderUrl(result, provider)) throw new Error(`Rejected an unapproved URL for ${provider.provider_key}.`)
      return {
        anime_id: animeId,
        provider_key: provider.provider_key,
        provider_name: provider.name,
        url: result.url,
        link_type: result.type,
        confidence: result.confidence,
        is_available: result.type === 'direct' && result.is_available,
        country_code: preferences?.country_code || null,
        last_checked_at: checkedAt,
      }
    }))

    const rows = lookups.flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : [])
    const errors = lookups.flatMap((result, index) => result.status === 'rejected' ? [enabledProviders[index].provider_key] : [])
    const disabledKeys = existing.map(link => link.provider_key).filter(key => !enabledProviders.some(provider => provider.provider_key === key))
    if (disabledKeys.length) {
      const { error } = await serviceClient.from('watch_providers').delete().eq('anime_id', animeId).in('provider_key', disabledKeys)
      if (error) console.error('Could not remove disabled provider links:', error.message)
    }
    if (rows.length) {
      const { error } = await serviceClient.from('watch_providers').upsert(rows, { onConflict: 'anime_id,provider_key' })
      if (error) throw error
    }
    const { data: saved, error: savedError } = await userClient.from('watch_providers')
      .select('id,anime_id,provider_key,provider_name,url,link_type,confidence,is_available,country_code,last_checked_at,created_at,updated_at')
      .eq('anime_id', animeId)
    if (savedError) throw savedError
    return respond({ providers: saved || [], cached: false, errors })
  } catch (error) {
    console.error('find-watch-providers failed:', error?.message || error)
    return respond({ error: error?.message || 'Provider lookup failed.' }, 500)
  }
})
