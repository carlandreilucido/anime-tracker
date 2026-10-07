import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Search, SlidersHorizontal, LoaderCircle, Sparkles, X } from 'lucide-react'
import { GENRES, STATUS_LABELS } from '../constants'
import { getAnime, setSeasonEpisodeProgress, toggleFavorite, updateEpisodeProgress, withOptimisticEpisodeChange, withOptimisticEpisodeNumber } from '../services/animeService'
import AnimeCard from '../components/anime/AnimeCard'
import { useToast } from '../components/ui/Toast'
import FilterDropdown from '../components/ui/FilterDropdown'
import { readableError } from '../utils/format'

const sortOptions = [['created_at','Recently added','desc'], ['updated_at','Recently updated','desc'], ['title','Title A–Z','asc'], ['title','Title Z–A','desc'], ['rating','Highest rated','desc'], ['rating','Lowest rated','asc'], ['current_episode','Progress','desc']]

export default function Library({ refresh, onAdd }) {
  const location = useLocation()
  const navigate = useNavigate()
  const toast = useToast()
  const params = new URLSearchParams(location.search)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState({ status: params.get('status') || '', favorites: params.get('favorites') === 'true', genre: '', rating: '' })
  const [sortIndex, setSortIndex] = useState(0)
  const [items, setItems] = useState([])
  const [count, setCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState({})
  const timer = useRef()
  const heading = filter.favorites ? 'Favorites' : filter.status ? STATUS_LABELS[filter.status] : 'My library'

  useEffect(() => {
    const query = new URLSearchParams(location.search)
    setFilter(current => ({ ...current, status: query.get('status') || '', favorites: query.get('favorites') === 'true' }))
  }, [location.search])

  const load = useCallback(async ({ reset = true, pageNumber = 0 } = {}) => {
    reset ? setLoading(true) : setLoadingMore(true)
    setError('')
    try {
      const [sort, , direction] = sortOptions[sortIndex]
      const result = await getAnime({ page: pageNumber, search, status: filter.status, genre: filter.genre, favorites: filter.favorites, rating: filter.rating, sort, direction })
      setItems(current => reset ? result.data : [...current, ...result.data])
      setCount(result.count)
      setHasMore(result.hasMore)
      setPage(pageNumber)
    } catch (cause) { setError(readableError(cause)) }
    finally { setLoading(false); setLoadingMore(false) }
  }, [search, filter, sortIndex])

  useEffect(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => load({ reset: true, pageNumber: 0 }), search ? 260 : 0)
    return () => clearTimeout(timer.current)
  }, [load, search, refresh])

  const changeProgress = async (anime, step, seasonId) => {
    const optimistic = withOptimisticEpisodeChange(anime, seasonId, step)
    setBusy(current => ({ ...current, [anime.id]: true }))
    setItems(current => current.map(item => item.id === anime.id ? optimistic : item))
    try {
      const updated = await updateEpisodeProgress(anime, step, seasonId)
      setItems(current => current.map(item => item.id === anime.id ? updated : item))
      toast(updated.status === 'completed' ? 'All seasons completed!' : 'Season progress updated.')
      if (updated.status !== anime.status) load({ reset: true, pageNumber: 0 })
    } catch (cause) {
      setItems(current => current.map(item => item.id === anime.id ? anime : item))
      toast(readableError(cause), 'error')
    } finally { setBusy(current => ({ ...current, [anime.id]: false })) }
  }

  const setEpisodeNumber = async (anime, seasonId, episodeNumber) => {
    setBusy(current => ({ ...current, [anime.id]: true }))
    setItems(current => current.map(item => item.id === anime.id ? withOptimisticEpisodeNumber(item, seasonId, episodeNumber) : item))
    try {
      const updated = await setSeasonEpisodeProgress(anime, seasonId, episodeNumber)
      setItems(current => current.map(item => item.id === anime.id ? updated : item))
      toast('Episode progress updated.')
      if (updated.status !== anime.status) load({ reset: true, pageNumber: 0 })
    } catch (cause) {
      setItems(current => current.map(item => item.id === anime.id ? anime : item))
      toast(readableError(cause), 'error')
      throw cause
    } finally { setBusy(current => ({ ...current, [anime.id]: false })) }
  }

  const favorite = async anime => {
    try {
      const updated = await toggleFavorite(anime)
      setItems(current => filter.favorites && !updated.is_favorite ? current.filter(item => item.id !== anime.id) : current.map(item => item.id === anime.id ? updated : item))
      toast(updated.is_favorite ? 'Added to favorites.' : 'Removed from favorites.')
    } catch (cause) { toast(readableError(cause), 'error') }
  }

  const clearFilters = () => { setFilter({ status: '', favorites: false, genre: '', rating: '' }); setSearch('') }
  const active = Boolean(search || filter.status || filter.favorites || filter.genre || filter.rating)

  return <div className="page library-page">
    <div className="page-heading"><div><span className="eyebrow"><Sparkles size={13}/> YOUR COLLECTION</span><h1>{heading}<span className="heading-count large-count">{loading ? '…' : count}</span></h1><p>Your series, with every season and episode together.</p></div><button className="primary-btn" onClick={onAdd}><span>＋</span> Add anime</button></div>
    <section className="library-toolbar"><label className="search-field"><Search size={18}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search titles, alternative names…" aria-label="Search anime"/>{search && <button onClick={() => setSearch('')} aria-label="Clear search"><X size={15}/></button>}<kbd>⌘ K</kbd></label><div className="filter-row"><FilterDropdown label="All status" value={filter.status} Icon={SlidersHorizontal} options={[{ value: '', label: 'All status' }, ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))]} onChange={status => setFilter(current => ({ ...current, status }))}/><FilterDropdown label="All genres" value={filter.genre} options={[{ value: '', label: 'All genres' }, ...GENRES.map(genre => ({ value: genre, label: genre }))]} onChange={genre => setFilter(current => ({ ...current, genre }))}/><FilterDropdown label="Any rating" value={filter.rating} options={[{ value: '', label: 'Any rating' }, { value: 'rated', label: 'Rated only' }, ...[8,7,6,5,4,3,2,1].map(value => ({ value: String(value), label: `${value}+ rating` }))]} onChange={rating => setFilter(current => ({ ...current, rating }))}/><FilterDropdown label="Recently added" value={String(sortIndex)} prefix="Sort:" variant="sort" options={sortOptions.map(([, label], index) => ({ value: String(index), label }))} onChange={index => setSortIndex(Number(index))}/></div>{active && <div className="active-filters"><span>FILTERED VIEW</span><button onClick={clearFilters}>Clear all <X size={12}/></button></div>}</section>
    {error && <div className="inline-error" role="alert">{error}<button onClick={() => load({ reset: true, pageNumber: 0 })}>Try again</button></div>}
    {loading ? <div className="card-grid library-grid">{Array.from({ length: 8 }, (_, index) => <div className="skeleton-card" key={index}/>)}</div> : items.length ? <><div className="card-grid library-grid">{items.map(anime => <AnimeCard key={anime.id} anime={anime} busy={busy[anime.id]} onOpen={() => navigate(`/anime/${anime.id}`)} onProgress={(step, seasonId) => changeProgress(anime, step, seasonId)} onSetEpisode={(seasonId, value) => setEpisodeNumber(anime, seasonId, value)} onInvalidEpisode={message => toast(message, 'error')} onFavorite={() => favorite(anime)}/>)}</div>{hasMore && <div className="load-more"><button className="outline-btn" disabled={loadingMore} onClick={() => load({ reset: false, pageNumber: page + 1 })}>{loadingMore ? <><LoaderCircle className="spin" size={16}/> Loading…</> : <>Load more series <ChevronDown size={16}/></>}</button><span>Showing {items.length} of {count}</span></div>}</> : <div className="empty-state library-empty"><span className="empty-symbol">✦</span><h3>{active ? 'No anime found' : 'Your list is a blank page.'}</h3><p>{active ? 'Try adjusting your search or filters.' : 'Start building a home for all the stories you love.'}</p>{active ? <button className="outline-btn" onClick={clearFilters}>Clear filters</button> : <button className="primary-btn" onClick={onAdd}>Add your first series</button>}</div>}
  </div>
}
