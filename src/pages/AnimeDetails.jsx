import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, Edit3, Heart, ListPlus, Minus, Plus, Star, Trash2 } from 'lucide-react'
import { addAnimeSeason, deleteAnime, getAnimeById, markAnimeCompleted, toggleFavorite, updateAnime, updateAnimeSeason, updateEpisodeProgress, setSeasonEpisodeProgress, withOptimisticEpisodeNumber } from '../services/animeService'
import { progressPercent, readableError, timeAgo } from '../utils/format'
import { episodeRangeLabel, getSeasonEpisodeNumbers } from '../utils/seasonEpisodes'
import StatusBadge from '../components/anime/StatusBadge'
import ProgressBar from '../components/anime/ProgressBar'
import AnimeForm from '../components/anime/AnimeForm'
import SeasonForm from '../components/anime/SeasonForm'
import WatchProviders from '../components/anime/WatchProviders'
import EpisodeNumberInput from '../components/anime/EpisodeNumberInput'
import { useToast } from '../components/ui/Toast'
import Modal from '../components/ui/Modal'

const seasonName = season => season.season_title || `Season ${season.season_number}`

export default function AnimeDetails({ refresh, onChanged }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [anime, setAnime] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [progressBusy, setProgressBusy] = useState({})
  const [editing, setEditing] = useState(false)
  const [addingSeason, setAddingSeason] = useState(false)
  const [editingSeason, setEditingSeason] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try { setAnime(await getAnimeById(id)) }
    catch (cause) { setError(readableError(cause)) }
    finally { setLoading(false) }
  }, [id])

  useEffect(() => { load() }, [load, refresh])

  const updateSeasonProgress = async (season, increment) => {
    setAnime(current => ({
      ...current,
      seasons: current.seasons.map(item => item.id === season.id ? {
        ...item,
        current_episode: Math.max(0, Math.min(item.total_episodes || Infinity, (item.current_episode || 0) + increment)),
      } : item),
    }))
    try {
      const updated = await updateEpisodeProgress(anime, increment, season.id)
      setAnime(updated)
      onChanged()
      toast(updated.status === 'completed' ? 'All seasons completed!' : `${seasonName(season)} updated to episode ${updated.seasons.find(item => item.id === season.id)?.current_episode}.`)
    } catch (cause) {
      setAnime(anime)
      toast(readableError(cause), 'error')
    }
  }

  const setSeasonEpisode = async (season, episodeNumber) => {
    const previous = anime
    setProgressBusy(current => ({ ...current, [season.id]: true }))
    setAnime(current => withOptimisticEpisodeNumber(current, season.id, episodeNumber))
    try {
      const updated = await setSeasonEpisodeProgress(anime, season.id, episodeNumber)
      setAnime(updated)
      onChanged()
      toast(`${seasonName(season)} progress saved.`)
    } catch (cause) {
      setAnime(previous)
      toast(readableError(cause), 'error')
      throw cause
    } finally { setProgressBusy(current => ({ ...current, [season.id]: false })) }
  }

  const favorite = async () => {
    try { const updated = await toggleFavorite(anime); setAnime(updated); onChanged() }
    catch (cause) { toast(readableError(cause), 'error') }
  }

  const saveSeries = async values => {
    setSaving(true)
    try {
      const updated = await updateAnime(id, values)
      setAnime(updated)
      setEditing(false)
      onChanged()
      toast('Anime details updated.')
    } catch (cause) { toast(readableError(cause), 'error'); throw cause }
    finally { setSaving(false) }
  }

  const saveSeason = async values => {
    setSaving(true)
    try {
      const updated = editingSeason ? await updateAnimeSeason(id, editingSeason.id, values) : await addAnimeSeason(id, values)
      setAnime(updated)
      setAddingSeason(false)
      setEditingSeason(null)
      onChanged()
      toast(editingSeason ? `${seasonName(values)} updated.` : `${seasonName(values)} added to ${anime.title}.`)
    } catch (cause) { toast(readableError(cause), 'error'); throw cause }
    finally { setSaving(false) }
  }

  const completeSeries = async () => {
    try {
      const updated = await markAnimeCompleted(anime)
      setAnime(updated)
      onChanged()
      toast('Series marked as completed.')
    } catch (cause) { toast(readableError(cause), 'error') }
  }

  const removeSeries = async () => {
    try {
      await deleteAnime(id)
      toast('Anime removed from your library.')
      onChanged()
      navigate('/library')
    } catch (cause) { toast(readableError(cause), 'error') }
  }

  if (loading) return <div className="details-loading"><div className="skeleton-poster"/><div className="details-skeleton"><div/><div/><div/><div/></div></div>
  if (error || !anime) return <div className="page"><button className="back-link" onClick={() => navigate(-1)}><ArrowLeft size={16}/> Back</button><div className="empty-state"><h3>Couldn’t find this anime</h3><p>{error || 'It may have been removed.'}</p><button className="outline-btn" onClick={load}>Try again</button></div></div>

  const seasons = [...(anime.seasons || [])].sort((a, b) => a.season_number - b.season_number)
  const episodeNumbers = getSeasonEpisodeNumbers(seasons)
  const fields = [['Date started', anime.date_started], ['Date completed', anime.date_completed], ['Added to list', anime.created_at?.slice(0, 10)], ['Last updated', timeAgo(anime.updated_at)]]

  return <div className="page details-page">
    <button className="back-link" onClick={() => navigate(-1)}><ArrowLeft size={16}/> Back to library</button>
    <div className="details-layout">
      <div className="details-poster">{anime.poster_url ? <img src={anime.poster_url} alt={`${anime.title} poster`}/> : <div className="poster-placeholder details-placeholder">{anime.title[0]}</div>}</div>
      <div className="details-content">
        <div className="details-identity">
          <div className="details-eyebrow"><span className="eyebrow">YOUR WATCHLIST</span><button className={`favorite-action ${anime.is_favorite ? 'active' : ''}`} onClick={favorite} aria-label="Toggle favorite"><Heart size={19} fill={anime.is_favorite ? 'currentColor' : 'none'}/></button></div>
          <h1>{anime.title}</h1>{anime.alternative_title && <p className="detail-alt">{anime.alternative_title}</p>}
          <div className="details-badges"><StatusBadge status={anime.status}/>{anime.rating ? <span className="detail-rating"><Star size={14} fill="currentColor"/>{anime.rating}<span>/10</span></span> : <span className="not-rated">Not rated</span>}</div>
          {anime.genres?.length > 0 && <div className="detail-genres">{anime.genres.map(genre => <span key={genre}>{genre}</span>)}</div>}
        </div>
        <div className="detail-progress"><div className="detail-progress-heading"><span>Series progress · {seasons.length} {seasons.length === 1 ? 'season' : 'seasons'}</span><strong>{anime.current_episode || 0}<span> / {anime.total_episodes ?? '?'} total episodes</span></strong></div><ProgressBar anime={anime}/><div className="detail-next">{seasons.filter(season => season.status === 'completed').length} of {seasons.length} seasons completed</div></div>
        <div className="details-actions"><button className="outline-btn" onClick={() => setAddingSeason(true)}><ListPlus size={15}/> Add season</button><button className="outline-btn" onClick={() => setEditing(true)}><Edit3 size={15}/> Edit series</button>{anime.status !== 'completed' && <button className="outline-btn" onClick={completeSeries}><span>✓</span> Mark completed</button>}<button className="delete-btn" onClick={() => setConfirmDelete(true)}><Trash2 size={15}/> Delete</button></div>
      </div>
    </div>

    <WatchProviders anime={anime}/>
    <section className="season-details-section"><header className="season-details-heading"><div><span className="section-kicker">EPISODE TRACKING</span><h2>Seasons <span className="heading-count">{seasons.length}</span></h2><p>Each season keeps its own episode count and progress.</p></div><button className="primary-btn" onClick={() => setAddingSeason(true)}><Plus size={15}/> Add season</button></header>
      {seasons.length ? <div className="season-detail-list">{seasons.map(season => {
        const finished = season.total_episodes > 0 && season.current_episode >= season.total_episodes
        const percent = season.total_episodes > 0 ? Math.min(100, Math.round((season.current_episode / season.total_episodes) * 100)) : 0
        const numbering = episodeNumbers.get(season.id)
        return <article className="season-detail-card" key={season.id}><div className="season-detail-top"><div><span className="season-number-label">SEASON {season.season_number}</span><h3>{seasonName(season)}</h3><span className="season-global-range">{episodeRangeLabel(numbering)}</span></div><div className="season-detail-badges"><StatusBadge status={season.status}/><button className="season-edit-btn" onClick={() => setEditingSeason(season)} aria-label={`Edit ${seasonName(season)}`}><Edit3 size={14}/></button></div></div><div className="season-episode-summary"><strong>Season ep. {season.current_episode || 0} <span>/ {season.total_episodes ?? '?'}</span></strong><span>{numbering?.lastWatchedNumber ? `Overall last watched #${numbering.lastWatchedNumber}` : numbering?.nextEpisodeNumber ? `Overall next #${numbering.nextEpisodeNumber}` : 'Overall episode number unavailable'}</span></div><div className="progress-track season-progress-track"><div className="progress-fill" style={{ width: `${percent}%` }}/></div><div className="season-detail-footer"><span>{percent}% complete{numbering?.nextEpisodeNumber ? ` · Next overall #${numbering.nextEpisodeNumber}` : ''}</span><div className="stepper season-stepper"><button disabled={progressBusy[season.id] || season.current_episode <= 0} onClick={() => updateSeasonProgress(season, -1)} aria-label={`Decrease ${seasonName(season)} episode`}><Minus size={14}/></button><EpisodeNumberInput value={season.current_episode || 0} totalEpisodes={season.total_episodes} seasonLabel={seasonName(season)} disabled={progressBusy[season.id]} onCommit={episode => setSeasonEpisode(season, episode)} onInvalid={message => toast(message, 'error')}/><button disabled={progressBusy[season.id] || finished} onClick={() => updateSeasonProgress(season, 1)} aria-label={`Increase ${seasonName(season)} to overall episode ${numbering?.nextEpisodeNumber ?? 'number unknown'}`}><Plus size={14}/></button></div></div></article>
      })}</div> : <div className="empty-state"><h3>No seasons added yet</h3><p>Add the first season to start tracking episodes.</p><button className="primary-btn" onClick={() => setAddingSeason(true)}><Plus size={15}/> Add season</button></div>}
    </section>

    <div className="details-lower"><section className="notes-panel"><div className="lower-heading"><h2>Personal notes</h2><button className="text-link" onClick={() => setEditing(true)}>Edit <ArrowUpRight size={14}/></button></div><p>{anime.notes?.trim() || <span className="muted-copy">No notes yet. Add a thought, reminder, or place to pick back up.</span>}</p></section><section className="info-panel"><h2>Series details</h2><div className="info-grid">{fields.map(([label, value]) => <div className="info-item" key={label}><span>{label}</span><strong>{value || '—'}</strong></div>)}<div className="info-item"><span>Total episodes</span><strong>{anime.total_episodes ?? 'Unknown'}</strong></div><div className="info-item"><span>Series progress</span><strong>{progressPercent(anime)}%</strong></div></div></section></div>

    {editing && <Modal title="Edit series details" onClose={() => setEditing(false)} wide><AnimeForm initial={anime} onSubmit={saveSeries} saving={saving}/></Modal>}
    {(addingSeason || editingSeason) && <Modal title={editingSeason ? `Edit ${seasonName(editingSeason)}` : `Add a season to ${anime.title}`} onClose={() => { if (!saving) { setAddingSeason(false); setEditingSeason(null) } }}><SeasonForm initial={editingSeason || undefined} nextSeasonNumber={Math.max(0, ...seasons.map(season => season.season_number)) + 1} onSubmit={saveSeason} saving={saving}/></Modal>}
    {confirmDelete && <Modal title="Remove anime?" onClose={() => setConfirmDelete(false)}><p className="confirm-copy">This will permanently remove <strong>{anime.title}</strong>, all {seasons.length} seasons, and the series notes from your library.</p><div className="confirm-actions"><button className="outline-btn" onClick={() => setConfirmDelete(false)}>Keep anime</button><button className="danger-btn" onClick={removeSeries}>Delete anime</button></div></Modal>}
  </div>
}
