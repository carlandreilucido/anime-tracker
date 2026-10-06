import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useAuth } from './AuthContext'
import { getProfile } from '../services/profileService'

const ProfileContext = createContext(null)

export function ProfileProvider({ children }) {
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadedUserId, setLoadedUserId] = useState(null)
  const [error, setError] = useState(null)
  const requestId = useRef(0)

  const refreshProfile = useCallback(async () => {
    const currentRequest = ++requestId.current
    if (!user?.id) {
      setProfile(null)
      setError(null)
      setLoading(false)
      setLoadedUserId(null)
      return null
    }
    setProfile(current => current?.id === user.id ? current : null)
    setLoading(true)
    setError(null)
    try {
      const result = await getProfile(user.id)
      if (!result) throw new Error('Your profile is not available yet. Try refreshing in a moment.')
      if (currentRequest !== requestId.current) return null
      setProfile(result)
      setLoadedUserId(user.id)
      return result
    } catch (cause) {
      if (currentRequest !== requestId.current) return null
      setError(cause)
      setLoadedUserId(user.id)
      return null
    } finally {
      if (currentRequest === requestId.current) setLoading(false)
    }
  }, [user?.id])

  useEffect(() => { refreshProfile() }, [refreshProfile])

  const currentProfile = profile?.id === user?.id ? profile : null
  const currentLoading = Boolean(user?.id) && (loading || loadedUserId !== user.id)
  return <ProfileContext.Provider value={{ profile: currentProfile, setProfile, loading: currentLoading, error, refreshProfile }}>{children}</ProfileContext.Provider>
}

export function useProfile() {
  const context = useContext(ProfileContext)
  if (!context) throw new Error('useProfile must be used inside ProfileProvider')
  return context
}
