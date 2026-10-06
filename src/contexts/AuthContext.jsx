import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, hasSupabaseConfig } from '../lib/supabase'

const AuthContext = createContext(null)
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(hasSupabaseConfig)
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setLoading(false) })
    return () => subscription.unsubscribe()
  }, [])
  return <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut: () => supabase?.auth.signOut() }}>{children}</AuthContext.Provider>
}
export const useAuth = () => useContext(AuthContext)
