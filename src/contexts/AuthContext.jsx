import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { supabase, hasSupabaseConfig } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [isRecovering, setIsRecovering] = useState(false)
  const [loading, setLoading] = useState(hasSupabaseConfig)
  const [authNotice, setAuthNotice] = useState('')
  const sessionRef = useRef(null)
  const explicitSignOut = useRef(false)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return undefined
    }

    let mounted = true
    let authEventsSeen = 0
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return
      authEventsSeen += 1
      const previousSession = sessionRef.current
      sessionRef.current = nextSession

      if (event === 'PASSWORD_RECOVERY') setIsRecovering(true)
      else if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED' || event === 'SIGNED_OUT' || event === 'USER_DELETED') setIsRecovering(false)

      if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
        setSession(null)
        if (previousSession && !explicitSignOut.current) {
          setAuthNotice('Your sign-in session expired and could not be recovered. Please sign in again.')
        }
        explicitSignOut.current = false
      } else {
        setSession(nextSession)
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          setAuthNotice('')
          explicitSignOut.current = false
        }
      }
      setLoading(false)
    })

    // Subscribe before restoring storage: an auth event wins over a stale getSession result.
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return
      if (authEventsSeen === 0) {
        sessionRef.current = data.session
        setSession(data.session)
      }
      if (error && !data.session) sessionRef.current = null
      setLoading(false)
    }).catch(() => {
      if (mounted) setLoading(false)
    })

    const handleRecoveryFailure = event => {
      if (!mounted || !event.detail?.reauthenticate) return
      setAuthNotice('Your sign-in session expired and could not be recovered. Please sign in again.')
      // Clear only a session whose refresh token is invalid; transient network errors do not sign out.
      supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    }
    window.addEventListener('kitsu:session-recovery-failed', handleRecoveryFailure)

    return () => {
      mounted = false
      subscription.unsubscribe()
      window.removeEventListener('kitsu:session-recovery-failed', handleRecoveryFailure)
    }
  }, [])

  const signOut = useCallback(async () => {
    explicitSignOut.current = true
    setAuthNotice('')
    if (!supabase) return { error: null }
    const result = await supabase.auth.signOut()
    if (result.error) explicitSignOut.current = false
    return result
  }, [])

  const clearAuthNotice = useCallback(() => setAuthNotice(''), [])
  const user = isRecovering ? null : session?.user ?? null

  return <AuthContext.Provider value={{
    session,
    user,
    loading,
    authNotice,
    clearAuthNotice,
    signOut,
  }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
