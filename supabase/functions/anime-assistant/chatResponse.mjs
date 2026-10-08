const INVALID_FORMAT_MESSAGE = 'Kitsu couldn’t format that response. Please try asking again.'

function stripJsonFence(value) {
  return value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
}

function parseMessageJson(value) {
  const normalized = stripJsonFence(value)
  if (!normalized.startsWith('{') && !normalized.startsWith('[') && !normalized.startsWith('"')) return null
  try { return JSON.parse(normalized) } catch { return null }
}

function salvageMessage(value) {
  const match = stripJsonFence(value).match(/["']message["']\s*:\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/s)
  if (!match) return null
  if (match[1].startsWith('"')) {
    try { return JSON.parse(match[1]) } catch { return match[1].slice(1, -1) }
  }
  return match[1].slice(1, -1).replace(/\\'/g, "'")
}

function safeRecommendations(value, includeCatalogMetadata = false) {
  if (!Array.isArray(value)) return []
  return value.slice(0, 3).flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const title = typeof item.title === 'string' ? item.title.trim().slice(0, 120) : ''
    if (!title) return []
    return [{
      title,
      reason: typeof item.reason === 'string' ? item.reason.trim().slice(0, 420) : '',
      ...(includeCatalogMetadata && Array.isArray(item.genres) ? { genres: item.genres.filter(value => typeof value === 'string').slice(0, 8) } : {}),
      ...(includeCatalogMetadata && Number.isInteger(item.episode_count) && item.episode_count >= 0 ? { episode_count: item.episode_count } : {}),
      ...(includeCatalogMetadata && item.tvmaze && typeof item.tvmaze === 'object' ? { tvmaze: item.tvmaze } : {}),
    }]
  })
}

/** Extracts only user-facing message text and allowlisted recommendation fields. */
export function parseAssistantText(input) {
  let value = input
  let recommendations = []
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof value !== 'string') break
    const normalized = stripJsonFence(value)
    const parsed = parseMessageJson(normalized)
    if (typeof parsed === 'string') {
      value = parsed
      continue
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const parsedRecommendations = safeRecommendations(parsed.recommendations)
      if (parsedRecommendations.length) recommendations = parsedRecommendations
      if (typeof parsed.message === 'string') {
        value = parsed.message
        // Some generations accidentally JSON-encode the message field again.
        const nested = parseMessageJson(value)
        if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
          recommendations = safeRecommendations([...recommendations, ...safeRecommendations(nested.recommendations)])
          value = typeof nested.message === 'string' ? nested.message : INVALID_FORMAT_MESSAGE
        }
        continue
      }
      value = INVALID_FORMAT_MESSAGE
      break
    }
    if ((normalized.startsWith('{') || normalized.startsWith('[') || normalized.startsWith('```json')) && !parsed) {
      value = salvageMessage(normalized) || INVALID_FORMAT_MESSAGE
      continue
    }
    value = normalized
    break
  }

  const message = typeof value === 'string' ? value.trim() : ''
  if (!message || message.startsWith('{') || message.startsWith('[')) {
    return { message: INVALID_FORMAT_MESSAGE, recommendations }
  }
  return { message, recommendations }
}

function mergeRecommendations(...collections) {
  const merged = new Map()
  for (const [index, collection] of collections.entries()) {
    for (const item of safeRecommendations(collection, index > 0)) {
      const key = item.title.normalize('NFKC').toLocaleLowerCase()
      const current = merged.get(key)
      merged.set(key, current ? { ...item, ...current, tvmaze: current.tvmaze || item.tvmaze } : item)
    }
  }
  return [...merged.values()].slice(0, 3)
}

/** Normalizes both new Edge Function results and older persisted assistant rows. */
export function normalizeAssistantMessage(message) {
  if (!message || message.role !== 'assistant') return message
  const parsed = parseAssistantText(message.content)
  return {
    ...message,
    content: parsed.message,
    metadata: {
      recommendations: mergeRecommendations(parsed.recommendations, message.metadata?.recommendations),
    },
  }
}
