import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import React from 'react'
import ReactMarkdown from 'react-markdown'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  FREE_TIER_MODEL_PRIORITY,
  FRIENDLY_UNAVAILABLE,
  buildGeminiRequestBody,
  classifyGeminiFailure,
  configuredModelPriority,
  discoverGeminiModels,
  eligibleModelsFromApi,
  generateWithFallback,
} from './geminiFallback.mjs'
import { normalizeAssistantMessage, parseAssistantText } from './chatResponse.mjs'

const modelList = FREE_TIER_MODEL_PRIORITY.map(name => ({
  name: `models/${name}`,
  supportedGenerationMethods: ['generateContent'],
}))

function geminiResponse(status, message = 'temporary failure', headers = {}) {
  if (status === 200) {
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ message, recommendations: [] }) }] } }],
    }), { status, headers })
  }
  return new Response(JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED', message } }), { status, headers })
}

const generate = (overrides = {}) => generateWithFallback({
  apiKey: 'test-key',
  models: FREE_TIER_MODEL_PRIORITY.slice(0, 4),
  contents: [{ role: 'user', parts: [{ text: 'User question: Recommend anime similar to Dragon Ball' }] }],
  systemInstruction: 'Kitsu system instruction',
  fetchImpl: async () => geminiResponse(200, 'Try One Piece.'),
  ...overrides,
})

test('the primary eligible model succeeds without a fallback request', async () => {
  const calls = []
  const result = await generate({ fetchImpl: async url => {
    calls.push(String(url))
    return geminiResponse(200, 'Try One Piece.')
  } })
  assert.equal(result.message, 'Try One Piece.')
  assert.equal(calls.length, 1)
  assert.match(calls[0], /gemini-3\.8-flash/)
})

test('429 model rate limit falls through and observes Retry-After in cooldown metadata', async () => {
  const calls = []
  const failures = []
  const result = await generate({ fetchImpl: async url => {
    calls.push(String(url))
    return calls.length === 1
      ? geminiResponse(429, 'Per-minute request limit for this model', { 'Retry-After': '45' })
      : geminiResponse(200, 'Fallback answer')
  }, onFailure: async (model, failure) => failures.push({ model, ...failure }) })
  assert.equal(result.message, 'Fallback answer')
  assert.equal(calls.length, 2)
  assert.equal(failures[0].category, 'model_rate_limit')
  assert.equal(failures[0].cooldownSeconds, 45)
})

test('503 overload falls through to the next eligible model', async () => {
  let calls = 0
  const result = await generate({ fetchImpl: async () => ++calls === 1
    ? geminiResponse(503, 'Model overloaded')
    : geminiResponse(200, 'Recovered') })
  assert.equal(result.message, 'Recovered')
  assert.equal(calls, 2)
})

test('a timed-out attempt falls through within the overall request deadline', async () => {
  let calls = 0
  const result = await generate({ perAttemptTimeoutMs: 5, overallDeadlineMs: 100,
    fetchImpl: async (_url, { signal }) => {
      calls += 1
      if (calls > 1) return geminiResponse(200, 'Recovered after timeout')
      return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')), { once: true }))
    } })
  assert.equal(result.message, 'Recovered after timeout')
  assert.equal(calls, 2)
})

test('404 deprecated model is cooled down and the next model succeeds', async () => {
  let calls = 0
  const failures = []
  const result = await generate({ fetchImpl: async () => ++calls === 1
    ? geminiResponse(404, 'Model not found')
    : geminiResponse(200, 'Available fallback'),
  onFailure: async (model, failure) => failures.push({ model, ...failure }) })
  assert.equal(result.message, 'Available fallback')
  assert.equal(failures[0].category, 'model_unavailable')
  assert.equal(failures[0].cooldownSeconds, 86_400)
})

test('multiple models can fail before a later eligible model succeeds', async () => {
  let calls = 0
  const result = await generate({ models: FREE_TIER_MODEL_PRIORITY.slice(0, 3), fetchImpl: async () => {
    calls += 1
    return calls < 3 ? geminiResponse(calls === 1 ? 429 : 503) : geminiResponse(200, 'Third model answer')
  } })
  assert.equal(result.message, 'Third model answer')
  assert.equal(calls, 3)
})

test('every eligible attempt failing returns only the friendly unavailable error', async () => {
  await assert.rejects(generate({ models: FREE_TIER_MODEL_PRIORITY.slice(0, 3), fetchImpl: async () => geminiResponse(503) }),
    error => error.message === FRIENDLY_UNAVAILABLE)
})

test('invalid Gemini credentials stop immediately without trying another model', async () => {
  let calls = 0
  await assert.rejects(generate({ fetchImpl: async () => {
    calls += 1
    return new Response(JSON.stringify({ error: { status: 'UNAUTHENTICATED', message: 'API key not valid' } }), { status: 401 })
  } }), error => error.message === FRIENDLY_UNAVAILABLE)
  assert.equal(calls, 1)
})

test('model-specific daily quota is classified separately and can use another model', async () => {
  const failure = classifyGeminiFailure(429, { error: {
    status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded; retry later.',
    details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel' }] }],
  } })
  assert.equal(failure.action, 'fallback')
  assert.equal(failure.category, 'model_daily_quota')
  assert.equal(failure.cooldownSeconds, 86_400)
})

test('project-wide daily quota stops fallback and can be persisted as a shared cooldown', async () => {
  const failure = classifyGeminiFailure(429, { error: {
    status: 'RESOURCE_EXHAUSTED', message: 'Daily quota exhausted for the project',
  } })
  assert.equal(failure.action, 'stop')
  assert.equal(failure.category, 'project_quota')
})

test('project-wide quota does not try another model and reports a shared cooldown category', async () => {
  let calls = 0
  const failures = []
  await assert.rejects(generate({ fetchImpl: async () => {
    calls += 1
    return geminiResponse(429, 'Project-wide daily quota exhausted')
  }, onFailure: async (model, failure) => failures.push({ model, ...failure }) }),
  error => error.message === FRIENDLY_UNAVAILABLE)
  assert.equal(calls, 1)
  assert.equal(failures[0].category, 'project_quota')
})

test('conversation history and personalized library context are identical across fallback attempts', async () => {
  const calls = []
  const contents = [
    { role: 'user', parts: [{ text: 'Earlier question' }] },
    { role: 'model', parts: [{ text: 'Earlier answer' }] },
    { role: 'user', parts: [{ text: 'Untrusted library facts: Naruto; favorite genre: action' }] },
  ]
  await generate({ contents, fetchImpl: async (_url, init) => {
    calls.push(JSON.parse(init.body))
    return calls.length === 1 ? geminiResponse(503) : geminiResponse(200, 'Personalized answer')
  } })
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[0].contents, contents)
  assert.deepEqual(calls[1].contents, contents)
  assert.deepEqual(calls[0].systemInstruction, calls[1].systemInstruction)
})

test('paid-only, image, audio, preview, and unlisted models are never selected', () => {
  const discovered = [
    ...modelList,
    { name: 'models/gemini-3.1-pro-preview', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3.1-flash-image', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3.8-flash-tts', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-new-experimental', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['embedContent'] },
  ]
  const eligible = eligibleModelsFromApi(discovered)
  assert.deepEqual(eligible, FREE_TIER_MODEL_PRIORITY)
  assert.ok(!eligible.some(model => /preview|image|tts|experimental|pro/.test(model)))
})

test('server-configured ordering is constrained to the reviewed free-tier allowlist', () => {
  assert.deepEqual(configuredModelPriority('gemini-3.5-flash-lite,gemini-paid-pro,gemini-3.8-flash').slice(0, 2),
    ['gemini-3.5-flash-lite', 'gemini-3.8-flash'])
})

test('official model discovery paginates and uses the API key in a header', async () => {
  const requests = []
  const discovered = await discoverGeminiModels('secret-test-key', { fetchImpl: async (url, init) => {
    requests.push({ url: String(url), headers: init.headers })
    return requests.length === 1
      ? Response.json({ models: modelList.slice(0, 1), nextPageToken: 'next-page' })
      : Response.json({ models: modelList.slice(1) })
  } })
  assert.equal(discovered.length, modelList.length)
  assert.equal(requests.length, 2)
  assert.equal(requests[0].headers['x-goog-api-key'], 'secret-test-key')
  assert.ok(!requests[0].url.includes('secret-test-key'))
})

test('Gemini safety blocks do not switch models', async () => {
  let calls = 0
  const result = await generate({ fetchImpl: async () => {
    calls += 1
    return Response.json({ promptFeedback: { blockReason: 'SAFETY' } })
  } })
  assert.equal(result.blocked, true)
  assert.equal(calls, 1)
})

test('structured Gemini output renders only the message and keeps recommendation fields', () => {
  const parsed = parseAssistantText(JSON.stringify({
    message: 'Here are three **great picks**:\n\n- Start with One Piece.',
    recommendations: [{ title: 'One Piece', reason: 'Long-running adventure.', genres: ['Invented genre'], episode_count: 1,
      tvmaze: { url: 'https://attacker.example/collect', image: 'https://attacker.example/pixel.png' } }],
    model: 'private-model-id', debug: 'internal detail',
  }))
  assert.equal(parsed.message, 'Here are three **great picks**:\n\n- Start with One Piece.')
  assert.deepEqual(parsed.recommendations, [{
    title: 'One Piece', reason: 'Long-running adventure.',
  }])
  assert.ok(!parsed.message.includes('private-model-id'))
  assert.ok(!parsed.message.startsWith('{'))
})

test('fenced and nested JSON responses are unwrapped without exposing the wrapper', () => {
  const value = '```json\n' + JSON.stringify({ message: JSON.stringify({ message: 'A **bold** answer.', recommendations: [] }) }) + '\n```'
  assert.equal(parseAssistantText(value).message, 'A **bold** answer.')
})

test('normal Markdown answers and follow-up text remain unchanged', () => {
  const markdown = 'Try **Fullmetal Alchemist: Brotherhood**.\n\n- Strong characters\n- Complete story'
  assert.equal(parseAssistantText(markdown).message, markdown)
})

test('the chat Markdown renderer produces paragraphs, emphasis, and semantic lists without raw HTML', () => {
  const markdown = 'A **bold** recommendation.\n\n- First\n- Second\n\n<script>alert(1)</script>'
  const html = renderToStaticMarkup(React.createElement(ReactMarkdown, null, markdown))
  assert.match(html, /<p>A <strong>bold<\/strong> recommendation\.<\/p>/)
  assert.match(html, /<ul>\s*<li>First<\/li>\s*<li>Second<\/li>\s*<\/ul>/)
  assert.ok(!html.includes('<script>'))
})

test('malformed JSON is salvaged when possible and replaced with friendly text otherwise', () => {
  assert.equal(parseAssistantText('{"message":"A readable answer", "recommendations": [').message, 'A readable answer')
  assert.match(parseAssistantText('{"debug": {broken').message, /couldn’t format/i)
})

test('persisted recommendation metadata is merged with recovered JSON for old chat rows', () => {
  const row = normalizeAssistantMessage({
    role: 'assistant',
    content: JSON.stringify({ message: 'Here are picks.', recommendations: [{ title: 'One Piece', reason: 'Adventure.' }] }),
    metadata: { recommendations: [{
      title: 'One Piece', reason: 'Verified reason.', tvmaze: { id: 1, name: 'One Piece', genres: ['Adventure'], episode_count: 1000 },
    }] },
  })
  assert.equal(row.content, 'Here are picks.')
  assert.equal(row.metadata.recommendations.length, 1)
  assert.equal(row.metadata.recommendations[0].tvmaze.episode_count, 1000)
  assert.equal(normalizeAssistantMessage({ role: 'user', content: '{"message":"keep user text"}' }).content,
    '{"message":"keep user text"}')
})

test('existing database constraints keep assistant responses unique and rate limiting atomic', async () => {
  const sql = await readFile(new URL('../../migrations/202610090001_ai_anime_assistant.sql', import.meta.url), 'utf8')
  assert.match(sql, /unique \(user_id, conversation_id, client_request_id, role\)/)
  assert.match(sql, /on conflict \(user_id\) do update set/)
  assert.match(sql, /public\.ai_chat_rate_limits\.request_count \+ 1/)
  assert.match(sql, /return request_count <= 12/)
  const body = buildGeminiRequestBody('system', [{ role: 'user', parts: [{ text: 'same request' }] }])
  assert.equal(body.contents[0].parts[0].text, 'same request')
})
