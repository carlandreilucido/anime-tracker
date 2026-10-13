import { useState } from 'react'
import { Download } from 'lucide-react'
import { usePwa } from '../../contexts/PwaContext'

export default function PwaInstallCard() {
  const { installed, platform, installMessage, canPromptInstall, install } = usePwa()
  const [showHelp, setShowHelp] = useState(false)

  return <section className="profile-card pwa-install-card">
    <div className="settings-icon"><Download size={20}/></div>
    <div className="pwa-install-copy">
      <h2>Install Kitsu</h2>
      <p>Get quick access from your home screen or desktop, with Kitsu in its own app window.</p>
      {installed
        ? <p className="privacy-feedback success" role="status">Installed — Kitsu is running in standalone mode.</p>
        : canPromptInstall
          ? <button type="button" className="primary-btn" onClick={install}><Download size={15}/> Install Kitsu</button>
          : <button type="button" className="outline-btn" onClick={() => setShowHelp(value => !value)}>{showHelp ? 'Hide instructions' : 'Installation options & troubleshooting'}</button>}
      {installMessage && !installed && <p className="privacy-feedback" role="status">{installMessage}</p>}
      {showHelp && !installed && <div className="pwa-install-help">
        {platform === 'ios' ? <>
          <strong>Install from Safari on iPhone or iPad</strong>
          <ol><li>Open this site in Safari (not an in-app browser).</li><li>Tap Share.</li><li>Choose <b>Add to Home Screen</b>, then tap <b>Add</b>.</li></ol>
        </> : platform === 'android' ? <>
          <strong>Install or reinstall with Chrome on Android</strong>
          <ol><li>Open Kitsu in Chrome and use its menu to choose <b>Install app</b> or <b>Add to Home screen</b>.</li><li>If you only removed the home-screen shortcut, use the menu to add it again.</li><li>If Chrome says it is installed but you cannot find it, search the app drawer and check Android <b>Settings → Apps</b> for Kitsu. Uninstall it there if it is still listed, then reopen Chrome and try again.</li></ol>
          <p>Chrome or Android may retain installation state temporarily. A website cannot inspect or remove Android's installed WebAPK; if the conflict remains after checking Android Settings, restart/update Chrome or contact device support.</p>
        </> : <>
          <strong>Install from your browser</strong>
          <ol><li>Open Kitsu over HTTPS in a supported browser.</li><li>Open the browser menu and choose <b>Install Kitsu</b> or <b>Install app</b>.</li><li>If unavailable, try current Chrome or Edge. On iPhone or iPad, use Safari’s Share menu and choose <b>Add to Home Screen</b>.</li></ol>
        </>}
      </div>}
    </div>
  </section>
}
