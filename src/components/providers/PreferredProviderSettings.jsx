import { useEffect, useState } from 'react'
import { LoaderCircle, Radio, Save } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../ui/Toast'
import { readableError } from '../../utils/format'
import { getEnabledProviders, getUserWatchPreferences, saveUserWatchPreferences } from '../../services/providers'

export default function PreferredProviderSettings() {
  const { user } = useAuth()
  const toast = useToast()
  const [providers, setProviders] = useState([])
  const [preferredProvider, setPreferredProvider] = useState('')
  const [countryCode, setCountryCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([getEnabledProviders(), getUserWatchPreferences(user.id)])
      .then(([catalog, preferences]) => {
        if (!active) return
        setProviders(catalog)
        setPreferredProvider(preferences?.preferred_provider || '')
        setCountryCode(preferences?.country_code || '')
      })
      .catch(cause => { if (active) setError(readableError(cause)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [user.id])

  const save = async event => {
    event.preventDefault()
    setError('')
    const normalizedCountry = countryCode.trim().toUpperCase()
    if (normalizedCountry && !/^[A-Z]{2}$/.test(normalizedCountry)) {
      setError('Enter a two-letter country code, such as PH or US.')
      return
    }
    setSaving(true)
    try {
      await saveUserWatchPreferences(user.id, { preferred_provider: preferredProvider || null, country_code: normalizedCountry || null })
      setCountryCode(normalizedCountry)
      toast('Watch preferences saved.')
    } catch (cause) {
      const message = readableError(cause)
      setError(message)
      toast(message, 'error')
    } finally { setSaving(false) }
  }

  return <section className="profile-card provider-preference-card"><div className="settings-icon"><Radio size={20}/></div><div className="provider-preference-content"><h2>Watch preferences</h2><p>Choose which provider appears first. Search results do not guarantee that a title is available in your region.</p>{loading ? <div className="provider-preference-loading"><LoaderCircle size={16} className="spin"/> Loading providers…</div> : error && !providers.length ? <p className="profile-form-error" role="alert">{error}</p> : <form className="provider-preference-form" onSubmit={save}><label className="field">Preferred provider<select value={preferredProvider} onChange={event => setPreferredProvider(event.target.value)}><option value="">No preference</option>{providers.map(provider => <option key={provider.provider_key} value={provider.provider_key}>{provider.name}</option>)}</select></label><label className="field">Country code <span className="optional">(optional)</span><input value={countryCode} onChange={event => setCountryCode(event.target.value)} maxLength={2} placeholder="e.g. PH" autoComplete="country"/></label>{error && <p className="profile-form-error" role="alert">{error}</p>}<button className="primary-btn" disabled={saving}>{saving ? <><LoaderCircle size={15} className="spin"/> Saving…</> : <><Save size={15}/> Save watch preferences</>}</button></form>}</div></section>
}
