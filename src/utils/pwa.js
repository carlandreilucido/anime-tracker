export function isRunningStandalone(browserWindow = window) {
  return Boolean(
    browserWindow.matchMedia?.('(display-mode: standalone)').matches
    || browserWindow.navigator?.standalone === true,
  )
}

export function getInstallPlatform({ userAgent = '', platform = '', maxTouchPoints = 0 } = {}) {
  if (/iphone|ipad|ipod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1)) return 'ios'
  if (/android/i.test(userAgent)) return 'android'
  return 'other'
}
