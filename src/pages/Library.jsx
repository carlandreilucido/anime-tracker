import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Search, SlidersHorizontal, ChevronDown, LoaderCircle, Sparkles, X } from 'lucide-react'
import { GENRES, STATUS_LABELS } from '../constants'
import { getAnime, toggleFavorite, updateEpisodeProgress, withOptimisticEpisodeChange } from '../services/animeService'
import AnimeCard from '../components/anime/AnimeCard'
import { useToast } from '../components/ui/Toast'
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
    <section className="library-toolbar"><label className="search-field"><Search size={18}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search titles, alternative names…" aria-label="Search anime"/>{search && <button onClick={() => setSearch('')} aria-label="Clear search"><X size={15}/></button>}<kbd>⌘ K</kbd></label><div className="filter-row"><label className="select-filter"><SlidersHorizontal size={15}/><select value={filter.status} onChange={event => setFilter(current => ({ ...current, status: event.target.value }))}><option value="">All statuses</option>{Object.entries(STATUS_LABELS).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select><ChevronDown size={14}/></label><label className="select-filter"><select value={filter.genre} onChange={event => setFilter(current => ({ ...current, genre: event.target.value }))}><option value="">All genres</option>{GENRES.map(genre => <option key={genre}>{genre}</option>)}</select><ChevronDown size={14}/></label><label className="select-filter"><select value={filter.rating} onChange={event => setFilter(current => ({ ...current, rating: event.target.value }))}><option value="">Any rating</option><option value="rated">Rated only</option>{[8,7,6,5,4,3,2,1].map(value => <option value={value} key={value}>{value}+ rating</option>)}</select><ChevronDown size={14}/></label><label className="select-filter sort-filter"><span>Sort:</span><select value={sortIndex} onChange={event => setSortIndex(Number(event.target.value))}>{sortOptions.map(([key, label], index) => <option key={`${key}-${label}`} value={index}>{label}</option>)}</select><ChevronDown size={14}/></label></div>{active && <div className="active-filters"><span>FILTERED VIEW</span><button onClick={clearFilters}>Clear all <X size={12}/></button></div>}</section>
    {error && <div className="inline-error" role="alert">{error}<button onClick={() => load({ reset: true, pageNumber: 0 })}>Try again</button></div>}
    {loading ? <div className="card-grid library-grid">{Array.from({ length: 8 }, (_, index) => <div className="skeleton-card" key={index}/>)}</div> : items.length ? <><div className="card-grid library-grid">{items.map(anime => <AnimeCard key={anime.id} anime={anime} busy={busy[anime.id]} onOpen={() => navigate(`/anime/${anime.id}`)} onProgress={(step, seasonId) => changeProgress(anime, step, seasonId)} onFavorite={() => favorite(anime)}/>)}</div>{hasMore && <div className="load-more"><button className="outline-btn" disabled={loadingMore} onClick={() => load({ reset: false, pageNumber: page + 1 })}>{loadingMore ? <><LoaderCircle className="spin" size={16}/> Loading…</> : <>Load more series <ChevronDown size={16}/></>}</button><span>Showing {items.length} of {count}</span></div>}</> : <div className="empty-state library-empty"><span className="empty-symbol">✦</span><h3>{active ? 'No anime found' : 'Your list is a blank page.'}</h3><p>{active ? 'Try adjusting your search or filters.' : 'Start building a home for all the stories you love.'}</p>{active ? <button className="outline-btn" onClick={clearFilters}>Clear filters</button> : <button className="primary-btn" onClick={onAdd}>Add your first series</button>}</div>}
  </div>
}
