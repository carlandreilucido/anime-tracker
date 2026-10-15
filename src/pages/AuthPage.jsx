import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { supabase, hasSupabaseConfig } from '../lib/supabase'
import { useToast } from '../components/ui/Toast'
import { useAuth } from '../contexts/AuthContext'
import KitsuLogo from '../components/ui/KitsuLogo'
import { authErrorMessage, classifyNetworkError } from '../lib/network'

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
  const [resetComplete, setResetComplete] = useState(false)
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [resending, setResending] = useState(false)
  const [confirmationPending, setConfirmationPending] = useState(false)
  const [resendMessage, setResendMessage] = useState('')
  const [error, setError] = useState('')
  const [retryAvailable, setRetryAvailable] = useState(false)
  const submitLock = useRef(false)
  const resendLock = useRef(false)
  const { authNotice, clearAuthNotice, session, isRecovering } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const isResetPassword = resetPassword || location.pathname === '/reset-password'

  useEffect(() => {
    if (!authNotice) return
    setError(authNotice)
    clearAuthNotice()
  }, [authNotice, clearAuthNotice])

  useEffect(() => {
    if (!isResetPassword) return
    const params = new URLSearchParams(window.location.search)
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    if (params.get('error') || hash.get('error')) {
      setError('This password reset link is invalid or has expired. Please request a new one.')
      return
    }
    if (!isRecovering && !session) setError('Open the password reset link from your email, or request a new one.')
  }, [isResetPassword, isRecovering, session])

  const submit = async event => {
    event.preventDefault()
    if (submitLock.current || busy) return
    setError('')
    setConfirmationPending(false)
    setRetryAvailable(false)
    if (!hasSupabaseConfig) return setError('Supabase is not configured yet. Add your project URL and anon key to .env.local.')
    submitLock.current = true
    const isSignIn = !register && !forgotMode && !isResetPassword
    setBusy(true)
    try {
      const cleanEmail = isResetPassword ? null : normalizedEmail(email)
      const cleanName = register ? sanitizedName(name) : null
      if (register && !cleanName) throw new Error('Enter your name to create an account.')
      if (cleanEmail) setEmail(cleanEmail)
      if (register) setName(cleanName)

      if (isResetPassword) {
        if (!session || !isRecovering) throw new Error('This password reset link is invalid or has expired. Please request a new one.')
        if (password.length < 6) throw new Error('Your new password must be at least 6 characters.')
        if (password !== confirmPassword) throw new Error('The passwords do not match.')
        const { error: updateError } = await supabase.auth.updateUser({ password })
        if (updateError) throw updateError
        sessionStorage.removeItem('kitsu-password-recovery')
        setResetComplete(true)
        setError('')
        setPassword('')
        setConfirmPassword('')
        setResetSent(true)
      } else if (forgotMode) {
        const redirectTo = new URL('/reset-password', window.location.origin).toString()
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo })
        if (resetError) throw resetError
        setResetSent(true)
      } else if (register) {
        const emailRedirectTo = new URL('/', window.location.origin).toString()
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
          setResendMessage('If this email is eligible for registration, you’ll receive a confirmation email. If you already have an account, please sign in.')
        }
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password })
        if (authError) throw authError
        navigate('/')
      }
    } catch (cause) {
      if (import.meta.env.DEV) console.warn('Authentication request failed', { code: cause?.code, status: cause?.status || cause?.context?.status, name: cause?.name })
      const errorCode = String(cause.code || '').toLowerCase()
      const status = Number(cause.status || cause.context?.status || 0)
      const networkKind = classifyNetworkError(cause)
      if (status === 429 || ['over_email_send_rate_limit', 'over_request_rate_limit', 'over_sms_send_rate_limit'].includes(errorCode)) {
        setError('Too many attempts. Please wait before trying again.')
        return
      }
      if (networkKind === 'offline' || networkKind === 'interrupted' || networkKind === 'timeout' || networkKind === 'server') {
        setError(authErrorMessage(cause))
        setRetryAvailable(true)
        return
      }
      const errorMessage = String(cause.message || '')
      const emailNotConfirmed = errorCode === 'email_not_confirmed'
      const invalidCredentials = errorCode === 'invalid_credentials'

      if (isSignIn && emailNotConfirmed) {
        setError('Your email address is not verified yet. Please check your inbox for the verification link.')
        setConfirmationPending(true)
      } else if (isSignIn && invalidCredentials) {
        setError('Invalid email or password, or the account may not exist yet. Please try again.')
      } else if (isSignIn && ['user_not_found', 'email_not_found', 'account_not_found'].includes(errorCode)) {
        setError('No account found with this email address. Please create an account first.')
      } else if (isResetPassword && (errorCode === 'session_not_found' || errorCode === 'refresh_token_not_found' || /expired|invalid.*token/i.test(errorMessage))) {
        setError('This password reset link has expired. Please request a new one.')
      } else if (cause instanceof Error && ['Enter a valid email address.', 'Enter your name to create an account.', 'Your new password must be at least 6 characters.', 'The passwords do not match.'].includes(cause.message)) {
        setError(cause.message)
      } else {
        setError(isSignIn ? authErrorMessage(cause) : authErrorMessage(cause))
      }
    } finally {
      submitLock.current = false
      setBusy(false)
    }
  }

  const resendConfirmation = async () => {
    if (resendLock.current) return
    if (!email) return setResendMessage('Enter your email address first.')
    resendLock.current = true
    setResending(true)
    setResendMessage('')
    try {
       const emailRedirectTo = new URL('/', window.location.origin).toString()
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: normalizedEmail(email),
        options: { emailRedirectTo },
      })
      if (resendError) throw resendError
      setResendMessage('If this account needs verification, a confirmation email will be sent shortly.')
    } catch (cause) {
      setResendMessage(authErrorMessage(cause))
    } finally {
      resendLock.current = false
      setResending(false)
    }
  }

  return <div className="auth-shell">
    <div className="auth-art">
      <div className="auth-art-top"><KitsuLogo/></div>
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
        <div className="auth-mobile-brand"><KitsuLogo/></div>
        <div className="auth-mobile-intro"><h1>Keep your story <em>going.</em></h1><p>Every show, every episode, right where you left it.</p></div>
        <span className="eyebrow">{isResetPassword ? 'RESET PASSWORD' : forgotMode ? 'ACCOUNT RECOVERY' : register ? 'GET STARTED' : 'WELCOME BACK'}</span>
        <h2>{isResetPassword ? 'Choose a new password.' : forgotMode ? 'Reset your password.' : register ? 'Make it yours.' : 'Pick up where you left off.'}</h2>
        <p className="auth-description">{isResetPassword ? 'Enter and confirm your new password below.' : forgotMode ? 'We’ll email you a secure link to reset your password.' : register ? 'Create your account and keep every episode in its place.' : 'Sign in to get back to your watchlist.'}</p>
        {!resetComplete && <form onSubmit={submit} className="auth-form">
          {register && <label className="field">Your name<input value={name} onChange={event => setName(event.target.value)} placeholder="What should we call you?" autoComplete="name" maxLength={80} required/></label>}
          {!isResetPassword && <label className="field">Email address<input type="email" name="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" maxLength={254} required/></label>}
          {!forgotMode && <label className="field">{isResetPassword ? 'New password' : 'Password'}<div className="password-wrap"><input type={show ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} placeholder={isResetPassword || register ? 'At least 6 characters' : 'Your password'} autoComplete={isResetPassword || register ? 'new-password' : 'current-password'} minLength={6} required/><button type="button" className="password-toggle" onClick={() => setShow(value => !value)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div></label>}
          {isResetPassword && <label className="field">Confirm new password<div className="password-wrap"><input type={show ? 'text' : 'password'} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="Re-enter your new password" autoComplete="new-password" minLength={6} required/></div></label>}
          {error && <div className="auth-error" role="alert">{error}{retryAvailable && <button type="button" className="auth-retry" onClick={() => { setRetryAvailable(false); document.querySelector('.auth-form')?.requestSubmit() }} disabled={busy || (typeof navigator !== 'undefined' && !navigator.onLine)}>Retry</button>}</div>}
          {!isResetPassword && !forgotMode && !register && <button type="button" className="auth-forgot-link" onClick={() => { setForgotMode(true); setError(''); setResetSent(false) }}>Forgot password?</button>}
          {resetSent && !isResetPassword && <p className="auth-confirmation-message" role="status">If an account exists with this email, you’ll receive a password reset link shortly.</p>}
          {!resetSent && <button className="primary-btn auth-submit" disabled={busy}>{busy ? 'Please wait…' : isResetPassword ? 'Save new password' : forgotMode ? 'Send reset email' : register ? 'Create account' : 'Sign in'}</button>}
        </form>}
        {resetComplete && <div className="auth-confirmation-message" role="status">Your password has been updated successfully. <Link to="/login">Return to sign in</Link></div>}
        {(forgotMode || isResetPassword) && !resetComplete && <button type="button" className="auth-back-link" onClick={() => isResetPassword ? navigate('/login') : setForgotMode(false)}>Back to sign in</button>}
        {confirmationPending && <div className="auth-confirmation" role="status">{register && <span>{resendMessage}</span>}<button type="button" onClick={resendConfirmation} disabled={resending || !email}>{resending ? 'Sending…' : 'Resend confirmation email'}</button>{resendMessage && !register && <span>{resendMessage}</span>}</div>}
        <p className="auth-switch">{register ? 'Already have an account?' : 'New to Kitsu?'} <Link to={register ? '/login' : '/register'}>{register ? 'Sign in' : 'Create account'}</Link></p>
        <p className="auth-privacy">Your watchlist is private to your account.</p>
        <div className="auth-legal-links">
          {register && <span className="auth-legal-ack">By creating an account, you agree to</span>}
          <nav className="auth-legal-row" aria-label="Legal information"><Link to="/terms">Terms &amp; Conditions</Link><span aria-hidden="true">·</span><Link to="/privacy">Privacy Policy</Link></nav>
        </div>
      </div>
    </main>
  </div>
}
