import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Sparkles, Eye, EyeOff } from 'lucide-react'
import { supabase, hasSupabaseConfig } from '../lib/supabase'
import { useToast } from '../components/ui/Toast'

const PRODUCTION_URL = 'https://animewatchlisttracker.vercel.app/'

export default function AuthPage({ register = false }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const toast = useToast()

  const submit = async event => {
    event.preventDefault()
    setError('')
    if (!hasSupabaseConfig) return setError('Supabase is not configured yet. Add your project URL and anon key to .env.local.')
    setBusy(true)
    try {
      if (register) {
        const emailRedirectTo = import.meta.env.PROD ? PRODUCTION_URL : window.location.origin
        const { data, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name }, emailRedirectTo },
        })
        if (authError) throw authError
        if (data.session) {
          navigate('/')
          toast('Welcome to your new watchlist!')
        } else {
          setError('Check your email to confirm your account, then sign in.')
        }
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
        if (authError) throw authError
        navigate('/')
      }
    } catch (cause) {
      setError(cause.message || 'Authentication failed.')
    } finally {
      setBusy(false)
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
        <span className="eyebrow">{register ? 'GET STARTED' : 'WELCOME BACK'}</span>
        <h2>{register ? 'Make it yours.' : 'Pick up where you left off.'}</h2>
        <p className="auth-description">{register ? 'Create your account and keep every episode in its place.' : 'Sign in to get back to your watchlist.'}</p>
        <form onSubmit={submit} className="auth-form">
          {register && <label className="field">Your name<input value={name} onChange={event => setName(event.target.value)} placeholder="What should we call you?" autoComplete="name" required/></label>}
          <label className="field">Email address<input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required/></label>
          <label className="field">Password<div className="password-wrap"><input type={show ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} placeholder={register ? 'At least 6 characters' : 'Your password'} autoComplete={register ? 'new-password' : 'current-password'} minLength={6} required/><button type="button" className="password-toggle" onClick={() => setShow(value => !value)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div></label>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <button className="primary-btn auth-submit" disabled={busy}>{busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}</button>
        </form>
        <p className="auth-switch">{register ? 'Already have an account?' : 'New to Kitsu?'} <Link to={register ? '/login' : '/register'}>{register ? 'Sign in' : 'Create account'}</Link></p>
        <p className="auth-privacy">Your watchlist is private to your account.</p>
      </div>
    </main>
  </div>
}
