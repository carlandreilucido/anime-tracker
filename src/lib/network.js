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
  const status = Number(error?.status ?? error?.context?.status)
  if (status === 429 || ['over_email_send_rate_limit', 'over_request_rate_limit', 'over_sms_send_rate_limit'].includes(code)) return 'Too many attempts. Please wait before trying again.'
  if (code === 'invalid_credentials') return 'Invalid email or password. Please try again.'
  const kind = classifyNetworkError(error)
  if (kind === 'offline' || kind === 'interrupted' || kind === 'timeout') return 'Unable to connect. Please check your internet connection and try again.'
  if (kind === 'server') return 'Unable to connect to the server. Please check your connection and try again.'
  return 'Something went wrong. Please try again.'
}
