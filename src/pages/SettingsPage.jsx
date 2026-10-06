import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, KeyRound, LockKeyhole, LoaderCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/ui/Toast'

export default function SettingsPage() {
  const { user, signOut } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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

  return <div className="page profile-page"><header className="profile-page-heading"><div><span className="eyebrow">YOUR ACCOUNT</span><h1>Settings</h1><p>Account access and personal details.</p></div></header><section className="profile-card password-card"><div className="settings-icon"><KeyRound size={20}/></div><div className="password-card-content"><h2>Change password</h2><p>Confirm your current password, then choose a new password for your account.</p><form className="password-form" onSubmit={submit}><label className="field">Current password<input type="password" autoComplete="current-password" required value={currentPassword} onChange={event=>setCurrentPassword(event.target.value)}/></label><label className="field">New password<input type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={event=>setNewPassword(event.target.value)} aria-describedby="password-hint"/><span id="password-hint" className="field-hint">Use at least 8 characters.</span></label><label className="field">Confirm new password<input type="password" autoComplete="new-password" required value={confirmPassword} onChange={event=>setConfirmPassword(event.target.value)}/></label>{error&&<p className="profile-form-error" role="alert">{error}</p>}<button className="primary-btn" type="submit" disabled={saving}>{saving?<><LoaderCircle size={15} className="spin"/> Updating password…</>:<><LockKeyhole size={15}/> Change password</>}</button></form></div></section><section className="profile-card settings-card profile-settings-link"><div className="settings-icon"><LockKeyhole size={20}/></div><div><h2>Profile details</h2><p>Update your name, username, and avatar from your profile page.</p><Link className="text-link" to="/profile">Open profile <ArrowRight size={15}/></Link></div></section></div>
}
