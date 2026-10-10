import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ExternalLink, LoaderCircle, Plus, Search, Trash2 } from 'lucide-react'
import { STATUSES, STATUS_LABELS } from '../../constants'
import { getTvmazeInstallments, getTvmazeShowAliases, getTvmazeShowById, searchTvmazeShows } from '../../services/tvmazeService'

const MEDIA_TYPES = [
  ['tv', 'TV'], ['movie', 'Movie'], ['ova', 'OVA'], ['ona', 'ONA'],
  ['special', 'Special'], ['recap', 'Recap'], ['spin_off', 'Spin-off'], ['remake', 'Remake'], ['other', 'Other'],
]

function summaryText(html = '') {
  if (!html || typeof DOMParser === 'undefined') return ''
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return (parsed.body.textContent || '').replace(/\s+/g, ' ').trim()
}

function normalizeTitle(value = '') {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

function publicShowFallback(anime) {
  return {
    id: anime.external_provider === 'tvmaze' ? anime.external_id : null,
    name: anime.title || '',
    type: anime.seasons?.[0]?.media_type === 'movie' ? 'Movie' : 'Scripted',
    status: '',
    premiered: anime.release_date || null,
    image: anime.poster_url ? { original: anime.poster_url, medium: anime.poster_url } : null,
    summary: anime.synopsis || '',
    genres: anime.genres || [],
    rating: { average: anime.community_rating ?? null },
    url: anime.external_provider === 'tvmaze' ? anime.external_url : null,
  }
}

function metadataFromShow(show, fallback = {}) {
  return {
    title: show.name || fallback.title || '',
    alternative_title: fallback.alternative_title || '',
    poster_url: show.image?.original || show.image?.medium || fallback.poster_url || '',
    synopsis: summaryText(show.summary) || fallback.synopsis || '',
    genres: Array.isArray(show.genres) && show.genres.length ? show.genres : fallback.genres || [],
    release_date: show.premiered || fallback.release_date || '',
    community_rating: show.rating?.average ?? fallback.community_rating ?? '',
    rating: '',
    notes: '',
  }
}

function publicCandidates(anime) {
  return (anime.seasons || []).map((season, index) => ({
    key: season.external_provider === 'tvmaze' && season.external_id
      ? `season-${season.external_id}`
      : `library-season-${season.id || season.season_number || index}`,
    show_id: season.external_provider === 'tvmaze' ? season.external_show_id || anime.external_id || null : null,
    show_name: anime.title,
    season_id: season.external_provider === 'tvmaze' ? season.external_id || null : null,
    season_number: season.season_number || index + 1,
    season_title: season.season_title || `Season ${season.season_number || index + 1}`,
    total_episodes: season.total_episodes ?? '',
    premiere_date: null,
    external_url: season.external_url || null,
    media_type: season.media_type || 'tv',
    related: false,
    included: false,
    current_episode: 0,
    status: 'plan_to_watch',
    source_label: 'Installment shared by this user',
  }))
}

export default function AnimeSearchForm({ onSubmit, saving, initialAnime = null, onCancel = null, submitLabel = 'Add to Library' }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [searched, setSearched] = useState(false)
  const [visibleResults, setVisibleResults] = useState(8)
  const [selectedShow, setSelectedShow] = useState(() => initialAnime ? publicShowFallback(initialAnime) : null)
  const [metadata, setMetadata] = useState(() => initialAnime ? metadataFromShow(publicShowFallback(initialAnime), initialAnime) : null)
  const [candidates, setCandidates] = useState(() => initialAnime ? publicCandidates(initialAnime) : [])
  const [loadingShows, setLoadingShows] = useState({})
  const [candidateError, setCandidateError] = useState('')
  const [failedShow, setFailedShow] = useState(null)
  const [error, setError] = useState('')
  const [hydratingInitial, setHydratingInitial] = useState(Boolean(initialAnime))
  const selectedShowId = useRef(initialAnime?.external_provider === 'tvmaze' ? initialAnime.external_id : null)

  useEffect(() => {
    const term = query.trim()
    if (term.length < 2) {
      setResults([])
      setSearched(false)
      setSearching(false)
      setSearchError('')
      return undefined
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setSearching(true)
      setSearchError('')
      try {
        setResults(await searchTvmazeShows(term, { signal: controller.signal }))
        setSearched(true)
        setVisibleResults(8)
      } catch (cause) {
        if (cause.name !== 'AbortError') setSearchError(cause.message || 'Anime search failed.')
      } finally {
        if (!controller.signal.aborted) setSearching(false)
      }
    }, 350)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  const loadShow = async (show, asRelated = false, retry = false, fallbackMetadata = null) => {
    if (!show?.id) {
      setCandidateError('This anime has no TVmaze identifier. Keep the shared metadata or search for real installments below.')
      return
    }
    const showKey = String(show.id)
    setLoadingShows(current => ({ ...current, [showKey]: true }))
    setCandidateError('')
    try {
      const [installments, aliases] = await Promise.all([
        getTvmazeInstallments(show, { bypassCache: retry }),
        asRelated ? Promise.resolve([]) : getTvmazeShowAliases(show.id).catch(() => []),
      ])
      if (!installments.length) throw new Error('TVmaze did not return any seasons for this show. You can add an installment manually.')
      setFailedShow(null)
      if (asRelated) {
        setCandidates(current => {
          const known = new Set(current.map(candidate => candidate.key))
          return [...current, ...installments
            .filter(item => !known.has(item.key))
            .map(item => ({ ...item, related: true, included: false }))]
        })
      } else {
        setQuery('')
        selectedShowId.current = show.id
        setSelectedShow(show)
        setMetadata(metadataFromShow(show, fallbackMetadata || {}))
        const discovered = installments.map(item => ({ ...item, included: false }))
        const knownKeys = new Set(discovered.map(item => item.key))
        const savedExtraInstallments = fallbackMetadata
          ? publicCandidates(fallbackMetadata).filter(item => !knownKeys.has(item.key))
          : []
        setCandidates([...discovered, ...savedExtraInstallments])
        setError('')
        const alternative = aliases.find(alias => alias.name && alias.name.toLowerCase() !== show.name?.toLowerCase())?.name || fallbackMetadata?.alternative_title || ''
        if (selectedShowId.current === show.id) setMetadata(current => current ? { ...current, alternative_title: alternative } : current)
      }
    } catch (cause) {
      if (cause.name !== 'AbortError') {
        setFailedShow({ show, asRelated, fallbackMetadata })
        setCandidateError(cause.message || 'Could not load this show’s seasons.')
      }
    } finally {
      setLoadingShows(current => ({ ...current, [showKey]: false }))
    }
  }

  useEffect(() => {
    if (!initialAnime) return undefined
    let active = true
    const hydrate = async () => {
      setHydratingInitial(true)
      const sourceSeason = initialAnime.seasons?.find(season => season.external_provider === 'tvmaze' && season.external_show_id)
      const showId = initialAnime.external_provider === 'tvmaze'
        ? initialAnime.external_id || sourceSeason?.external_show_id
        : sourceSeason?.external_show_id
      let show = null
      if (showId) {
        try { show = await getTvmazeShowById(showId) } catch { /* Continue with safe metadata already shared on the public library. */ }
      }
      if (!show) {
        try {
          const matches = await searchTvmazeShows(initialAnime.title)
          const targetNames = new Set([initialAnime.title, initialAnime.alternative_title].filter(Boolean).map(normalizeTitle))
          show = matches.find(item => targetNames.has(normalizeTitle(item.name))) || null
        } catch { /* A public-library metadata fallback remains available offline. */ }
      }
      if (active && show) {
        selectedShowId.current = show.id
        setSelectedShow(show)
        setMetadata(metadataFromShow(show, initialAnime))
        setQuery('')
        await loadShow(show, false, false, initialAnime)
      } else if (active) {
        setCandidateError('Could not find an exact TVmaze match. The shared metadata and known installments are preserved; search for additional installments below.')
      }
      if (active) setHydratingInitial(false)
    }
    hydrate().catch(cause => {
      if (!active) return
      setCandidateError(cause.message || 'Could not load anime details. Shared metadata remains available.')
      setHydratingInitial(false)
    })
    return () => { active = false }
  }, [initialAnime])

  const toggleCandidate = key => setCandidates(current => current.map(candidate => candidate.key === key
    ? { ...candidate, included: !candidate.included }
    : candidate))

  const editCandidate = (key, field, value) => setCandidates(current => current.map(candidate => candidate.key === key
    ? { ...candidate, [field]: value }
    : candidate))

  const moveCandidate = (index, direction) => setCandidates(current => {
    const next = [...current]
    const target = index + direction
    if (target < 0 || target >= next.length) return current
    ;[next[index], next[target]] = [next[target], next[index]]
    return next
  })

  const addCustomCandidate = () => {
    const key = `custom-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`
    setCandidates(current => [...current, {
      key, show_id: null, show_name: selectedShow?.name || metadata?.title || 'Custom installment',
      season_id: null, season_number: null, season_title: '', total_episodes: '',
      premiere_date: null, external_url: null, media_type: 'tv', related: true, included: true,
      current_episode: 0, status: 'plan_to_watch',
    }])
  }

  const submit = async event => {
    event.preventDefault()
    setError('')
    if (!selectedShow || !metadata) return setError('Choose an anime from the search results first.')
    const included = candidates.filter(candidate => candidate.included)
    if (!included.length) return setError('Select at least one installment, or add one manually.')
    if (!metadata.title.trim()) return setError('Anime title is required.')
    const personalRating = metadata.rating === '' ? null : Number(metadata.rating)
    if (personalRating !== null && (personalRating < 1 || personalRating > 10)) return setError('Personal rating must be between 1 and 10.')

    const seasons = []
    for (const [index, candidate] of included.entries()) {
      const title = String(candidate.season_title || '').trim()
      const total = candidate.total_episodes === '' || candidate.total_episodes === null ? null : Number(candidate.total_episodes)
      const current = Number(candidate.current_episode) || 0
      if (!title) return setError('Every selected installment needs a name.')
      if (total !== null && (!Number.isSafeInteger(total) || total < 0)) return setError(`${title}: episode count must be zero or greater.`)
      if (!Number.isSafeInteger(current) || current < 0 || (total !== null && current > total)) return setError(`${title}: watched episodes must not exceed its episode count.`)
      const status = total !== null && total > 0 && current >= total ? 'completed' : (candidate.status || 'plan_to_watch')
      seasons.push({
        season_number: index + 1,
        season_title: title,
        total_episodes: total,
        current_episode: current,
        status,
        date_started: null,
        date_completed: status === 'completed' ? new Date().toISOString().slice(0, 10) : null,
        media_type: candidate.media_type || 'other',
        external_provider: candidate.season_id ? 'tvmaze' : null,
        external_id: candidate.season_id || null,
        external_show_id: candidate.show_id || null,
        external_url: candidate.external_url || null,
      })
    }

    try {
      await onSubmit({
        title: metadata.title.trim(),
        alternative_title: metadata.alternative_title.trim() || null,
        poster_url: metadata.poster_url.trim() || null,
        genres: metadata.genres,
        rating: personalRating,
        notes: metadata.notes.trim() || null,
        synopsis: metadata.synopsis.trim() || null,
        release_date: metadata.release_date || null,
        community_rating: metadata.community_rating === '' ? null : Number(metadata.community_rating),
        external_provider: selectedShow.id ? 'tvmaze' : null,
        external_id: selectedShow.id || null,
        external_url: selectedShow.url || (selectedShow.id ? `https://www.tvmaze.com/shows/${selectedShow.id}` : null),
        metadata_updated_at: new Date().toISOString(),
        seasons,
      })
    } catch (cause) {
      setError(cause.message || 'Could not add this anime. Your existing library was not changed.')
    }
  }

  const retrySearch = async () => {
    if (query.trim().length < 2) return
    setSearching(true)
    setSearchError('')
    try {
      setResults(await searchTvmazeShows(query, { bypassCache: true }))
      setSearched(true)
      setVisibleResults(8)
    } catch (cause) { setSearchError(cause.message || 'Anime search failed.') }
    finally { setSearching(false) }
  }

  return <div className="anime-search-flow">
    {!selectedShow ? <div className="anime-search-body anime-search-browse-body">
      <p className="anime-search-intro">Search TVmaze for an anime, then choose which of its seasons to track together.</p>
      <label className="field full">Search anime<input autoFocus type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="e.g. Demon Slayer" aria-describedby="tvmaze-attribution"/></label>
      {searching && <div className="anime-search-state" role="status"><LoaderCircle className="loading-spin" size={17}/> Searching TVmaze…</div>}
      {searchError && <div className="anime-search-error" role="alert"><span>{searchError}</span><button type="button" className="outline-btn" onClick={retrySearch}>Retry</button></div>}
      {searched && !searching && !searchError && !results.length && <div className="anime-search-state">No matching anime found. Try another title or switch to Add Manually.</div>}
      {!!results.length && <div className="anime-search-results" aria-label="Anime search results">
        {results.slice(0, visibleResults).map(show => <article className="anime-search-result" key={show.id}>
          {show.image?.medium ? <img src={show.image.medium} alt="" loading="lazy"/> : <div className="anime-search-poster-placeholder">No poster</div>}
          <div className="anime-search-result-copy"><strong>{show.name}</strong><span>{[show.premiered?.slice(0, 4), show.language, show.type, show.genres?.includes('Anime') ? 'Anime' : null].filter(Boolean).join(' · ') || 'Anime metadata'}</span><small>Episode count available after selection</small></div>
          <button type="button" className="outline-btn" disabled={loadingShows[String(show.id)]} onClick={() => loadShow(show)}>{loadingShows[String(show.id)] ? <LoaderCircle className="loading-spin" size={15}/> : <Search size={14}/>} Select</button>
        </article>)}
        {results.length > visibleResults && <button type="button" className="outline-btn anime-search-more" onClick={() => setVisibleResults(count => count + 8)}>Show more results</button>}
      </div>}
    </div> : <form className="anime-search-form" onSubmit={submit}>
      <div className="anime-search-body">
      <section className="anime-selected-show">
        <div className="anime-selected-copy"><span className="section-kicker">SELECTED ANIME</span><h3>{selectedShow.name}</h3><span>{[selectedShow.premiered?.slice(0, 4), selectedShow.type, selectedShow.status, selectedShow.language].filter(Boolean).join(' · ') || 'Shared library details'}</span><small>{candidates.length} installments · {candidates.length && candidates.every(candidate => candidate.total_episodes !== null && candidate.total_episodes !== '') ? `${candidates.reduce((sum, candidate) => sum + Number(candidate.total_episodes), 0)} episodes` : 'episode total unavailable'}</small></div>
        <button type="button" className="text-link" onClick={() => { selectedShowId.current = null; setSelectedShow(null); setMetadata(null); setCandidates([]); setCandidateError(''); setQuery('') }}>Choose another</button>
      </section>
       {hydratingInitial && <div className="anime-search-state" role="status"><LoaderCircle className="loading-spin" size={16}/> Loading complete details and installments…</div>}

      <div className="anime-search-metadata form-grid">
        <label className="field full">Anime title<input required value={metadata.title} onChange={event => setMetadata(current => ({ ...current, title: event.target.value }))}/></label>
        <label className="field full">Alternative title<input value={metadata.alternative_title} onChange={event => setMetadata(current => ({ ...current, alternative_title: event.target.value }))} placeholder="Optional"/></label>
        <label className="field full">Synopsis<textarea rows="3" value={metadata.synopsis} onChange={event => setMetadata(current => ({ ...current, synopsis: event.target.value }))} placeholder="No synopsis available; you can add one."/></label>
        <label className="field full">Genres<input value={metadata.genres.join(', ')} onChange={event => setMetadata(current => ({ ...current, genres: event.target.value.split(',').map(item => item.trim()).filter(Boolean) }))} placeholder="Comma-separated genres"/></label>
        <label className="field">Release date<input type="date" value={metadata.release_date} onChange={event => setMetadata(current => ({ ...current, release_date: event.target.value }))}/></label>
        <label className="field">Poster image URL<input type="url" value={metadata.poster_url} onChange={event => setMetadata(current => ({ ...current, poster_url: event.target.value }))} placeholder="Optional"/></label>
        <div className="field"><span>TVmaze community rating</span><strong className="catalog-community-rating">{metadata.community_rating !== '' && metadata.community_rating !== null ? `${metadata.community_rating} / 10` : 'Not available'}</strong><small>Separate from your personal rating.</small></div>
        <label className="field">Your rating<select value={metadata.rating} onChange={event => setMetadata(current => ({ ...current, rating: event.target.value }))}><option value="">Not rated</option>{Array.from({ length: 10 }, (_, index) => <option value={index + 1} key={index}>{index + 1} / 10</option>)}</select></label>
        <label className="field full">Personal notes<textarea rows="2" value={metadata.notes} onChange={event => setMetadata(current => ({ ...current, notes: event.target.value }))} placeholder="Optional"/></label>
      </div>

      <section className="anime-installment-picker">
        <header className="anime-installment-heading"><div><span className="section-kicker">REVIEW BEFORE ADDING</span><h3>Choose installments</h3><p>TVmaze lists seasons within this show. Other show results are unverified suggestions and are never selected automatically.</p></div><button type="button" className="outline-btn" onClick={addCustomCandidate}><Plus size={14}/> Add manually</button></header>
        <label className="field full related-search-label">Search for another installment (optional)<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search a separately titled sequel or arc"/></label>
        {searching && <div className="anime-search-state" role="status"><LoaderCircle className="loading-spin" size={16}/> Searching…</div>}
        {searchError && <div className="anime-search-error" role="alert"><span>{searchError}</span><button type="button" className="outline-btn" onClick={retrySearch}>Retry</button></div>}
        {searched && query.trim().length >= 2 && !searching && !searchError && !results.length && <div className="anime-search-state">No matching additional title found. You can add this installment manually.</div>}
        {!searching && !searchError && results.length > 0 && <div className="related-result-list">{results.slice(0, 5).map(show => <div className="related-result" key={show.id}><span>{show.name}<small>{[show.premiered?.slice(0, 4), show.language, show.type].filter(Boolean).join(' · ')}</small></span><button type="button" className="outline-btn" disabled={loadingShows[String(show.id)] || show.id === selectedShow.id} onClick={() => loadShow(show, true)}>{loadingShows[String(show.id)] ? <LoaderCircle className="loading-spin" size={14}/> : <Plus size={14}/>} Add candidate</button></div>)}</div>}
        {candidateError && <div className="anime-search-error" role="alert"><span>{candidateError}</span>{failedShow && <button type="button" className="outline-btn" onClick={() => loadShow(failedShow.show, failedShow.asRelated, true, failedShow.fallbackMetadata)}>Retry</button>}</div>}
        {candidates.length > 0 ? <div className="anime-candidate-list">{candidates.map((candidate, index) => <article className={`anime-candidate ${candidate.included ? 'included' : ''}`} key={candidate.key}>
          <div className="anime-candidate-select"><input type="checkbox" checked={candidate.included} onChange={() => toggleCandidate(candidate.key)} aria-label={`Include ${candidate.season_title || 'installment'}`}/></div>
          <div className="anime-candidate-fields">
            <div className="anime-candidate-origin"><strong>{candidate.show_name}</strong><span>{candidate.source_label || (candidate.related ? 'Additional search result · relationship not verified' : `TVmaze season ${candidate.season_number ?? 'entry'}`)}</span></div>
            <div className="anime-candidate-edit-grid">
              <label className="field">Installment name<input value={candidate.season_title} onChange={event => editCandidate(candidate.key, 'season_title', event.target.value)} placeholder="e.g. Season 1"/></label>
              <label className="field">Type<select value={candidate.media_type} onChange={event => editCandidate(candidate.key, 'media_type', event.target.value)}>{MEDIA_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="field">Total episodes<input type="number" min="0" step="1" value={candidate.total_episodes ?? ''} onChange={event => editCandidate(candidate.key, 'total_episodes', event.target.value)} placeholder="Unknown"/></label>
              <label className="field">Episodes watched<input type="number" min="0" step="1" max={candidate.total_episodes || undefined} value={candidate.current_episode ?? 0} onChange={event => editCandidate(candidate.key, 'current_episode', event.target.value)} onFocus={event => event.currentTarget.select()}/></label>
              <label className="field">Watch status<select value={candidate.status || 'plan_to_watch'} onChange={event => editCandidate(candidate.key, 'status', event.target.value)}>{STATUSES.map(status => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></label>
            </div>
            <div className="anime-candidate-footer">{candidate.external_url && <a href={candidate.external_url} target="_blank" rel="noreferrer">TVmaze source <ExternalLink size={12}/></a>}{candidate.premiere_date && <span>First aired {candidate.premiere_date}</span>}</div>
          </div>
          <div className="anime-candidate-order"><button type="button" className="icon-btn" disabled={index === 0} onClick={() => moveCandidate(index, -1)} aria-label={`Move ${candidate.season_title || 'installment'} earlier`}><ArrowUp size={15}/></button><button type="button" className="icon-btn" disabled={index === candidates.length - 1} onClick={() => moveCandidate(index, 1)} aria-label={`Move ${candidate.season_title || 'installment'} later`}><ArrowDown size={15}/></button>{candidate.key.startsWith('custom-') && <button type="button" className="icon-btn candidate-remove" onClick={() => setCandidates(current => current.filter(item => item.key !== candidate.key))} aria-label={`Remove ${candidate.season_title || 'custom installment'}`}><Trash2 size={14}/></button>}</div>
        </article>)}</div> : <div className="anime-search-state">No installments loaded. Retry, search another installment, or add one manually.</div>}
      </section>

      {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <div className="anime-search-submit-row"><span>{candidates.filter(candidate => candidate.included).length} selected</span><div className="anime-search-submit-actions">{onCancel && <button type="button" className="outline-btn" onClick={onCancel} disabled={saving}>Cancel</button>}<button type="submit" className="primary-btn" disabled={saving || hydratingInitial || !candidates.some(candidate => candidate.included)}>{saving ? 'Saving…' : submitLabel}</button></div></div>
    </form>}
    {!selectedShow && onCancel && <div className="anime-search-submit-row"><span>Select an anime to review its installments.</span><div className="anime-search-submit-actions"><button type="button" className="outline-btn" onClick={onCancel}>Cancel</button><button type="button" className="primary-btn" disabled>Select anime first</button></div></div>}
    <p id="tvmaze-attribution" className="tvmaze-attribution">Anime metadata and artwork by <a href="https://www.tvmaze.com/" target="_blank" rel="noreferrer">TVmaze</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA</a></p>
  </div>
}
