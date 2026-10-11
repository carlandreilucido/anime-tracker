export const OFFLINE_MESSAGE = "You're offline. Please check your internet connection and try again."
export const INTERRUPTED_MESSAGE = 'Your connection was interrupted. Please reconnect and try again.'
export const TIMEOUT_MESSAGE = 'The request took too long. Please check your connection and try again.'
export const SERVER_MESSAGE = "We're having trouble connecting to the server. Please try again later."

export function classifyNetworkError(error, wasOnline = typeof navigator === 'undefined' || navigator.onLine) {
  const status = Number(error?.status ?? error?.context?.status)
  const text = `${error?.name || ''} ${error?.message || ''}`.toLowerCase()
  if (status === 401) return 'auth'
  if (status === 400 || status === 422) return 'invalid'
  if (status === 408 || status === 504 || /timeout|timed out|aborterror/.test(text)) return 'timeout'
  if (status >= 500 || status === 429) return 'server'
  if (!wasOnline) return 'offline'
  if (/failed to fetch|networkerror|network request failed|fetch failed|load failed|connection/.test(text)) return 'interrupted'
  return 'unexpected'
}

export function authErrorMessage(error) {
  const code = String(error?.code || '').toLowerCase()
  const message = String(error?.message || '').toLowerCase()
  if (code === 'invalid_credentials' || /invalid login credentials/.test(message)) return 'Invalid email or password. Please try again.'
  const kind = classifyNetworkError(error)
  if (kind === 'offline') return OFFLINE_MESSAGE
  if (kind === 'interrupted') return INTERRUPTED_MESSAGE
  if (kind === 'timeout') return TIMEOUT_MESSAGE
  if (kind === 'server') return SERVER_MESSAGE
  return 'Something went wrong. Please try again.'
}
