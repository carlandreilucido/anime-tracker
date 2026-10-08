function isExpiredJwt(response) {
  if (response.status !== 401) return false
  return response.clone().text().then(text => {
    const message = text.toLowerCase()
    return message.includes('jwt expired') || message.includes('token expired') || message.includes('pgrst301')
  }).catch(() => false)
}

let lastDiagnosticAt = 0
function logDiagnostic(message) {
  if (typeof console === 'undefined' || !console.warn) return
  if (Date.now() - lastDiagnosticAt < 10_000) return
  lastDiagnosticAt = Date.now()
  console.warn(`[Supabase auth] ${message}`)
}

async function isMissingApiKey(response) {
  if (response.status !== 401) return false
  return response.clone().text().then(text => /no api key found/i.test(text)).catch(() => false)
}

function isSupabaseApiRequest(request, supabaseOrigin) {
  try {
    const url = new URL(request.url)
    return url.origin === supabaseOrigin && ['/rest/v1/', '/storage/v1/', '/functions/v1/'].some(prefix => url.pathname.startsWith(prefix))
  } catch {
    return false
  }
}

function isPermanentRefreshFailure(error) {
  const status = Number(error?.status)
  const code = String(error?.code || '').toLowerCase()
  return status === 400 || status === 401 || /invalid_grant|refresh_token_not_found|refresh_token_already_used|session_not_found/.test(code)
}

/** Ensure public API key headers and replay one expired database/API request after a shared refresh. */
export function createSupabaseFetch({ url, apiKey, fetchImpl = globalThis.fetch.bind(globalThis), refreshSession, onAuthFailure = () => {} }) {
  const supabaseOrigin = new URL(url).origin
  let refreshInFlight = null

  async function refreshOnce() {
    if (!refreshInFlight) {
      refreshInFlight = Promise.resolve()
        .then(refreshSession)
        .finally(() => { refreshInFlight = null })
    }
    return refreshInFlight
  }

  return async function supabaseFetch(input, init) {
    let original
    try { original = new Request(input, init) }
    catch { return fetchImpl(input, init) }

    let requestUrl
    try { requestUrl = new URL(original.url) }
    catch { return fetchImpl(original) }
    if (requestUrl.origin !== supabaseOrigin) return fetchImpl(original)

    const headers = new Headers(original.headers)
    headers.set('apikey', apiKey)
    const configuredRequest = new Request(original, { headers })
    const firstResponse = await fetchImpl(configuredRequest.clone())
    if (!isSupabaseApiRequest(configuredRequest, supabaseOrigin)) return firstResponse
    const tokenExpired = await isExpiredJwt(firstResponse)
    if (!tokenExpired) {
      if (await isMissingApiKey(firstResponse)) logDiagnostic('The Supabase endpoint rejected the configured public API key. Verify the project URL and Vercel environment variables; no key values were logged.')
      return firstResponse
    }
    logDiagnostic('An expired access token was detected; attempting one shared session refresh.')

    let refreshResult
    try { refreshResult = await refreshOnce() }
    catch (error) {
      logDiagnostic('Session refresh did not complete; the original request was returned for safe error handling.')
      onAuthFailure({ reauthenticate: isPermanentRefreshFailure(error), reason: 'refresh_failed' })
      return firstResponse
    }
    const session = refreshResult?.data?.session || refreshResult?.session || null
    const refreshError = refreshResult?.error || null
    if (refreshError || !session?.access_token) {
      logDiagnostic('Session refresh failed; no credentials or token values were logged.')
      onAuthFailure({
        reauthenticate: isPermanentRefreshFailure(refreshError) || (!refreshError && !session),
        reason: 'refresh_failed',
      })
      return firstResponse
    }

    const retryHeaders = new Headers(configuredRequest.headers)
    retryHeaders.set('apikey', apiKey)
    retryHeaders.set('Authorization', `Bearer ${session.access_token}`)
    const retryResponse = await fetchImpl(new Request(configuredRequest, { headers: retryHeaders }))
    if (await isExpiredJwt(retryResponse)) {
      logDiagnostic('The refreshed session was rejected; requesting a fresh sign-in.')
      onAuthFailure({ reauthenticate: true, reason: 'retry_rejected' })
    } else if (await isMissingApiKey(retryResponse)) {
      logDiagnostic('The Supabase endpoint still reports a missing public API key after the request header was applied.')
    }
    return retryResponse
  }
}
