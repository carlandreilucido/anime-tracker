import test from 'node:test'
import assert from 'node:assert/strict'
import { createSupabaseFetch } from './supabaseFetch.js'

const SUPABASE_URL = 'https://project.supabase.co'
const API_KEY = 'sb_publishable_test_key'
const response = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

test('adds the configured apikey to requests to the shared Supabase origin only', async () => {
  const seen = []
  const fetcher = createSupabaseFetch({
    url: SUPABASE_URL,
    apiKey: API_KEY,
    refreshSession: async () => ({ data: { session: null }, error: null }),
    fetchImpl: async request => {
      seen.push(request)
      if (new URL(request.url).origin === SUPABASE_URL && !request.headers.has('apikey')) return response(401, { message: 'No API key found in request' })
      return response(200, { data: [] })
    },
  })

  const supabaseResult = await fetcher(`${SUPABASE_URL}/rest/v1/anime`)
  const externalResult = await fetcher('https://api.tvmaze.com/search/shows?q=anime')

  assert.equal(supabaseResult.status, 200)
  assert.equal(externalResult.status, 200)
  assert.equal(seen[0].headers.get('apikey'), API_KEY)
  assert.equal(seen[1].headers.has('apikey'), false)
})

test('refreshes once and retries an expired JWT request with the latest access token', async () => {
  let calls = 0
  let refreshes = 0
  const fetcher = createSupabaseFetch({
    url: SUPABASE_URL,
    apiKey: API_KEY,
    refreshSession: async () => {
      refreshes += 1
      return { data: { session: { access_token: 'fresh-access-token' } }, error: null }
    },
    fetchImpl: async request => {
      calls += 1
      if (calls === 1) return response(401, { message: 'JWT expired' })
      assert.equal(request.headers.get('Authorization'), 'Bearer fresh-access-token')
      assert.equal(request.headers.get('apikey'), API_KEY)
      return response(200, { data: [{ id: 1 }] })
    },
  })

  const result = await fetcher(`${SUPABASE_URL}/rest/v1/anime`)
  assert.equal(result.status, 200)
  assert.equal(calls, 2)
  assert.equal(refreshes, 1)
})

test('coalesces concurrent expired requests into one session refresh', async () => {
  let refreshes = 0
  let initialRequests = 0
  const fetcher = createSupabaseFetch({
    url: SUPABASE_URL,
    apiKey: API_KEY,
    refreshSession: async () => {
      refreshes += 1
      await new Promise(resolve => setTimeout(resolve, 5))
      return { data: { session: { access_token: 'shared-fresh-token' } }, error: null }
    },
    fetchImpl: async request => {
      if (!request.headers.get('Authorization')?.includes('shared-fresh-token')) {
        initialRequests += 1
        return response(401, { message: 'JWT expired' })
      }
      return response(200, { data: [] })
    },
  })

  const results = await Promise.all([
    fetcher(`${SUPABASE_URL}/rest/v1/anime`),
    fetcher(`${SUPABASE_URL}/rest/v1/profiles`),
  ])
  assert.equal(initialRequests, 2)
  assert.equal(refreshes, 1)
  assert.deepEqual(results.map(result => result.status), [200, 200])
})

test('does not refresh on unrelated 401 responses or retry more than once', async () => {
  let refreshes = 0
  let calls = 0
  const fetcher = createSupabaseFetch({
    url: SUPABASE_URL,
    apiKey: API_KEY,
    refreshSession: async () => { refreshes += 1; return { data: { session: { access_token: 'fresh' } }, error: null } },
    fetchImpl: async () => { calls += 1; return response(401, { message: 'Permission denied' }) },
  })
  const result = await fetcher(`${SUPABASE_URL}/rest/v1/anime`)
  assert.equal(result.status, 401)
  assert.equal(calls, 1)
  assert.equal(refreshes, 0)
})

test('signals reauthentication when the refresh token is permanently invalid', async () => {
  let authFailure
  let calls = 0
  const fetcher = createSupabaseFetch({
    url: SUPABASE_URL,
    apiKey: API_KEY,
    refreshSession: async () => ({ data: { session: null }, error: { status: 400, code: 'refresh_token_not_found' } }),
    onAuthFailure: detail => { authFailure = detail },
    fetchImpl: async () => { calls += 1; return response(401, { message: 'JWT expired' }) },
  })
  const result = await fetcher(`${SUPABASE_URL}/rest/v1/anime`)
  assert.equal(result.status, 401)
  assert.equal(calls, 1)
  assert.equal(authFailure?.reauthenticate, true)
})

test('does not request sign-in after a transient refresh network failure', async () => {
  let authFailure
  const fetcher = createSupabaseFetch({
    url: SUPABASE_URL,
    apiKey: API_KEY,
    refreshSession: async () => ({ data: { session: null }, error: { status: 0, code: 'AuthRetryableFetchError' } }),
    onAuthFailure: detail => { authFailure = detail },
    fetchImpl: async () => response(401, { message: 'JWT expired' }),
  })
  const result = await fetcher(`${SUPABASE_URL}/rest/v1/anime`)
  assert.equal(result.status, 401)
  assert.equal(authFailure?.reauthenticate, false)
})
