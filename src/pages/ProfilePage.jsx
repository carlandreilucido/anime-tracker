import { useEffect, useRef, useState } from 'react'
import { Camera, UserRound, AtSign, Mail, Shield, CalendarDays, LoaderCircle, RefreshCw, Save, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useProfile } from '../contexts/ProfileContext'
import { avatarPathFromUrl, removeAvatar, updateProfile, uploadAvatar, validateAvatar } from '../services/profileService'
import { readableError } from '../utils/format'
import { useToast } from '../components/ui/Toast'

function initials(profile) {
  const value = profile?.full_name?.trim() || profile?.username || profile?.email || 'U'
  return value.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join('')
}

export default function ProfilePage() {
  const { user } = useAuth()
  const { profile, setProfile, loading, error, refreshProfile } = useProfile()
  const toast = useToast()
  const fileInput = useRef(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [avatarFile, setAvatarFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (!editing || !profile) return
    setFullName(profile.full_name || '')
    setUsername(profile.username || '')
    setAvatarFile(null)
    setPreview('')
    setFormError('')
  }, [editing, profile])

  useEffect(() => {
    if (!avatarFile) { setPreview(''); return }
    const objectUrl = URL.createObjectURL(avatarFile)
    setPreview(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [avatarFile])

  const selectAvatar = event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const validationError = validateAvatar(file)
    if (validationError) { setAvatarFile(null); setFormError(validationError); return }
    setFormError('')
    setAvatarFile(file)
  }

  const cancelEdit = () => {
    setEditing(false)
    setAvatarFile(null)
    setPreview('')
    setFormError('')
  }

  const saveProfile = async event => {
    event.preventDefault()
    const normalizedUsername = username.trim().toLowerCase()
    if (!/^[a-z0-9_]{3,32}$/.test(normalizedUsername)) {
      setFormError('Username must be 3–32 characters using lowercase letters, numbers, or underscores.')
      return
    }
    if (fullName.trim().length > 80) {
      setFormError('Full name must be 80 characters or fewer.')
      return
    }

    setSaving(true)
    setFormError('')
    let uploaded = null
    try {
      if (avatarFile) uploaded = await uploadAvatar(user.id, avatarFile)
      const updated = await updateProfile(user.id, {
        username: normalizedUsername,
        full_name: fullName.trim(),
        ...(uploaded ? { avatar_url: uploaded.url } : {}),
      })
      setProfile(updated)
      setEditing(false)
      setAvatarFile(null)
      toast('Profile updated successfully.')

      if (uploaded && profile.avatar_url) {
        const oldPath = avatarPathFromUrl(profile.avatar_url, user.id)
        if (oldPath) removeAvatar(oldPath).catch(() => {})
      }
    } catch (cause) {
      if (uploaded) removeAvatar(uploaded.path).catch(() => {})
      const message = readableError(cause)
      setFormError(message.toLowerCase().includes('profiles_username') || message.toLowerCase().includes('duplicate key')
        ? 'That username is already taken. Try another one.'
        : message)
      toast('Could not save your profile.', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading && !profile) return <div className="page profile-page"><div className="profile-loading"><LoaderCircle className="spin" size={20}/> Loading your profile…</div></div>
  if (!profile) return <div className="page profile-page"><div className="profile-error"><Shield size={24}/><h1>Profile unavailable</h1><p>{error?.message || 'We could not load your profile.'}</p><button className="outline-btn" onClick={refreshProfile}><RefreshCw size={15}/> Try again</button></div></div>

  const displayAvatar = preview || profile.avatar_url
  const memberSince = profile.created_at ? new Date(profile.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '—'

  return <div className="page profile-page">
    <header className="profile-page-heading"><div><span className="eyebrow">YOUR ACCOUNT</span><h1>Profile</h1><p>Manage the details connected to your watchlist.</p></div></header>
    <section className="profile-card">
      <div className="profile-card-top"><div><span className="section-kicker">PERSONAL DETAILS</span><h2>Your profile</h2></div>{!editing&&<button className="outline-btn" onClick={()=>setEditing(true)}><UserRound size={15}/> Edit profile</button>}</div>
      <div className="profile-identity">
        <div className="profile-avatar-large">{displayAvatar?<img src={displayAvatar} alt={`${profile.username}'s avatar`}/>:<span>{initials(profile)}</span>}</div>
        <div><h3>{profile.full_name || profile.username}</h3><p>@{profile.username}</p></div>
      </div>
      {editing ? <form className="profile-edit-form" onSubmit={saveProfile}>
        <div className="profile-avatar-edit"><div className="profile-avatar-large">{displayAvatar?<img src={displayAvatar} alt="Avatar preview"/>:<span>{initials(profile)}</span>}</div><div><button className="outline-btn" type="button" onClick={()=>fileInput.current?.click()}><Camera size={15}/> Choose photo</button><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={selectAvatar} hidden aria-label="Choose profile picture"/><span className="field-hint">JPG, PNG, or WEBP · Max 5 MB</span></div></div>
        <div className="profile-form-grid"><label className="field">Full name<input maxLength={80} value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Your name" autoComplete="name"/></label><label className="field">Username<input required minLength={3} maxLength={32} value={username} onChange={e=>setUsername(e.target.value)} placeholder="your_username" autoComplete="username"/><span className="field-hint">3–32 lowercase letters, numbers, or underscores.</span></label><label className="field">Email address<input value={profile.email || user.email || ''} disabled readOnly/><span className="field-hint">Email is managed by your sign-in account.</span></label><label className="field">Account role<input value={profile.role === 'admin' ? 'Admin' : 'User'} disabled readOnly/></label></div>
        {formError&&<p className="profile-form-error" role="alert">{formError}</p>}
        <div className="profile-form-actions"><button className="outline-btn" type="button" onClick={cancelEdit} disabled={saving}><X size={15}/> Cancel</button><button className="primary-btn" type="submit" disabled={saving}>{saving?<><LoaderCircle size={15} className="spin"/> Saving…</>:<><Save size={15}/> Save profile</>}</button></div>
      </form> : <div className="profile-info-grid">
        <div className="profile-info-item"><span><UserRound size={15}/> Full name</span><strong>{profile.full_name || 'Not added'}</strong></div>
        <div className="profile-info-item"><span><AtSign size={15}/> Username</span><strong>@{profile.username}</strong></div>
        <div className="profile-info-item"><span><Mail size={15}/> Email</span><strong>{profile.email || user.email}</strong></div>
        <div className="profile-info-item"><span><Shield size={15}/> Account role</span><strong><span className={`role-pill ${profile.role === 'admin' ? 'admin' : ''}`}>{profile.role === 'admin' ? 'Admin' : 'User'}</span></strong></div>
        <div className="profile-info-item"><span><CalendarDays size={15}/> Member since</span><strong>{memberSince}</strong></div>
      </div>}
    </section>
  </div>
}
