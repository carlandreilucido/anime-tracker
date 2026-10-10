import { useState } from 'react'
import { Heart, Minus, MoreHorizontal, Plus, Star } from 'lucide-react'
import StatusBadge from './StatusBadge'
import WatchProviders from './WatchProviders'
import EpisodeNumberInput from './EpisodeNumberInput'
import Modal from '../ui/Modal'
import { progressPercent } from '../../utils/format'
import { episodeRangeLabel, getSeasonEpisodeNumbers } from '../../utils/seasonEpisodes'

function activeSeasonOf(seasons = []) {
  return seasons.find(season => season.status === 'watching')
    || seasons.find(season => season.status === 'plan_to_watch')
    || [...seasons].sort((a, b) => b.season_number - a.season_number)[0]
}

function seasonName(season) { return season.season_title || `Season ${season.season_number}` }
function mediaTypeName(type) { return ({ movie: 'MOVIE', ova: 'OVA', ona: 'ONA', special: 'SPECIAL', recap: 'RECAP', spin_off: 'SPIN-OFF', remake: 'REMAKE', other: 'OTHER' })[type] || null }

function seasonProgress(season) {
  const total = Number(season.total_episodes)
  if (!Number.isFinite(total) || total <= 0) return null
  return Math.min(100, Math.round(((Number(season.current_episode) || 0) / total) * 100))
}

export default function AnimeCard({ anime, onOpen, onProgress, onSetEpisode, onInvalidEpisode, onFavorite, busy = false, readOnly = false, onAddToLibrary, addState = '', addingToLibrary = false }) {
  const [showSeasonBreakdown, setShowSeasonBreakdown] = useState(false)
  const seasons = [...(anime.seasons || [])].sort((a, b) => a.season_number - b.season_number)
  const episodeNumbers = getSeasonEpisodeNumbers(seasons)
  const activeSeason = activeSeasonOf(seasons)
  const seasonFinished = activeSeason?.status === 'completed'
  const hasNextEpisode = activeSeason && !(activeSeason.total_episodes > 0 && activeSeason.current_episode >= activeSeason.total_episodes)
  const percentage = readOnly ? null : progressPercent(anime)
  const watchedEpisodes = Number(anime.current_episode) || 0
  const totalEpisodes = anime.total_episodes ?? '?'

  return <>
    <article className={`anime-card ${readOnly ? 'public-anime-card' : ''}`}>
      <button className="poster-button" onClick={() => readOnly ? setShowSeasonBreakdown(true) : onOpen?.()} aria-label={`View ${anime.title}`}>
        <div className="poster-frame">
          {anime.poster_url
            ? <img src={anime.poster_url} alt={`${anime.title} poster`} loading="lazy" onError={event => { event.currentTarget.style.display = 'none' }}/>
            : <div className="poster-placeholder">{anime.title?.slice(0, 1)}</div>}
          <span className="poster-shade"/>
          {!readOnly && <span className="poster-progress">{percentage}%</span>}
        </div>
      </button>

      <div className="card-content">
        <div className="card-title-row">
          <button className="title-link" onClick={() => readOnly ? setShowSeasonBreakdown(true) : onOpen?.()} title={anime.title}>{anime.title}</button>
          {!readOnly && <button className={`favorite-btn ${anime.is_favorite ? 'active' : ''}`} onClick={event => { event.stopPropagation(); onFavorite() }} aria-label={anime.is_favorite ? 'Remove favorite' : 'Add favorite'}>
            <Heart size={16} fill={anime.is_favorite ? 'currentColor' : 'none'}/>
          </button>}
        </div>
        <p className={`alt-title ${anime.alternative_title ? '' : 'alt-title-empty'}`} title={anime.alternative_title || undefined} aria-hidden={anime.alternative_title ? undefined : 'true'}>
          {anime.alternative_title || '\u00a0'}
        </p>

        <div className="card-tags">
          <span className="card-status-rating"><StatusBadge status={anime.status}/>{anime.rating ? <span className="rating-chip"><Star size={11} fill="currentColor"/>{anime.rating}</span> : null}</span>
          <span className="season-count">{seasons.length} {seasons.length === 1 ? 'season' : 'seasons'}</span>
        </div>

        <div className={`card-overall-progress ${readOnly ? 'public-card-episode-total' : ''}`}>
          <div className="card-overall-progress-label"><strong>{readOnly ? (anime.total_episodes ?? 'Episode total unavailable') + (anime.total_episodes === null || anime.total_episodes === undefined ? '' : ' episodes') : `${watchedEpisodes} / ${totalEpisodes} episodes watched`}</strong>{!readOnly && <span>{percentage}%</span>}</div>
          {!readOnly && <div className="card-overall-progress-track" role="progressbar" aria-label={`${anime.title} overall episode progress`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={percentage}><span style={{ width: `${percentage}%` }}/></div>}
        </div>

        {!readOnly && anime.status === 'watching' && activeSeason && <div className="card-episode-controls">
          <div className="episode-actions">
            <span className="next-episode">{hasNextEpisode ? <>Next <b>{episodeNumbers.get(activeSeason.id)?.nextEpisodeNumber ? `#${episodeNumbers.get(activeSeason.id).nextEpisodeNumber} · ` : ''}{seasonName(activeSeason)} ep. {(activeSeason.current_episode || 0) + 1}</b></> : seasonFinished ? 'Current season complete' : 'No season selected'}</span>
            <div className="stepper">
              <button disabled={busy || activeSeason.current_episode <= 0} onClick={() => onProgress(-1, activeSeason.id)} aria-label={`Decrease ${seasonName(activeSeason)} episode`}><Minus size={14}/></button>
              <EpisodeNumberInput value={activeSeason.current_episode || 0} totalEpisodes={activeSeason.total_episodes} seasonLabel={seasonName(activeSeason)} disabled={busy} onCommit={episode => onSetEpisode(activeSeason.id, episode)} onInvalid={onInvalidEpisode}/>
              <button disabled={busy || !hasNextEpisode} onClick={() => onProgress(1, activeSeason.id)} aria-label={`Increase ${seasonName(activeSeason)} to overall episode ${episodeNumbers.get(activeSeason.id)?.nextEpisodeNumber ?? 'number unknown'}`}><Plus size={14}/></button>
            </div>
          </div>
        </div>}

        <div className="genre-line" title={anime.genres?.join(' · ') || undefined}>
          {anime.genres?.length ? anime.genres.slice(0, 3).join(' · ') : 'Genres unavailable'}
        </div>

        <div className="card-action-row">
          <button type="button" className="season-breakdown-button" onClick={() => setShowSeasonBreakdown(true)} aria-label={`Show ${seasons.length} seasons for ${anime.title}`}>
            <MoreHorizontal size={15}/><span>Seasons</span>
          </button>
          {readOnly
            ? <button type="button" className="public-library-add-button" disabled={Boolean(addState) || addingToLibrary} onClick={() => onAddToLibrary?.(anime)}>{addingToLibrary ? 'Adding…' : addState || 'Add to My Library'}</button>
            : <div className="card-watch-row"><WatchProviders anime={anime} compact/></div>}
        </div>
      </div>
    </article>

    {showSeasonBreakdown && <Modal title={`${anime.title} seasons`} onClose={() => setShowSeasonBreakdown(false)} className="season-breakdown-modal" backdropClassName="season-breakdown-backdrop">
      <div className="season-breakdown-content">
        {seasons.length ? <div className="season-breakdown-list">{seasons.map(season => {
          const numbering = episodeNumbers.get(season.id)
          const percent = seasonProgress(season)
          const seasonType = mediaTypeName(season.media_type) || `Season ${season.season_number}`
          return <article className="season-breakdown-item" key={season.id}>
            <div className="season-breakdown-heading">
              <div><span>{seasonType}</span><h3>{seasonName(season)}</h3><small>{episodeRangeLabel(numbering)}</small></div>
              <StatusBadge status={season.status}/>
            </div>
            <div className="season-breakdown-count"><strong>{readOnly ? `${season.total_episodes ?? '?'} episodes` : `${Number(season.current_episode) || 0} / ${season.total_episodes ?? '?'} episodes`}</strong>{!readOnly && <span>{percent === null ? 'Progress unavailable' : `${percent}%`}</span>}</div>
            {!readOnly && <div className="season-breakdown-track" role="progressbar" aria-label={`${seasonName(season)} progress`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent ?? 0}><span style={{ width: `${percent ?? 0}%` }}/></div>}
          </article>
        })}</div> : <p className="season-breakdown-empty">No season information has been added yet.</p>}
        {!readOnly && <button type="button" className="season-breakdown-details" onClick={() => { setShowSeasonBreakdown(false); onOpen?.() }}>Open anime details</button>}
      </div>
    </Modal>}
  </>
}
