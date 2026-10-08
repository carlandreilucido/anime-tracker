export function progressPercent(anime) { return anime.total_episodes > 0 ? Math.min(100, Math.round((anime.current_episode / anime.total_episodes) * 100)) : 0 }
export function timeAgo(date) { if (!date) return ''; const seconds = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000)); if (seconds < 60) return 'just now'; if (seconds < 3600) return `${Math.floor(seconds/60)}m ago`; if (seconds < 86400) return `${Math.floor(seconds/3600)}h ago`; if (seconds < 604800) return `${Math.floor(seconds/86400)}d ago`; return new Date(date).toLocaleDateString() }
export function readableError(error) {
  const message = String(error?.message || '')
  const code = String(error?.code || '')
  if (/jwt expired|pgrst301/i.test(message) || code.toUpperCase() === 'PGRST301') return 'Your sign-in session needs refreshing. Check your connection and retry; if it continues, sign in again.'
  if (/no api key found|invalid api key|invalid apikey/i.test(message)) return 'Supabase is missing its public API key. Check VITE_SUPABASE_ANON_KEY for this deployment and redeploy.'
  return message || 'Something went wrong. Please try again.'
}
