import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Download, KeyRound, LockKeyhole, LoaderCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/ui/Toast'
import PreferredProviderSettings from '../components/providers/PreferredProviderSettings'
import { updateProfile } from '../services/profileService'
import { useProfile } from '../contexts/ProfileContext'
import { usePwa } from '../contexts/PwaContext'

export default function SettingsPage() {
  const { user, signOut } = useAuth()
  const { profile, setProfile, loading: profileLoading } = useProfile()
  const { installed, ios, canPromptInstall, install } = usePwa()
  const [showInstallHelp, setShowInstallHelp] = useState(false)
  const toast = useToast()
  const navigate = useNavigate()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [privacySaving, setPrivacySaving] = useState(false)
  const [privacyMessage, setPrivacyMessage] = useState('')
  const [privacyError, setPrivacyError] = useState('')

  const setLibraryVisibility = async enabled => {
    if (!user?.id || privacySaving || enabled === Boolean(profile?.is_library_public)) return
    setPrivacySaving(true)
    setPrivacyMessage('')
    setPrivacyError('')
    try {
      const updated = await updateProfile(user.id, { is_library_public: enabled })
      setProfile(updated)
      setPrivacyMessage('Library visibility saved.')
      toast('Library visibility updated.')
    } catch (cause) {
      const message = cause.message || 'Could not update library visibility.'
      setPrivacyError(message)
      toast(message, 'error')
    } finally { setPrivacySaving(false) }
  }

  const submit = async event => {
    event.preventDefault()
    setError('')
    if (newPassword.length < 8) return setError('Your new password must be at least 8 characters.')
    if (newPassword !== confirmPassword) return setError('The new passwords do not match.')
    if (newPassword === currentPassword) return setError('Choose a new password different from your current password.')
    if (!user?.email || !supabase) return setError('Your signed-in account is unavailable. Sign in again and retry.')

    setSaving(true)
    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword })
      if (verifyError) throw new Error('Your current password is incorrect.')
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
      if (updateError) throw updateError
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast('Password changed successfully.')
      const { error: signOutError } = await signOut()
      if (signOutError) throw new Error('Your password changed, but sign-out failed. Please log out manually.')
      navigate('/login', { replace: true })
    } catch (cause) {
      const message = cause.message || 'Could not change your password. Please try again.'
      setError(message)
      toast(message, 'error')
    } finally { setSaving(false) }
  }

  return <div className="page profile-page"><header className="profile-page-heading"><div><span className="eyebrow">YOUR ACCOUNT</span><h1>Settings</h1><p>Account access and personal details.</p></div></header><section className="profile-card pwa-install-card"><div className="settings-icon"><Download size={20}/></div><div className="pwa-install-copy"><h2>Install Kitsu</h2><p>Get quick access from your home screen or desktop, with Kitsu in its own app window.</p>{installed ? <p className="privacy-feedback success" role="status">Kitsu is installed on this device.</p> : canPromptInstall ? <button type="button" className="primary-btn" onClick={install}><Download size={15}/> Install Kitsu</button> : <button type="button" className="outline-btn" onClick={() => setShowInstallHelp(value => !value)}>{showInstallHelp ? 'Hide instructions' : ios ? 'Show Safari instructions' : 'Show install instructions'}</button>}{showInstallHelp && !installed && <div className="pwa-install-help" role="status">{ios ? <><strong>Install from Safari on iPhone or iPad</strong><ol><li>Open this site in Safari (not an in-app browser).</li><li>Tap the Share button.</li><li>Choose <b>Add to Home Screen</b>, then tap <b>Add</b>.</li></ol></> : <><strong>Install from your browser</strong><ol><li>Open Kitsu in a supported browser over HTTPS.</li><li>Open the browser menu and choose <b>Install Kitsu</b> or <b>Install app</b>.</li><li>If no install option appears, update your browser or try Chrome or Edge.</li></ol></>}</div>}</div></section><section className="profile-card privacy-card"><div className="settings-icon"><LockKeyhole size={20}/></div><div className="privacy-card-copy"><h2>Privacy &amp; Library Visibility</h2><p>Allow other users to view your anime library and add anime from your collection to their own.</p><div className="privacy-toggle-row"><div><strong>Show My Library Publicly</strong><span>{profile?.is_library_public ? 'Your anime library and stats are visible to signed-in users.' : 'Your anime library and stats are private.'}</span></div><button type="button" className={`privacy-switch ${profile?.is_library_public ? 'enabled' : ''}`} role="switch" aria-checked={Boolean(profile?.is_library_public)} aria-label="Show My Library Publicly" disabled={profileLoading || privacySaving || !profile} onClick={() => setLibraryVisibility(!profile?.is_library_public)}><span/></button></div>{privacySaving&&<p className="privacy-feedback" role="status">Saving privacy setting…</p>}{privacyMessage&&<p className="privacy-feedback success" role="status">{privacyMessage}</p>}{privacyError&&<p className="privacy-feedback error" role="alert">{privacyError}</p>}</div></section><section className="profile-card password-card"><div className="settings-icon"><KeyRound size={20}/></div><div className="password-card-content"><h2>Change password</h2><p>Confirm your current password, then choose a new password for your account.</p><form className="password-form" onSubmit={submit}><label className="field">Current password<input type="password" autoComplete="current-password" required value={currentPassword} onChange={event=>setCurrentPassword(event.target.value)}/></label><label className="field">New password<input type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={event=>setNewPassword(event.target.value)} aria-describedby="password-hint"/><span id="password-hint" className="field-hint">Use at least 8 characters.</span></label><label className="field">Confirm new password<input type="password" autoComplete="new-password" required value={confirmPassword} onChange={event=>setConfirmPassword(event.target.value)}/></label>{error&&<p className="profile-form-error" role="alert">{error}</p>}<button className="primary-btn" type="submit" disabled={saving}>{saving?<><LoaderCircle size={15} className="spin"/> Updating password…</>:<><LockKeyhole size={15}/> Change password</>}</button></form></div></section><PreferredProviderSettings/><section className="profile-card settings-card profile-settings-link"><div className="settings-icon"><LockKeyhole size={20}/></div><div><h2>Profile details</h2><p>Update your name, username, and avatar from your profile page.</p><Link className="text-link" to="/profile">Open profile <ArrowRight size={15}/></Link></div></section></div>
}
