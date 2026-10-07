import { useEffect, useState } from 'react'
import { ArrowUpRight, Play, Bookmark, Check, Pause, X, Clock3, Sparkles, ChevronRight, Heart } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { getAnime, getRecentlyWatched, getStats, setSeasonEpisodeProgress, toggleFavorite, updateEpisodeProgress, withOptimisticEpisodeChange, withOptimisticEpisodeNumber } from '../services/animeService'
import AnimeCard from '../components/anime/AnimeCard'
import { useToast } from '../components/ui/Toast'
import { readableError, timeAgo } from '../utils/format'
import { getSeasonEpisodeNumbers } from '../utils/seasonEpisodes'

const statsMeta = [['watching', 'Currently watching', Play], ['plan_to_watch', 'Plan to watch', Bookmark], ['completed', 'Completed', Check], ['on_hold', 'On hold', Pause], ['dropped', 'Dropped', X]]
const activeSeason = anime => anime.seasons?.find(season => season.status === 'watching') || anime.seasons?.find(season => season.status === 'plan_to_watch') || anime.seasons?.[0]

export default function Dashboard({ refresh, onAdd }) {
  const [stats, setStats] = useState({})
  const [watching, setWatching] = useState([])
  const [recent, setRecent] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState({})
  const [error, setError] = useState('')
  const toast = useToast()
  const navigate = useNavigate()

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [nextStats, current, recently] = await Promise.all([
        getStats(),
        getAnime({ status: 'watching', sort: 'updated_at', direction: 'desc' }),
        getRecentlyWatched(),
      ])
      setStats(nextStats)
      setWatching(current.data)
      setRecent(recently)
    } catch (cause) { setError(readableError(cause)) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [refresh])

  const changeProgress = async (anime, step, seasonId) => {
    const previous = anime
    const optimistic = withOptimisticEpisodeChange(anime, seasonId, step)
    setBusy(value => ({ ...value, [anime.id]: true }))
    setWatching(items => items.map(item => item.id === anime.id ? optimistic : item))
    try {
      const updated = await updateEpisodeProgress(anime, step, seasonId)
      setWatching(items => items.map(item => item.id === anime.id ? updated : item))
      toast(updated.status === 'completed' ? 'All seasons completed!' : 'Season progress updated.')
      load()
    } catch (cause) {
      setWatching(items => items.map(item => item.id === anime.id ? previous : item))
      toast(readableError(cause), 'error')
    } finally { setBusy(value => ({ ...value, [anime.id]: false })) }
  }

  const setEpisodeNumber = async (anime, seasonId, episodeNumber) => {
    const previous = anime
    setBusy(value => ({ ...value, [anime.id]: true }))
    setWatching(items => items.map(item => item.id === anime.id ? withOptimisticEpisodeNumber(item, seasonId, episodeNumber) : item))
    try {
      const updated = await setSeasonEpisodeProgress(anime, seasonId, episodeNumber)
      setWatching(items => items.map(item => item.id === anime.id ? updated : item))
      toast('Episode progress updated.')
      load()
    } catch (cause) {
      setWatching(items => items.map(item => item.id === anime.id ? previous : item))
      toast(readableError(cause), 'error')
      throw cause
    } finally { setBusy(value => ({ ...value, [anime.id]: false })) }
  }

  const favorite = async anime => {
    try {
      const updated = await toggleFavorite(anime)
      setWatching(items => items.map(item => item.id === anime.id ? updated : item))
      toast(updated.is_favorite ? 'Added to favorites.' : 'Removed from favorites.')
    } catch (cause) { toast(readableError(cause), 'error') }
  }

  return <div className="page">
    <section className="welcome-row"><div><span className="eyebrow"><Sparkles size={13}/> YOUR ANIME, IN ONE PLACE</span><h1>Your next episode<br className="mobile-break"/> is <em>waiting.</em></h1><p>Good stories deserve a good place to pick back up.</p></div><button className="outline-btn" onClick={() => navigate('/library')}>Explore library <ArrowUpRight size={16}/></button></section>
    {error && <div className="inline-error" role="alert">{error} <button onClick={load}>Try again</button></div>}
    <section className="stats-grid"><div className="stat-card stat-total"><div className="stat-top"><span className="stat-icon"><Clock3 size={18}/></span><span className="stat-caption">IN YOUR LIBRARY</span></div><strong>{loading ? '—' : Object.values(stats).reduce((sum, value) => sum + value, 0)}</strong><span className="stat-label">Total anime series</span></div>{statsMeta.map(([key, label, Icon], index) => <div className="stat-card" key={key}><div className="stat-top"><span className={`stat-icon stat-icon-${index}`}><Icon size={17}/></span><span className="stat-number">{loading ? '—' : stats[key] || 0}</span></div><span className="stat-label">{label}</span></div>)}</section>
    <div className="dashboard-grid"><section className="section-block continue-section"><div className="section-heading"><div><span className="section-kicker">PICK UP WHERE YOU LEFT OFF</span><h2>Continue watching <span className="heading-count">{stats.watching ?? 0}</span></h2></div><button className="text-link" onClick={() => navigate('/watching')}>See all <ChevronRight size={15}/></button></div>{loading ? <div className="card-grid">{[0, 1, 2].map(value => <div className="skeleton-card" key={value}/>)}</div> : watching.length ? <div className="card-grid">{watching.slice(0, 3).map(anime => <AnimeCard key={anime.id} anime={anime} busy={busy[anime.id]} onOpen={() => navigate(`/anime/${anime.id}`)} onProgress={(step, seasonId) => changeProgress(anime, step, seasonId)} onSetEpisode={(seasonId, value) => setEpisodeNumber(anime, seasonId, value)} onInvalidEpisode={message => toast(message, 'error')} onFavorite={() => favorite(anime)}/>)}</div> : <div className="empty-state"><span className="empty-symbol">✦</span><h3>No episodes in progress</h3><p>Add a series and set a season to watching to keep your next episode close.</p><button className="primary-btn" onClick={onAdd}>Add anime <span>＋</span></button></div>}</section>
      <aside className="recent-panel"><div className="section-heading"><div><span className="section-kicker">LITTLE BY LITTLE</span><h2>Recently watched</h2></div><Clock3 size={17} className="muted-icon"/></div>{loading ? <div className="recent-loading">Loading activity…</div> : recent.length ? <div className="recent-list">{recent.slice(0, 5).map(item => { const season = activeSeason(item); const numbering = season && getSeasonEpisodeNumbers(item.seasons).get(season.id); return <button className="recent-item" key={item.id} onClick={() => navigate(`/anime/${item.id}`)}><span className="recent-cover">{item.poster_url ? <img src={item.poster_url} alt="" loading="lazy"/> : <span>{item.title?.[0]}</span>}</span><span className="recent-copy"><strong>{item.title}</strong><span>{season ? `S${season.season_number} · ${numbering?.lastWatchedNumber ? `Overall #${numbering.lastWatchedNumber}` : 'Not started'} · Season ep ${season.current_episode || 0}${season.total_episodes ? `/${season.total_episodes}` : ''}` : 'No seasons yet'}</span></span><span className="recent-time">{timeAgo(item.updated_at)}</span></button> })}</div> : <div className="recent-empty"><Heart size={18}/><p>Your recent episodes will show up here.</p></div>}<button className="recent-footer" onClick={() => navigate('/library')}>Browse your collection <ArrowUpRight size={14}/></button></aside>
    </div>
  </div>
}
