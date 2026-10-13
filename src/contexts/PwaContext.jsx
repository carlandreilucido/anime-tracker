import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

const PwaContext = createContext(null)

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function PwaProvider({ children }) {
  const [installPrompt, setInstallPrompt] = useState(null)
  const [installed, setInstalled] = useState(false)
  const [ios, setIos] = useState(false)
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (registration) window.setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000)
    },
  })

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)')
    const checkInstalled = () => setInstalled(standalone.matches || window.navigator.standalone === true)
    const onInstallPrompt = event => {
      event.preventDefault()
      setInstallPrompt(event)
    }
    const onInstalled = () => {
      setInstalled(true)
      setInstallPrompt(null)
    }
    checkInstalled()
    setIos(isIosDevice())
    standalone.addEventListener?.('change', checkInstalled)
    window.addEventListener('beforeinstallprompt', onInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      standalone.removeEventListener?.('change', checkInstalled)
      window.removeEventListener('beforeinstallprompt', onInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const value = useMemo(() => ({
    installed,
    ios,
    canPromptInstall: Boolean(installPrompt),
    async install() {
      if (!installPrompt) return false
      await installPrompt.prompt()
      const result = await installPrompt.userChoice
      setInstallPrompt(null)
      if (result?.outcome === 'accepted') setInstalled(true)
      return result?.outcome === 'accepted'
    },
  }), [installed, ios, installPrompt])

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
