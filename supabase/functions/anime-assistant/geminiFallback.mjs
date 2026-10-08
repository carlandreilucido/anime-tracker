// This allowlist is intentionally stricter than the Gemini Models API. Google’s
// model list proves availability/capabilities, not free-tier pricing. IDs here
// are reviewed against Google’s official models and pricing pages (2026-10-09).
import { parseAssistantText } from './chatResponse.mjs'

export const FREE_TIER_MODEL_PRIORITY = Object.freeze([
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
])

export const FRIENDLY_UNAVAILABLE = 'Kitsu AI is temporarily unavailable. Please try again in a few minutes.'
export const MAX_FALLBACK_ATTEMPTS = 3
export const PER_ATTEMPT_TIMEOUT_MS = 12_000
export const OVERALL_DEADLINE_MS = 39_000
const DISCOVERY_TIMEOUT_MS = 8_000
const MAX_MODEL_PAGES = 10

export function configuredModelPriority(value = '') {
  const configured = String(value).split(',').map(model => model.trim()).filter(Boolean)
  const safeConfigured = configured.filter((model, index) => FREE_TIER_MODEL_PRIORITY.includes(model)
    && configured.indexOf(model) === index)
  return [...safeConfigured, ...FREE_TIER_MODEL_PRIORITY.filter(model => !safeConfigured.includes(model))]
}

export function eligibleModelsFromApi(models, priority = FREE_TIER_MODEL_PRIORITY) {
  if (!Array.isArray(models)) return []
  const available = new Set(models
    .filter(model => Array.isArray(model?.supportedGenerationMethods)
      && model.supportedGenerationMethods.includes('generateContent'))
    .map(model => String(model?.name || '').replace(/^models\//, '')))
  return priority.filter(model => FREE_TIER_MODEL_PRIORITY.includes(model) && available.has(model))
}

export async function discoverGeminiModels(apiKey, {
  fetchImpl = fetch,
  signal,
} = {}) {
  if (!apiKey) throw Object.assign(new Error('Missing API key'), { kind: 'credentials' })
  const discovered = []
  let pageToken = ''
  for (let page = 0; page < MAX_MODEL_PAGES; page += 1) {
    const url = new URL('https://generativelanguage.googleapis.com/v1beta/models')
    url.searchParams.set('pageSize', '100')
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS)
    try {
      const response = await fetchImpl(url, {
        headers: { 'x-goog-api-key': apiKey, Accept: 'application/json' },
        signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        const kind = response.status === 401 || response.status === 403 ? 'credentials' : 'discovery'
        throw Object.assign(new Error('Gemini model discovery failed'), { kind, status: response.status, payload })
      }
      const payload = await response.json()
      if (!Array.isArray(payload?.models)) throw Object.assign(new Error('Invalid model list'), { kind: 'discovery' })
      discovered.push(...payload.models)
      pageToken = typeof payload.nextPageToken === 'string' ? payload.nextPageToken : ''
      if (!pageToken) return discovered
    } finally {
      clearTimeout(timeout)
    }
  }
  return discovered
}

function retryAfterSeconds(headers) {
  const value = headers?.get?.('Retry-After')
  if (!value) return 0
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(3600, Math.ceil(seconds))
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, Math.min(3600, Math.ceil((date - Date.now()) / 1000))) : 0
}

function flattenError(payload) {
  const error = payload?.error
  const details = Array.isArray(error?.details) ? error.details : []
  // Google's QuotaFailure violations can be nested under details[].violations[].
  const detailText = JSON.stringify(details).slice(0, 4000)
  return `${error?.status || ''} ${error?.message || ''} ${detailText}`.toLowerCase()
}

export function classifyGeminiFailure(status, payload, headers) {
  const text = flattenError(payload)
  const retryAfter = retryAfterSeconds(headers)
  if (status === 401 || status === 403 || /api key not valid|invalid api key|api_key_invalid|unauthenticated|permission_denied/.test(text)) {
    return { action: 'stop', category: 'credentials', cooldownSeconds: 0 }
  }
  if (status === 429) {
    const modelScopedDailyQuota = /(daily|per.?day|day quota)/.test(text)
      && /(model|per.?model|model_id)/.test(text)
    const projectQuota = /(project.?wide|project quota|billing account|account.?wide)/.test(text)
      || (/(daily|per.?day|day quota)/.test(text) && !modelScopedDailyQuota)
    if (projectQuota) return { action: 'stop', category: 'project_quota', cooldownSeconds: 0 }
    return {
      action: 'fallback',
      category: modelScopedDailyQuota ? 'model_daily_quota' : 'model_rate_limit',
      cooldownSeconds: modelScopedDailyQuota ? 86_400 : Math.max(20, retryAfter),
    }
  }
  if (status === 404) return { action: 'fallback', category: 'model_unavailable', cooldownSeconds: 86_400 }
  if ([500, 502, 503, 504].includes(status)) {
    return { action: 'fallback', category: 'temporary_server_error', cooldownSeconds: Math.max(20, retryAfter) }
  }
  return { action: 'stop', category: 'invalid_request', cooldownSeconds: 0 }
}

export function buildGeminiRequestBody(systemInstruction, contents) {
  return {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents,
    generationConfig: {
      temperature: 0.65,
      maxOutputTokens: 900,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          message: { type: 'STRING' },
          recommendations: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: { title: { type: 'STRING' }, reason: { type: 'STRING' } },
              required: ['title', 'reason'],
              propertyOrdering: ['title', 'reason'],
            },
          },
        },
        required: ['message', 'recommendations'],
        propertyOrdering: ['message', 'recommendations'],
      },
    },
  }
}

function parseGeneratedResponse(payload) {
  if (payload?.promptFeedback?.blockReason) return { blocked: true }
  const candidate = payload?.candidates?.[0]
  if (candidate?.finishReason === 'SAFETY' || candidate?.finishReason === 'BLOCKLIST') return { blocked: true }
  const text = candidate?.content?.parts?.map(part => part?.text || '').join('') || ''
  if (!text) throw Object.assign(new Error('Empty Gemini response'), { kind: 'invalid_response' })
  return parseAssistantText(text)
}

export async function generateWithFallback({
  apiKey,
  models,
  cooledModels = new Set(),
  contents,
  systemInstruction,
  maxAttempts = MAX_FALLBACK_ATTEMPTS,
  perAttemptTimeoutMs = PER_ATTEMPT_TIMEOUT_MS,
  overallDeadlineMs = OVERALL_DEADLINE_MS,
  fetchImpl = fetch,
  onFailure = async () => {},
  onSuccess = async () => {},
}) {
  const queue = models.filter(model => FREE_TIER_MODEL_PRIORITY.includes(model) && !cooledModels.has(model))
    .slice(0, Math.max(1, Math.min(MAX_FALLBACK_ATTEMPTS, maxAttempts)))
  if (!apiKey || cooledModels.has('__project__') || !queue.length) {
    throw Object.assign(new Error(FRIENDLY_UNAVAILABLE), { kind: 'unavailable' })
  }

  const deadline = Date.now() + Math.min(overallDeadlineMs, OVERALL_DEADLINE_MS)
  const body = JSON.stringify(buildGeminiRequestBody(systemInstruction, contents))
  for (const model of queue) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) break
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), Math.min(perAttemptTimeoutMs, remaining))
    try {
      const response = await fetchImpl(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        { method: 'POST', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body },
      )
      if (response.ok) {
        const parsed = parseGeneratedResponse(await response.json())
        if (parsed.blocked) return { blocked: true }
        try { await onSuccess(model) } catch { /* Health persistence must not repeat a successful generation. */ }
        return { ...parsed, model }
      }
      const payload = await response.json().catch(() => null)
      const failure = classifyGeminiFailure(response.status, payload, response.headers)
      try { await onFailure(model, failure) } catch { /* The fallback decision must not depend on telemetry persistence. */ }
      if (failure.action === 'stop') break
    } catch (cause) {
      if (cause?.kind === 'invalid_response') throw cause
      if (controller.signal.aborted && Date.now() >= deadline) break
      try {
        await onFailure(model, { action: 'fallback', category: 'network_or_timeout', cooldownSeconds: 30 })
      } catch { /* The fallback decision must not depend on telemetry persistence. */ }
    } finally {
      clearTimeout(timeout)
    }
  }
  throw Object.assign(new Error(FRIENDLY_UNAVAILABLE), { kind: 'unavailable' })
}
