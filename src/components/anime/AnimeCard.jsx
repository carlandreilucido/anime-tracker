import { Heart, Plus, Minus, Star, MoreHorizontal } from 'lucide-react'
import ProgressBar from './ProgressBar'
import StatusBadge from './StatusBadge'
import WatchProviders from './WatchProviders'
import { progressPercent } from '../../utils/format'
import { episodeRangeLabel, getSeasonEpisodeNumbers } from '../../utils/seasonEpisodes'

function activeSeasonOf(seasons = []) {
  return seasons.find(season => season.status === 'watching')
    || seasons.find(season => season.status === 'plan_to_watch')
    || [...seasons].sort((a, b) => b.season_number - a.season_number)[0]
}

function seasonName(season) { return season.season_title || `Season ${season.season_number}` }

export default function AnimeCard({ anime, onOpen, onProgress, onFavorite, busy = false }) {
  const seasons = [...(anime.seasons || [])].sort((a, b) => a.season_number - b.season_number)
  const episodeNumbers = getSeasonEpisodeNumbers(seasons)
  const activeSeason = activeSeasonOf(seasons)
  const seasonFinished = activeSeason?.status === 'completed'
  const hasNextEpisode = activeSeason && !(activeSeason.total_episodes > 0 && activeSeason.current_episode >= activeSeason.total_episodes)

  return <article className="anime-card">
    <button className="poster-button" onClick={onOpen} aria-label={`View ${anime.title}`}><div className="poster-frame">{anime.poster_url ? <img src={anime.poster_url} alt={`${anime.title} poster`} loading="lazy" onError={event => { event.currentTarget.style.display = 'none' }}/> : <div className="poster-placeholder">{anime.title?.slice(0, 1)}</div>}<span className="poster-shade"/><span className="poster-progress">{progressPercent(anime)}%</span></div></button>
    <div className="card-content">
      <div className="card-title-row"><button className="title-link" onClick={onOpen}>{anime.title}</button><button className={`favorite-btn ${anime.is_favorite ? 'active' : ''}`} onClick={event => { event.stopPropagation(); onFavorite() }} aria-label={anime.is_favorite ? 'Remove favorite' : 'Add favorite'}><Heart size={16} fill={anime.is_favorite ? 'currentColor' : 'none'}/></button></div>
      {anime.alternative_title && <p className="alt-title">{anime.alternative_title}</p>}
      <div className="card-tags"><StatusBadge status={anime.status}/>{anime.rating ? <span className="rating-chip"><Star size={12} fill="currentColor"/>{anime.rating}</span> : null}<span className="season-count">{seasons.length} {seasons.length === 1 ? 'season' : 'seasons'}</span></div>
      <div className="card-season-list" aria-label="Season episode numbering">{seasons.slice(0, 3).map(season => { const numbering = episodeNumbers.get(season.id); return <div className="card-season-entry" key={season.id}><div className="card-season-row"><span>{seasonName(season)}</span><strong>{episodeRangeLabel(numbering)}</strong></div><div className="card-season-row card-season-meta"><span>Season episodes: {season.current_episode || 0} / {season.total_episodes ?? '?'}</span><span>{numbering?.lastWatchedNumber ? `Last #${numbering.lastWatchedNumber}` : numbering?.nextEpisodeNumber ? `Next #${numbering.nextEpisodeNumber}` : 'Overall #?'}</span></div></div>})}{seasons.length > 3 && <span className="more-seasons">+{seasons.length - 3} more seasons</span>}</div>
      {anime.status === 'watching' && activeSeason ? <><ProgressBar anime={anime}/><div className="episode-actions"><span className="next-episode">{hasNextEpisode ? <>Next <b>{episodeNumbers.get(activeSeason.id)?.nextEpisodeNumber ? `#${episodeNumbers.get(activeSeason.id).nextEpisodeNumber} · ` : ''}{seasonName(activeSeason)} ep. {(activeSeason.current_episode || 0) + 1}</b></> : seasonFinished ? 'Current season complete' : 'No season selected'}</span><div className="stepper"><button disabled={busy || activeSeason.current_episode <= 0} onClick={() => onProgress(-1, activeSeason.id)} aria-label={`Decrease ${seasonName(activeSeason)} episode`}><Minus size={14}/></button><span>{episodeNumbers.get(activeSeason.id)?.lastWatchedNumber || 0}</span><button disabled={busy || !hasNextEpisode} onClick={() => onProgress(1, activeSeason.id)} aria-label={`Increase ${seasonName(activeSeason)} to overall episode ${episodeNumbers.get(activeSeason.id)?.nextEpisodeNumber ?? 'number unknown'}`}><Plus size={14}/></button></div></div></> : <div className="card-footer"><span>{anime.current_episode || 0} / {anime.total_episodes ?? '?'} total episodes watched</span><button className="subtle-btn" onClick={onOpen}>Seasons <MoreHorizontal size={15}/></button></div>}
      {anime.genres?.length > 0 && <div className="genre-line">{anime.genres.slice(0, 3).join(' · ')}</div>}
      <div className="card-watch-row"><WatchProviders anime={anime} compact/></div>
    </div>
  </article>
}
