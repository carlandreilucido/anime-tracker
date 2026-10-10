import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Copy, LoaderCircle, Search, UserRound } from 'lucide-react'
import { GENRES, PAGE_SIZE, STATUS_LABELS, STATUSES } from '../constants'
import { useToast } from '../components/ui/Toast'
import AnimeCard from '../components/anime/AnimeCard'
import AnimeForm from '../components/anime/AnimeForm'
import Modal from '../components/ui/Modal'
import { createAnime } from '../services/animeService'
import { animeMatchKeys, getMyAnimeMatchKeys, getPublicProfile, getPublicUserLibrary } from '../services/socialService'
import { readableError } from '../utils/format'

function publicAnimeFormData(anime) {
  const seasons = anime.seasons || []
  return {
    title: anime.title,
    alternative_title: anime.alternative_title || '',
    poster_url: anime.poster_url || '',
    genres: anime.genres || [],
    rating: '',
    notes: '',
    is_favorite: false,
    synopsis: anime.synopsis || null,
    release_date: anime.release_date || null,
    community_rating: anime.community_rating ?? null,
    external_provider: anime.external_provider || null,
    external_id: anime.external_id || null,
    external_url: anime.external_url || null,
    metadata_updated_at: new Date().toISOString(),
    seasons: seasons.map(season => ({
      season_number: season.season_number,
      season_title: season.season_title || `Season ${season.season_number}`,
      total_episodes: season.total_episodes ?? '',
      current_episode: 0,
      status: 'plan_to_watch',
      date_started: '',
      media_type: season.media_type || 'tv',
      external_provider: season.external_provider || null,
      external_id: season.external_id || null,
      external_show_id: season.external_show_id || anime.external_id || null,
      external_url: season.external_url || null,
    })),
  }
}

export default function PublicUserPage() {
  const { username = '' } = useParams()
  const toast = useToast()
  const profileRequest = useRef(0)
  const libraryRequest = useRef(0)
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileError, setProfileError] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [genre, setGenre] = useState('')
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [libraryError, setLibraryError] = useState('')
  const [privateLibrary, setPrivateLibrary] = useState(false)
  const [myAnimeKeys, setMyAnimeKeys] = useState(() => new Set())
  const [addedAnimeKeys, setAddedAnimeKeys] = useState(() => new Set())
  const [addingAnime, setAddingAnime] = useState(null)
  const [savingAnime, setSavingAnime] = useState(false)

  useEffect(() => {
    const request = ++profileRequest.current
    setProfile(null)
    setProfileError('')
    setProfileLoading(true)
    setPrivateLibrary(false)
    setItems([])
    setMyAnimeKeys(new Set())
    getPublicProfile(username).then(result => {
      if (request !== profileRequest.current) return
      if (!result) throw new Error('This user could not be found.')
      setProfile(result)
      setPrivateLibrary(!result.is_library_public)
    }).catch(cause => {
      if (request === profileRequest.current) setProfileError(readableError(cause))
    }).finally(() => {
      if (request === profileRequest.current) setProfileLoading(false)
    })
    return () => { profileRequest.current += 1 }
  }, [username])

  const loadLibrary = useCallback(async (offset = 0, append = false) => {
    const request = ++libraryRequest.current
    if (append) setLoadingMore(true)
    else { setLoading(true); setLoadingMore(false) }
    setLibraryError('')
    try {
      const result = await getPublicUserLibrary(username, { limit: PAGE_SIZE, offset, search, status, genre })
      if (request !== libraryRequest.current) return
      if (!result?.is_public) {
        setPrivateLibrary(true)
        setItems([])
        setMyAnimeKeys(new Set())
        setTotal(0)
        setHasMore(false)
        return
      }
      const pageItems = result.items || []
      const ownKeys = await getMyAnimeMatchKeys(pageItems)
      if (request !== libraryRequest.current) return
      setPrivateLibrary(false)
      setItems(current => append ? [...current, ...pageItems] : pageItems)
      setMyAnimeKeys(current => append ? new Set([...current, ...ownKeys]) : ownKeys)
      setTotal(result.total || 0)
      setHasMore(Boolean(result.has_more))
    } catch (cause) {
      if (request === libraryRequest.current) setLibraryError(readableError(cause))
    } finally {
      if (request === libraryRequest.current) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [username, search, status, genre])

  useEffect(() => {
    if (!profile || !profile.is_library_public) {
      setItems([])
      setLoading(false)
      return undefined
    }
    const timer = window.setTimeout(() => loadLibrary(0, false), search ? 250 : 0)
    return () => {
      window.clearTimeout(timer)
      libraryRequest.current += 1
    }
  }, [profile, loadLibrary, search])

  const startAdd = anime => setAddingAnime(publicAnimeFormData(anime))
  const saveToMyLibrary = async values => {
    setSavingAnime(true)
    try {
      await createAnime(values)
      const keys = animeMatchKeys(addingAnime)
      setMyAnimeKeys(current => new Set([...current, ...keys]))
      setAddedAnimeKeys(current => new Set([...current, ...keys]))
      setAddingAnime(null)
      window.dispatchEvent(new Event('kitsu:library-refresh'))
      toast('Anime added to your library.')
    } catch (cause) {
      if (/already in your library|already in your list/i.test(cause.message || '')) {
        const keys = animeMatchKeys(addingAnime)
        setMyAnimeKeys(current => new Set([...current, ...keys]))
        setAddingAnime(null)
        toast('Already in your library.')
        return
      }
      throw cause
    } finally {
      setSavingAnime(false)
    }
  }

  if (profileLoading) return <div className="page public-user-page"><div className="profile-loading"><LoaderCircle className="spin" size={20}/> Loading profile…</div></div>
  if (profileError || !profile) return <div className="page public-user-page"><div className="profile-error"><UserRound size={24}/><h1>Profile unavailable</h1><p>{profileError || 'This user could not be found.'}</p></div></div>

  const displayName = profile.full_name?.trim() || profile.username
  const alreadyInLibrary = anime => animeMatchKeys(anime).some(key => myAnimeKeys.has(key))
  const addedThisSession = anime => animeMatchKeys(anime).some(key => addedAnimeKeys.has(key))
  const copyProfileLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast('Profile link copied.')
    } catch {
      toast('Could not copy the profile link.', 'error')
    }
  }

  return <div className="page public-user-page">
    <section className="profile-card public-user-hero">
      <div className="profile-avatar-large">{profile.avatar_url ? <img src={profile.avatar_url} alt=""/> : <span>{displayName.split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase()}</span>}</div>
      <div className="public-user-heading"><span className="eyebrow">ANIME WATCHLIST</span><h1>{displayName}</h1><p>@{profile.username}</p></div>
      <button type="button" className="outline-btn public-user-share" onClick={copyProfileLink}><Copy size={15}/> Copy profile link</button>
    </section>

    {profile.is_library_public && !privateLibrary && profile.stats && <section className="public-library-stats" aria-label="Public library statistics">
      {[['Total anime', profile.stats.total], ['Watching', profile.stats.watching], ['Completed', profile.stats.completed], ['Plan to watch', profile.stats.plan_to_watch]].map(([label, value]) => <article className="public-library-stat" key={label}><span>{label}</span><strong>{value}</strong></article>)}
    </section>}

    {privateLibrary || !profile.is_library_public
      ? <section className="profile-card public-library-private"><span className="empty-symbol"><UserRound size={19}/></span><h2>This user's anime library is private.</h2><p>Their profile is discoverable, but they have chosen not to share their collection.</p></section>
      : <>
        <header className="public-library-heading"><div><span className="eyebrow">SHARED COLLECTION</span><h2>{displayName}’s anime library <span className="heading-count">{total}</span></h2></div></header>
        <section className="library-toolbar public-library-toolbar">
          <label className="search-field"><Search size={17}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search this library…" aria-label="Search public anime library"/></label>
          <div className="filter-row"><label className="public-library-filter">Status<select value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option>{STATUSES.map(value => <option value={value} key={value}>{STATUS_LABELS[value]}</option>)}</select></label><label className="public-library-filter">Genre<select value={genre} onChange={event => setGenre(event.target.value)}><option value="">All genres</option>{GENRES.map(value => <option value={value} key={value}>{value}</option>)}</select></label></div>
        </section>
        {libraryError && <div className="inline-error" role="alert">{libraryError}<button type="button" onClick={() => loadLibrary()}>Try again</button></div>}
        {loading ? <div className="card-grid library-grid">{Array.from({ length: 6 }, (_, index) => <div className="skeleton-card" key={index}/>)}</div>
          : items.length ? <><div className="card-grid library-grid public-library-grid">{items.map(anime => {
            const matched = alreadyInLibrary(anime)
            const added = addedThisSession(anime)
            return <AnimeCard key={anime.id} anime={anime} readOnly onAddToLibrary={startAdd} addState={added ? 'In My Library' : matched ? 'Already in Library' : ''}/>
          })}</div>{hasMore && <div className="load-more"><button className="outline-btn" disabled={loadingMore} onClick={() => loadLibrary(items.length, true)}>{loadingMore ? <><LoaderCircle className="spin" size={16}/> Loading…</> : 'Load more anime'}</button><span>Showing {items.length} of {total}</span></div>}</>
            : <div className="empty-state library-empty"><span className="empty-symbol">✦</span><h3>{search || status || genre ? 'No anime found' : 'This library is empty'}</h3><p>{search || status || genre ? 'Try adjusting your search or filters.' : 'There are no shared anime in this collection yet.'}</p></div>}
      </>}

    {addingAnime && <Modal title={`Add ${addingAnime.title} to your library`} wide className="public-library-import-modal" backdropClassName="public-library-import-backdrop" onClose={() => { if (!savingAnime) setAddingAnime(null) }}><div className="public-add-anime-content"><p className="public-add-anime-note">Review the anime details and available installments, then choose your own watch status. Your progress starts at zero; the other user’s ratings, notes, and progress are never copied.</p><AnimeForm key={`${addingAnime.external_provider || ''}:${addingAnime.external_id || addingAnime.title}`} initial={addingAnime} initialMode="search" initialSearchAnime={addingAnime} searchOnly onCancel={() => { if (!savingAnime) setAddingAnime(null) }} submitLabel="Add to My Library" onSubmit={saveToMyLibrary} saving={savingAnime}/></div></Modal>}
  </div>
}
