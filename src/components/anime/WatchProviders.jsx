import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, LoaderCircle, Play, RefreshCw, Search, Tv } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../ui/Toast'
import Modal from '../ui/Modal'
import { readableError, timeAgo } from '../../utils/format'
import { findAnimeWatchProviders, getAnimeWatchProviders, getEnabledProviders, getUserWatchPreferences, isApprovedProviderUrl, sortProviderResults } from '../../services/providers'
import ProviderLogo from '../providers/ProviderLogo'

const ACCESS_LABELS = { free: 'Free', subscription: 'Subscription', mixed: 'Free + paid', unknown: 'Pricing unknown' }

function ProviderOptions({ anime }) {
  const { user } = useAuth()
  const toast = useToast()
  const [providers, setProviders] = useState([])
  const [links, setLinks] = useState([])
  const [preferredProvider, setPreferredProvider] = useState(null)
  const [countryCode, setCountryCode] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [lookupWarnings, setLookupWarnings] = useState([])
  const hasLinks = useRef(false)
  const titleSignature = [anime.title, anime.english_title, anime.romaji_title, anime.japanese_title, anime.alternative_title, ...(anime.alternative_titles || [])].filter(Boolean).join('|')
  const previousTitleSignature = useRef(titleSignature)

  const load = useCallback(async (force = false) => {
    setRefreshing(force)
    if (!hasLinks.current) setLoading(true)
    setError('')
    try {
      const [catalog, preference, cached] = await Promise.all([
        getEnabledProviders(),
        user?.id ? getUserWatchPreferences(user.id) : Promise.resolve(null),
        getAnimeWatchProviders(anime.id),
      ])
      setProviders(catalog)
      setPreferredProvider(preference?.preferred_provider || null)
      setCountryCode(preference?.country_code || null)
      setLinks(cached)
      hasLinks.current = cached.length > 0

      const linksByKey = new Map(cached.map(link => [link.provider_key, link]))
      const cutoff = Date.now() - 24 * 60 * 60 * 1000
      const cacheFresh = catalog.length === 0 || catalog.every(provider => {
        const link = linksByKey.get(provider.provider_key)
        return link
          && new Date(link.last_checked_at).getTime() >= cutoff
          && (link.country_code || null) === (preference?.country_code || null)
      })
      if (!force && cacheFresh) return

      setRefreshing(true)
      const discovered = await findAnimeWatchProviders(anime.id, { force })
      setLinks(discovered.providers || [])
      hasLinks.current = Boolean(discovered.providers?.length)
      setLookupWarnings(discovered.errors || [])
      if (discovered.errors?.length) setError('Some providers could not be checked. You can still use the providers that responded.')
    } catch (cause) {
      setError(readableError(cause))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [anime.id, user?.id])

  useEffect(() => {
    const titleChanged = previousTitleSignature.current !== titleSignature
    previousTitleSignature.current = titleSignature
    load(titleChanged)
  }, [load, titleSignature])

  const linksByKey = useMemo(() => new Map(links.map(link => [link.provider_key, link])), [links])
  const orderedResults = useMemo(() => sortProviderResults(
    providers.map(provider => linksByKey.get(provider.provider_key)).filter(Boolean),
    providers,
    preferredProvider,
  ), [providers, linksByKey, preferredProvider])
  const lastChecked = links.reduce((latest, link) => !latest || new Date(link.last_checked_at) > new Date(latest) ? link.last_checked_at : latest, null)

  return <div className="watch-provider-content">
    <div className="watch-provider-results" aria-live="polite">
      {loading ? <div className="provider-skeleton-list">{[0, 1, 2].map(value => <div className="provider-skeleton" key={value}/>)}</div>
        : orderedResults.length ? <div className="provider-list">{orderedResults.map(link => {
          const provider = providers.find(item => item.provider_key === link.provider_key)
          if (!provider || !isApprovedProviderUrl(link.url, provider)) return null
          const directAvailable = link.link_type === 'direct' && link.is_available
          const action = directAvailable ? `Watch on ${provider.name}` : link.link_type === 'search' ? `Search ${provider.name}` : `Check availability on ${provider.name}`
          return <a className="provider-link" key={link.provider_key} href={link.url} target="_blank" rel="noopener noreferrer" aria-label={`${action}, opens in a new tab`}>
            <ProviderLogo provider={provider}/>
            <span className="provider-link-copy"><strong>{provider.name}</strong><small>{action}</small><small className="provider-pricing">{ACCESS_LABELS[provider.access_model] || ACCESS_LABELS.unknown}</small></span>
            <span className={`provider-type ${directAvailable ? 'available' : ''}`}>{directAvailable ? 'Available' : link.link_type === 'search' ? 'Search' : 'Check availability'}</span>
            <ExternalLink size={15} className="provider-external-icon"/>
          </a>
        })}</div> : !error ? <div className="provider-empty"><Tv size={20}/><p>No watch providers are enabled right now.</p></div> : null}
    </div>
    {error && <div className="provider-error" role="status"><span>{error}</span><button className="text-link" onClick={() => load(true)} disabled={refreshing}>Retry</button></div>}
    {lookupWarnings.length > 0 && !error && <p className="provider-warning">Some provider searches could not be generated.</p>}
    <footer className="provider-footer"><span>{lastChecked ? `Last checked ${timeAgo(lastChecked)}` : 'Provider links are generated from your anime title.'}{countryCode ? ` · Region ${countryCode}` : ''}</span><button className="provider-refresh" onClick={() => { load(true); toast('Refreshing watch providers…') }} disabled={refreshing} aria-label="Refresh watch provider links" title="Refresh provider links"><RefreshCw size={14} className={refreshing ? 'spin' : ''}/><span>Refresh</span></button></footer>
  </div>
}

export default function WatchProviders({ anime, compact = false }) {
  const [open, setOpen] = useState(false)
  if (compact) return <><button className="watch-button" onClick={() => setOpen(true)} aria-label={`Show watch options for ${anime.title}`}><Play size={14} fill="currentColor"/> Watch</button>{open && <Modal title={`Watch ${anime.title}`} onClose={() => setOpen(false)}><ProviderOptions anime={anime}/></Modal>}</>
  return <section className="watch-options-panel"><header className="watch-options-heading"><div><span className="section-kicker">WATCH EXTERNALLY</span><h2>Watch options</h2><p>Provider pricing is general; title access can vary by plan and region.</p></div><Tv size={19}/></header><ProviderOptions anime={anime}/></section>
}
