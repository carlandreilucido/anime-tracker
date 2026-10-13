import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { getInstallPlatform, isRunningStandalone } from '../utils/pwa'

const PwaContext = createContext(null)

export function PwaProvider({ children }) {
  const [installPrompt, setInstallPrompt] = useState(null)
  const [installed, setInstalled] = useState(false)
  const [platform, setPlatform] = useState('other')
  const [installMessage, setInstallMessage] = useState('')
  const registrationRef = useRef(null)
  const updateTimerRef = useRef(null)
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      registrationRef.current = registration || null
      if (updateTimerRef.current) window.clearInterval(updateTimerRef.current)
      if (registration) {
        updateTimerRef.current = window.setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000)
      }
    },
  })

  const refreshBrowserState = useCallback(() => {
    setInstalled(isRunningStandalone(window))
    registrationRef.current?.update().catch(() => {})
  }, [])

  useEffect(() => {
    const displayMode = window.matchMedia('(display-mode: standalone)')
    const updateStandalone = () => setInstalled(isRunningStandalone(window))
    const onInstallPrompt = event => {
      // Save the browser's one-shot prompt for a direct user click. Its absence
      // means only that this browser did not offer a prompt, not that it is installed.
      event.preventDefault()
      if (isRunningStandalone(window)) return
      setInstallPrompt(event)
      setInstallMessage('')
    }
    const onInstalled = () => {
      setInstallPrompt(null)
      setInstallMessage('Kitsu was added. Open it from your home screen or app launcher.')
      updateStandalone()
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshBrowserState()
    }

    setPlatform(getInstallPlatform(navigator))
    updateStandalone()
    displayMode.addEventListener?.('change', updateStandalone)
    window.addEventListener('beforeinstallprompt', onInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    window.addEventListener('pageshow', refreshBrowserState)
    window.addEventListener('focus', refreshBrowserState)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      displayMode.removeEventListener?.('change', updateStandalone)
      window.removeEventListener('beforeinstallprompt', onInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
      window.removeEventListener('pageshow', refreshBrowserState)
      window.removeEventListener('focus', refreshBrowserState)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if (updateTimerRef.current) window.clearInterval(updateTimerRef.current)
    }
  }, [refreshBrowserState])

  const install = useCallback(async () => {
    const promptEvent = installPrompt
    if (!promptEvent || installed) return false
    try {
      // Must be called synchronously from the Settings button's click gesture.
      const choice = promptEvent.prompt()
      const result = await (choice && typeof choice.then === 'function' ? choice : promptEvent.userChoice)
      const userChoice = result?.outcome ? result : await promptEvent.userChoice
      setInstallPrompt(null) // Browser prompts are one-shot; never reuse this event.
      if (userChoice?.outcome === 'accepted') {
        setInstallMessage('Installation was accepted. If Kitsu does not appear in your launcher, see the reinstall tips below.')
        return true
      }
      setInstallMessage('Installation was dismissed. You can use the browser menu to try again.')
      return false
    } catch {
      setInstallPrompt(null)
      setInstallMessage('The installation prompt is no longer available. Use your browser menu or reload Kitsu and try again.')
      return false
    }
  }, [installPrompt, installed])

  const value = useMemo(() => ({
    installed,
    platform,
    installMessage,
    canPromptInstall: Boolean(installPrompt) && !installed,
    install,
  }), [installed, platform, installMessage, installPrompt, install])

  return <PwaContext.Provider value={value}>
    {children}
    {needRefresh && <div className="pwa-update-notice" role="status">
      <span>A Kitsu update is ready.</span>
      <button type="button" onClick={() => updateServiceWorker(true)}>Reload</button>
    </div>}
  </PwaContext.Provider>
}

export function usePwa() {
  const context = useContext(PwaContext)
  if (!context) throw new Error('usePwa must be used inside PwaProvider')
  return context
}
