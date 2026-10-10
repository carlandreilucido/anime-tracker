import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { LoaderCircle, Search, UserRound, X } from 'lucide-react'
import { searchUsers } from '../../services/socialService'

const RESULT_LIMIT = 10

function UserResult({ user, onSelect, selected = false, optionId }) {
  const name = user.full_name?.trim() || user.username
  return <button id={optionId} type="button" role="option" aria-selected={selected} className="user-search-result" onClick={() => onSelect(user.username)}>
    <span className="user-search-avatar">{user.avatar_url ? <img src={user.avatar_url} alt=""/> : <UserRound size={17}/>}</span>
    <span className="user-search-result-copy"><strong>{name}</strong><small>@{user.username}</small></span>
  </button>
}

export default function UserSearch() {
  const navigate = useNavigate()
  const location = useLocation()
  const wrapperRef = useRef(null)
  const dropdownRef = useRef(null)
  const desktopInputRef = useRef(null)
  const mobileInputRef = useRef(null)
  const mobileTriggerRef = useRef(null)
  const requestVersion = useRef(0)
  const wasMobileOpen = useRef(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [desktopOpen, setDesktopOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [retryCount, setRetryCount] = useState(0)
  const [position, setPosition] = useState({ left: 0, top: 0, width: 300 })

  useEffect(() => {
    const term = query.trim()
    const version = ++requestVersion.current
    setResults([])
    setHasMore(false)
    setSelectedIndex(-1)
    setLoadingMore(false)
    setError('')
    if (term.length < 2 || (!desktopOpen && !mobileOpen)) {
      setLoading(false)
      return undefined
    }
    setLoading(true)
    const timer = window.setTimeout(async () => {
      try {
        const users = await searchUsers(term, { limit: RESULT_LIMIT, offset: 0 })
        if (version !== requestVersion.current) return
        setResults(users)
        setHasMore(users.length === RESULT_LIMIT)
      } catch (cause) {
        if (version === requestVersion.current) setError(cause.message || 'Could not search users. Try again.')
      } finally {
        if (version === requestVersion.current) setLoading(false)
      }
    }, 300)
    return () => window.clearTimeout(timer)
  }, [query, desktopOpen, mobileOpen, retryCount])

  useEffect(() => {
    if (!desktopOpen) return undefined
    const updatePosition = () => {
      const rect = wrapperRef.current?.getBoundingClientRect()
      if (rect) setPosition({ left: rect.left, top: rect.bottom + 7, width: rect.width })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [desktopOpen])

  useEffect(() => {
    if (!desktopOpen) return undefined
    const closeOnOutsideClick = event => {
      if (!wrapperRef.current?.contains(event.target) && !dropdownRef.current?.contains(event.target)) setDesktopOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick)
  }, [desktopOpen])

  useEffect(() => {
    if (mobileOpen) {
      wasMobileOpen.current = true
      mobileInputRef.current?.focus({ preventScroll: true })
    } else if (wasMobileOpen.current) {
      wasMobileOpen.current = false
      mobileTriggerRef.current?.focus({ preventScroll: true })
    }
  }, [mobileOpen])

  useEffect(() => {
    if (!mobileOpen) return undefined
    const closeOnEscape = event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setMobileOpen(false)
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [mobileOpen])

  useEffect(() => {
    setDesktopOpen(false)
    setMobileOpen(false)
    setQuery('')
  }, [location.pathname])

  const selectUser = username => {
    setDesktopOpen(false)
    setMobileOpen(false)
    setQuery('')
    navigate(`/users/${encodeURIComponent(username)}`)
  }

  const loadMore = async () => {
    if (loadingMore || !hasMore) return
    const version = requestVersion.current
    setLoadingMore(true)
    try {
      const users = await searchUsers(query.trim(), { limit: RESULT_LIMIT, offset: results.length })
      if (version !== requestVersion.current) return
      setResults(current => [...current, ...users])
      setHasMore(users.length === RESULT_LIMIT)
    } catch (cause) {
      if (version === requestVersion.current) setError(cause.message || 'Could not load more users.')
    } finally {
      if (version === requestVersion.current) setLoadingMore(false)
    }
  }

  const handleKeyDown = event => {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (mobileOpen) setMobileOpen(false)
      else { setDesktopOpen(false); desktopInputRef.current?.blur() }
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!results.length) return
      event.preventDefault()
      setSelectedIndex(current => event.key === 'ArrowDown'
        ? (current + 1) % results.length
        : (current - 1 + results.length) % results.length)
    } else if (event.key === 'Enter' && selectedIndex >= 0 && results[selectedIndex]) {
      event.preventDefault()
      selectUser(results[selectedIndex].username)
    }
  }

  const resultsContent = (mobile = false) => <>
    {query.trim().length < 2 ? <p className="user-search-hint">Type at least 2 characters to search.</p>
      : loading ? <div className="user-search-state"><LoaderCircle size={17} className="spin"/> Searching users…</div>
      : error ? <div className="user-search-state error" role="alert">{error}<button type="button" onClick={() => setRetryCount(value => value + 1)}>Retry search</button></div>
          : results.length ? <>
            <div id={mobile ? 'mobile-user-search-results' : 'desktop-user-search-results'} className="user-search-results" role="listbox" aria-label="Matching users">
              {results.map((user, index) => <UserResult key={user.id} user={user} onSelect={selectUser} selected={selectedIndex === index} optionId={`${mobile ? 'mobile' : 'desktop'}-user-option-${index}`}/>) }
            </div>
            {hasMore && <button type="button" className="user-search-more" onClick={loadMore} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Load more users'}</button>}
          </>
          : <p className="user-search-state">No users found.</p>}
  </>

  return <>
    <div className="user-search-desktop" ref={wrapperRef}>
      <label className="user-search-control"><Search size={17}/><input ref={desktopInputRef} type="search" value={query} placeholder="Search people" role="combobox" aria-label="Search users by username or name" aria-autocomplete="list" aria-expanded={desktopOpen} aria-controls="desktop-user-search-results" aria-activedescendant={selectedIndex >= 0 ? `desktop-user-option-${selectedIndex}` : undefined} onFocus={() => setDesktopOpen(true)} onChange={event => { setQuery(event.target.value); setDesktopOpen(true) }} onKeyDown={handleKeyDown}/>{query && <button type="button" className="user-search-clear" onClick={() => { setQuery(''); desktopInputRef.current?.focus() }} aria-label="Clear user search"><X size={14}/></button>}</label>
      {desktopOpen && createPortal(<div ref={dropdownRef} className="user-search-dropdown" style={position}>{resultsContent(false)}</div>, document.body)}
    </div>
    <button ref={mobileTriggerRef} type="button" className="user-search-mobile-trigger" aria-label="Search users" onClick={() => setMobileOpen(true)}><Search size={19}/></button>
    {mobileOpen && createPortal(<div className="user-search-mobile-overlay" role="dialog" aria-modal="true" aria-label="Search users" onMouseDown={event => { if (event.target === event.currentTarget) setMobileOpen(false) }}>
      <div className="user-search-mobile-panel">
        <header className="user-search-mobile-header"><label className="user-search-control"><Search size={18}/><input ref={mobileInputRef} autoFocus type="search" value={query} placeholder="Search username or name" role="combobox" aria-label="Search users by username or name" aria-autocomplete="list" aria-expanded="true" aria-controls="mobile-user-search-results" aria-activedescendant={selectedIndex >= 0 ? `mobile-user-option-${selectedIndex}` : undefined} onChange={event => setQuery(event.target.value)} onKeyDown={handleKeyDown}/></label><button type="button" className="user-search-mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close user search"><X size={20}/></button></header>
        <div className="user-search-mobile-content">{resultsContent(true)}</div>
      </div>
    </div>, document.body)}
  </>
}
