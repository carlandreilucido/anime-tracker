import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Clapperboard as Sparkles, Eye, EyeOff } from 'lucide-react'
import { supabase, hasSupabaseConfig } from '../lib/supabase'
import { useToast } from '../components/ui/Toast'

const PRODUCTION_URL = 'https://animewatchlisttracker.vercel.app/'

function normalizedEmail(value) {
  const email = value.trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Enter a valid email address.')
  }
  return email
}

function sanitizedName(value) {
  return value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80)
}

export default function AuthPage({ register = false, resetPassword = false }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [name, setName] = useState('')
  const [forgotMode, setForgotMode] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [resending, setResending] = useState(false)
  const [confirmationPending, setConfirmationPending] = useState(false)
  const [resendMessage, setResendMessage] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const isResetPassword = resetPassword || location.pathname === '/reset-password'

  const submit = async event => {
    event.preventDefault()
    setError('')
    if (!hasSupabaseConfig) return setError('Supabase is not configured yet. Add your project URL and anon key to .env.local.')
    const isSignIn = !register && !forgotMode && !isResetPassword
    setBusy(true)
    try {
      const cleanEmail = isResetPassword ? null : normalizedEmail(email)
      const cleanName = register ? sanitizedName(name) : null
      if (register && !cleanName) throw new Error('Enter your name to create an account.')
      if (cleanEmail) setEmail(cleanEmail)
      if (register) setName(cleanName)

      if (isResetPassword) {
        if (password.length < 6) throw new Error('Your new password must be at least 6 characters.')
        if (password !== confirmPassword) throw new Error('The passwords do not match.')
        const { error: updateError } = await supabase.auth.updateUser({ password })
        if (updateError) throw updateError
        toast('Your password has been reset.')
        navigate('/')
      } else if (forgotMode) {
        const baseUrl = import.meta.env.PROD ? PRODUCTION_URL : `${window.location.origin}/`
        const redirectTo = new URL('reset-password', baseUrl).toString()
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo })
        if (resetError) throw resetError
        setResetSent(true)
      } else if (register) {
        const emailRedirectTo = import.meta.env.PROD ? PRODUCTION_URL : window.location.origin
        const { data, error: authError } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { data: { name: cleanName }, emailRedirectTo },
        })
        if (authError) throw authError
        if (data.session) {
          navigate('/')
          toast('Welcome to your new watchlist!')
        } else {
          setConfirmationPending(true)
          setResendMessage('Check your email for a confirmation link.')
        }
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password })
        if (authError) throw authError
        navigate('/')
      }
    } catch (cause) {
      const invalidCredentials = cause.code === 'invalid_credentials' || /invalid login credentials/i.test(cause.message || '')
      setError(isSignIn && invalidCredentials
        ? "We couldn't sign you in. If you haven't registered yet, please register first. Otherwise, check your email and password."
        : cause.message || 'Authentication failed.')
    } finally {
      setBusy(false)
    }
  }

  const resendConfirmation = async () => {
    if (!email) return setResendMessage('Enter your email address first.')
    setResending(true)
    setResendMessage('')
    try {
      const emailRedirectTo = import.meta.env.PROD ? PRODUCTION_URL : window.location.origin
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: normalizedEmail(email),
        options: { emailRedirectTo },
      })
      if (resendError) throw resendError
      setResendMessage('A new confirmation email has been sent.')
    } catch (cause) {
      setResendMessage(cause.message || 'Could not resend the confirmation email.')
    } finally {
      setResending(false)
    }
  }

  return <div className="auth-shell">
    <div className="auth-art">
      <div className="auth-art-top"><span className="brand-mark"><Sparkles size={18}/></span> kitsu<span className="brand-dot">.</span></div>
      <div className="art-copy">
        <span className="eyebrow">YOUR PERSONAL WATCHLIST</span>
        <h1>Keep your<br/>story <em>going.</em></h1>
        <p>Every show, every episode, right where you left it.</p>
        <div className="art-lines"><span/><span/><span/><span/><span/></div>
        <div className="art-caption">A place for every world you visit.</div>
      </div>
    </div>
    <main className="auth-panel">
      <div className="auth-box">
        <div className="auth-mobile-brand"><span className="brand-mark"><Sparkles size={18}/></span> kitsu<span className="brand-dot">.</span></div>
        <span className="eyebrow">{isResetPassword ? 'RESET PASSWORD' : forgotMode ? 'ACCOUNT RECOVERY' : register ? 'GET STARTED' : 'WELCOME BACK'}</span>
        <h2>{isResetPassword ? 'Choose a new password.' : forgotMode ? 'Reset your password.' : register ? 'Make it yours.' : 'Pick up where you left off.'}</h2>
        <p className="auth-description">{isResetPassword ? 'Enter and confirm your new password below.' : forgotMode ? 'We’ll email you a secure link to reset your password.' : register ? 'Create your account and keep every episode in its place.' : 'Sign in to get back to your watchlist.'}</p>
        <form onSubmit={submit} className="auth-form">
          {register && <label className="field">Your name<input value={name} onChange={event => setName(event.target.value)} placeholder="What should we call you?" autoComplete="name" maxLength={80} required/></label>}
          {!isResetPassword && <label className="field">Email address<input type="email" name="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" maxLength={254} required/></label>}
          {!forgotMode && <label className="field">{isResetPassword ? 'New password' : 'Password'}<div className="password-wrap"><input type={show ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} placeholder={isResetPassword || register ? 'At least 6 characters' : 'Your password'} autoComplete={isResetPassword || register ? 'new-password' : 'current-password'} minLength={6} required/><button type="button" className="password-toggle" onClick={() => setShow(value => !value)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div></label>}
          {isResetPassword && <label className="field">Confirm new password<div className="password-wrap"><input type={show ? 'text' : 'password'} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="Re-enter your new password" autoComplete="new-password" minLength={6} required/></div></label>}
          {error && <div className="auth-error" role="alert">{error}</div>}
          {!isResetPassword && !forgotMode && !register && <button type="button" className="auth-forgot-link" onClick={() => { setForgotMode(true); setError(''); setResetSent(false) }}>Forgot password?</button>}
          {resetSent && <p className="auth-confirmation-message" role="status">If an account exists for this email, a password reset link has been sent.</p>}
          {!resetSent && <button className="primary-btn auth-submit" disabled={busy}>{busy ? 'Please wait…' : isResetPassword ? 'Save new password' : forgotMode ? 'Send reset email' : register ? 'Create account' : 'Sign in'}</button>}
        </form>
        {(forgotMode || isResetPassword) && <button type="button" className="auth-back-link" onClick={() => isResetPassword ? navigate('/login') : setForgotMode(false)}>Back to sign in</button>}
        {register && confirmationPending && <div className="auth-confirmation" role="status"><span>{resendMessage}</span><button type="button" onClick={resendConfirmation} disabled={resending || !email}>{resending ? 'Sending…' : 'Resend confirmation email'}</button></div>}
        <p className="auth-switch">{register ? 'Already have an account?' : 'New to Kitsu?'} <Link to={register ? '/login' : '/register'}>{register ? 'Sign in' : 'Create account'}</Link></p>
        <p className="auth-privacy">Your watchlist is private to your account.</p>
      </div>
    </main>
  </div>
}
