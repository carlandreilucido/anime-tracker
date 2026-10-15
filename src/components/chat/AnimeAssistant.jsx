import { useCallback, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  ArrowUpRight, BookOpen, Clock3, ImageOff, LoaderCircle, Plus,
  Send, Trash2, X,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../ui/Toast'
import Modal from '../ui/Modal'
import AnimeForm from '../anime/AnimeForm'
import KitsuMascot from './KitsuMascot'
import {
  createChatConversation, deleteChatConversation, getChatMessages,
  listChatConversations, sendChatMessage,
} from '../../services/chatService'
import { createAnime } from '../../services/animeService'
import { animeMatchKeys, getMyAnimeMatchKeys } from '../../services/socialService'
import { findAnimeWatchProviders } from '../../services/providers'
import { getTvmazeInstallments, getTvmazeShowAliases, getTvmazeShowById, searchTvmazeShows } from '../../services/tvmazeService'
import { findExactAnimeMatch, normalizeAnimeTitle } from '../../services/recommendationResolver'

const WELCOME_MESSAGE = "Hey there! 👋 I'm Kitsu, your personal anime companion! 💜\n\nI can help you discover anime, find hidden gems, recommend shows based on your library, and keep track of your anime journey.\n\nNot sure what to watch next? Just ask me!"
const SUGGESTIONS = [
  'Recommend an anime based on my library',
  'Suggest an underrated anime',
  'What anime should I watch next?',
  'Find anime similar to my favorites',
]

function welcomeMessage(conversationId) {
  return { id: `welcome:${conversationId}`, role: 'assistant', content: WELCOME_MESSAGE, metadata: { recommendations: [] }, created_at: new Date().toISOString() }
}

function toPlainText(html = '') {
  if (!html || typeof DOMParser === 'undefined') return ''
  return new DOMParser().parseFromString(html, 'text/html').body.textContent?.replace(/\s+/g, ' ').trim() || ''
}

export default function AnimeAssistant({ openRequest = 0 }) {
  const { user } = useAuth()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [conversations, setConversations] = useState([])
  const [hasMoreConversations, setHasMoreConversations] = useState(false)
  const [loadingMoreConversations, setLoadingMoreConversations] = useState(false)
  const [conversation, setConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasOlderMessages, setHasOlderMessages] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [retryRequest, setRetryRequest] = useState(null)
  const [adding, setAdding] = useState(null)
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState('')
  const [resolvingRecommendation, setResolvingRecommendation] = useState(null)
  const [inLibraryRecommendations, setInLibraryRecommendations] = useState(() => new Set())
  const [hydrated, setHydrated] = useState(false)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const requestInFlight = useRef(false)
  const resolvingRef = useRef(new Set())
  const recommendationLookupKey = useRef('')
  const recommendationLookups = useRef(new Map())
  const scrollAnchor = useRef(null)
  const handledOpenRequest = useRef(0)

  const introStorageKey = useCallback(id => `kitsu-assistant-intro:${user?.id || 'guest'}:${id}`, [user?.id])
  const hasSeenIntro = useCallback(id => {
    try { return window.localStorage.getItem(introStorageKey(id)) === 'seen' } catch { return false }
  }, [introStorageKey])
  const markIntroSeen = useCallback(id => {
    try { window.localStorage.setItem(introStorageKey(id), 'seen') } catch { /* The intro remains available for this session. */ }
  }, [introStorageKey])

  useEffect(() => {
    const recommendations = messages.filter(message => message.role === 'assistant').flatMap(message =>
      (message.metadata?.recommendations || []).map((item, index) => ({
        id: `${message.id}:${index}:${normalizeAnimeTitle(item?.title || '')}`,
        item,
      })).filter(({ item }) => item?.title))
    if (!recommendations.length) {
      recommendationLookupKey.current = `${user?.id || ''}:empty`
      setInLibraryRecommendations(current => current.size ? new Set() : current)
      return undefined
    }
    const lookupKey = `${user?.id || ''}:${recommendations.map(({ id }) => id).join('|')}`
    if (recommendationLookupKey.current === lookupKey && recommendationLookups.current.has(lookupKey)) return undefined
    recommendationLookupKey.current = lookupKey
    let lookup = recommendationLookups.current.get(lookupKey)
    if (!lookup) {
      lookup = getMyAnimeMatchKeys(recommendations.map(({ item }) => ({
        title: item.title,
        external_provider: item.tvmaze?.id ? 'tvmaze' : null,
        external_id: item.tvmaze?.id || null,
      })))
      recommendationLookups.current.set(lookupKey, lookup)
      if (recommendationLookups.current.size > 20) recommendationLookups.current.delete(recommendationLookups.current.keys().next().value)
    }
    lookup.then(keys => {
      if (recommendationLookupKey.current === lookupKey) setInLibraryRecommendations(new Set(recommendations
        .filter(({ item }) => animeMatchKeys({
          title: item.title,
          external_provider: item.tvmaze?.id ? 'tvmaze' : null,
          external_id: item.tvmaze?.id || null,
        }).some(key => keys.has(key)))
        .map(({ id }) => id)))
    }).catch(() => {
      recommendationLookups.current.delete(lookupKey)
      if (recommendationLookupKey.current === lookupKey) setInLibraryRecommendations(new Set())
    })
    return undefined
  }, [messages, user?.id])

  const loadConversationList = useCallback(async (offset = 0) => {
    const result = await listChatConversations(offset)
    setConversations(current => offset ? [...current, ...result.items] : result.items)
    setHasMoreConversations(result.hasMore)
    return result.items
  }, [])

  const openConversation = useCallback(async selected => {
    setConversation(selected)
    setShowHistory(false)
    setMessages([])
    setHasOlderMessages(false)
    setError('')
    setRetryRequest(null)
    setLoadingHistory(true)
    try {
      const loaded = await getChatMessages(selected.id)
      if (!loaded.length && !hasSeenIntro(selected.id)) {
        setMessages([welcomeMessage(selected.id)])
        markIntroSeen(selected.id)
      } else setMessages(loaded)
      setHasOlderMessages(loaded.length === 50)
    }
    catch (cause) { setError(cause.message || 'Could not load this conversation.') }
    finally { setLoadingHistory(false) }
  }, [hasSeenIntro, markIntroSeen])

  const openAssistant = useCallback(async () => {
    setOpen(true)
    if (!hydrated) {
      setLoadingHistory(true)
      try {
        const list = await loadConversationList()
        if (list[0]) await openConversation(list[0])
        else if (!hasSeenIntro('draft')) {
          setMessages([welcomeMessage('draft')])
          markIntroSeen('draft')
        }
        setHydrated(true)
      } catch (cause) { setError(cause.message || 'Could not load chat history.') }
      finally { setLoadingHistory(false) }
    }
    window.setTimeout(() => inputRef.current?.focus(), 80)
  }, [hydrated, hasSeenIntro, loadConversationList, markIntroSeen, openConversation])

  useEffect(() => {
    if (openRequest <= handledOpenRequest.current) return
    handledOpenRequest.current = openRequest
    openAssistant()
  }, [openRequest, openAssistant])

  useEffect(() => {
    if (!open || window.matchMedia('(min-width: 768px)').matches) return undefined
    const viewport = window.visualViewport
    const syncVisualViewport = () => {
      document.documentElement.style.setProperty('--assistant-viewport-height', `${viewport?.height || window.innerHeight}px`)
      document.documentElement.style.setProperty('--assistant-viewport-top', `${viewport?.offsetTop || 0}px`)
    }
    syncVisualViewport()
    viewport?.addEventListener('resize', syncVisualViewport)
    viewport?.addEventListener('scroll', syncVisualViewport)
    window.addEventListener('resize', syncVisualViewport)
    return () => {
      viewport?.removeEventListener('resize', syncVisualViewport)
      viewport?.removeEventListener('scroll', syncVisualViewport)
      window.removeEventListener('resize', syncVisualViewport)
      document.documentElement.style.removeProperty('--assistant-viewport-height')
      document.documentElement.style.removeProperty('--assistant-viewport-top')
    }
  }, [open])

  useEffect(() => {
    const textarea = inputRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    const maxHeight = Number.parseFloat(window.getComputedStyle(textarea).maxHeight) || 120
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [input, open])

  useEffect(() => {
    if (!open) return undefined
    const container = scrollRef.current
    if (container && scrollAnchor.current) {
      container.scrollTop = scrollAnchor.current.scrollTop + (container.scrollHeight - scrollAnchor.current.scrollHeight)
      scrollAnchor.current = null
    } else container?.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
    return undefined
  }, [open, messages, sending])

  const createConversation = async () => {
    setLoadingHistory(true)
    try {
      const created = await createChatConversation()
      setConversations(current => [created, ...current.filter(item => item.id !== created.id)].slice(0, 30))
      setConversation(created)
      setMessages([welcomeMessage(created.id)])
      markIntroSeen(created.id)
      setHasOlderMessages(false)
      setRetryRequest(null)
      setError('')
      setShowHistory(false)
      inputRef.current?.focus()
    } catch (cause) { setError(cause.message || 'Could not start a new conversation.') }
    finally { setLoadingHistory(false) }
  }

  const loadOlderMessages = async () => {
    if (!conversation || !messages[0]?.created_at || loadingOlder) return
    setLoadingOlder(true)
    try {
      const older = await getChatMessages(conversation.id, 50, messages[0].created_at)
      const container = scrollRef.current
      if (container) scrollAnchor.current = { scrollHeight: container.scrollHeight, scrollTop: container.scrollTop }
      setMessages(current => [...older, ...current])
      setHasOlderMessages(older.length === 50)
    } catch { setError('Could not load older messages.') }
    finally { setLoadingOlder(false) }
  }

  const removeConversation = async (event, selected) => {
    event.stopPropagation()
    try {
      await deleteChatConversation(selected.id)
      setConversations(current => current.filter(item => item.id !== selected.id))
      if (conversation?.id === selected.id) {
        setConversation(null)
        setMessages([])
      }
      toast('Conversation deleted.')
    } catch { toast('Could not delete that conversation. Please retry.', 'error') }
  }

  const loadMoreConversations = async () => {
    if (loadingMoreConversations) return
    setLoadingMoreConversations(true)
    try { await loadConversationList(conversations.length) }
    catch (cause) { setError(cause.message || 'Could not load older conversations.') }
    finally { setLoadingMoreConversations(false) }
  }

  const performSend = async (text, existingRequest = null) => {
    const messageText = text.trim()
    if (!messageText || requestInFlight.current) return
    requestInFlight.current = true
    setSending(true)
    setError('')
    const requestId = existingRequest?.requestId || crypto.randomUUID()
    let targetConversation = conversation
    try {
      if (!targetConversation) {
        targetConversation = await createChatConversation()
        setConversation(targetConversation)
        setConversations(current => [targetConversation, ...current].slice(0, 30))
        markIntroSeen(targetConversation.id)
      }
      if (!existingRequest) {
        setMessages(current => [...current, { id: `pending-${requestId}`, role: 'user', content: messageText, created_at: new Date().toISOString() }])
        setInput('')
      }
      const response = await sendChatMessage(targetConversation.id, messageText, requestId)
      setMessages(current => [
        ...current.filter(message => message.id !== `pending-${requestId}` && message.client_request_id !== requestId),
        response.user_message,
        response.assistant_message,
      ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()))
      setRetryRequest(null)
      loadConversationList().catch(() => {})
    } catch (cause) {
      setError(cause.message || 'The assistant could not respond. Please retry.')
      setRetryRequest({ message: messageText, requestId })
    } finally {
      setSending(false)
      requestInFlight.current = false
      inputRef.current?.focus()
    }
  }

  const submit = event => {
    event.preventDefault()
    performSend(input)
  }

  const addRecommendation = async (recommendation, recommendationId) => {
    if (resolvingRef.current.has(recommendationId)) return
    resolvingRef.current.add(recommendationId)
    setResolvingRecommendation(recommendationId)
    setAddError('')
    const recommendedTitle = recommendation.title?.trim() || ''
    const providerData = recommendation.tvmaze || {}
    const identityFor = (title, showId = providerData.id) => ({
      title,
      external_provider: showId ? 'tvmaze' : null,
      external_id: showId || null,
    })
    const findAlreadySaved = async (show, aliases = []) => {
      const titles = [recommendedTitle, show?.name, ...aliases.map(alias => alias?.name)]
        .filter(Boolean)
      if (!titles.length && !show?.id) return false
      const candidates = titles.map(title => identityFor(title, show?.id || providerData.id))
      if (show?.id) candidates.push(identityFor(show.name || recommendedTitle, show.id))
      const found = await getMyAnimeMatchKeys(candidates).catch(() => new Set())
      if (!candidates.some(candidate => animeMatchKeys(candidate).some(key => found.has(key)))) return false
      setInLibraryRecommendations(current => new Set([...current, recommendationId]))
      return true
    }
    const fallbackValues = (show = null, aliases = []) => ({
      title: show?.name || providerData.name || recommendedTitle,
      alternative_title: aliases.find(alias => alias?.name && normalizeAnimeTitle(alias.name) !== normalizeAnimeTitle(show?.name || recommendedTitle))?.name
        || (normalizeAnimeTitle(recommendedTitle) !== normalizeAnimeTitle(show?.name || providerData.name || recommendedTitle) ? recommendedTitle : ''),
      poster_url: show?.image?.original || show?.image?.medium || providerData.image_original || providerData.image || '',
      genres: show?.genres?.length ? show.genres : providerData.genres || [],
      rating: '',
      notes: '',
      synopsis: toPlainText(show?.summary || providerData.synopsis || ''),
      release_date: show?.premiered || providerData.premiered || '',
      community_rating: show?.rating?.average ?? providerData.community_rating ?? '',
      external_provider: show?.id || providerData.id ? 'tvmaze' : null,
      external_id: show?.id || providerData.id || null,
      external_url: show?.url || providerData.url || (show?.id || providerData.id ? `https://www.tvmaze.com/shows/${show?.id || providerData.id}` : null),
      metadata_updated_at: new Date().toISOString(),
    })

    try {
      let show = null
      let aliases = []
      if (providerData.id) {
        show = await getTvmazeShowById(providerData.id).catch(() => null)
        if (!show) show = {
          id: providerData.id,
          name: providerData.name || recommendedTitle,
          premiered: providerData.premiered || null,
          image: providerData.image_original || providerData.image
            ? { original: providerData.image_original || providerData.image, medium: providerData.image || providerData.image_original }
            : null,
          genres: providerData.genres || [],
          summary: providerData.synopsis || '',
          rating: { average: providerData.community_rating ?? null },
          url: providerData.url || `https://www.tvmaze.com/shows/${providerData.id}`,
        }
        aliases = await getTvmazeShowAliases(show.id).catch(() => [])
      } else {
        const matches = await searchTvmazeShows(recommendedTitle).catch(() => [])
        show = findExactAnimeMatch(recommendedTitle, matches)
        if (!show && matches.length) {
          const aliasResults = await Promise.all(matches.slice(0, 6).map(async candidate => [
            candidate.id,
            await getTvmazeShowAliases(candidate.id).catch(() => []),
          ]))
          const aliasesById = new Map(aliasResults)
          show = findExactAnimeMatch(recommendedTitle, matches, aliasesById)
          if (show) aliases = aliasesById.get(show.id) || []
        } else if (show) aliases = await getTvmazeShowAliases(show.id).catch(() => [])
      }

      if (await findAlreadySaved(show, aliases)) {
        return
      }

      const fallback = fallbackValues(show, aliases)
      if (show) {
        const installments = await getTvmazeInstallments(show).catch(() => [])
        if (installments.length) {
          setAdding({
            recommendationId,
            ...fallback,
            seasons: installments.map((season, index) => ({
              season_number: index + 1,
              season_title: season.season_title,
              total_episodes: season.total_episodes ?? '',
              current_episode: 0,
              status: 'plan_to_watch',
              date_started: '',
              media_type: season.media_type || 'tv',
              external_provider: season.season_id ? 'tvmaze' : null,
              external_id: season.season_id || null,
              external_show_id: season.show_id || show.id,
              external_url: season.external_url || null,
            })),
            initialMode: 'manual',
          })
        } else {
          setAdding({
            recommendationId,
            ...fallback,
            seasons: [{ season_number: 1, season_title: `Season 1`, total_episodes: '', current_episode: 0, status: 'plan_to_watch', date_started: '', media_type: 'tv', external_show_id: show.id }],
            initialMode: 'manual',
          })
        }
      } else {
        setAdding({
          recommendationId,
          ...fallback,
          seasons: [{ season_number: 1, season_title: 'Season 1', total_episodes: '', current_episode: 0, status: 'plan_to_watch', date_started: '' }],
          initialMode: 'search',
          searchQuery: recommendedTitle,
          searchFallback: fallback,
        })
      }
      setOpen(false)
    } catch {
      const fallback = fallbackValues()
      setAdding({
        recommendationId,
        ...fallback,
        seasons: [{ season_number: 1, season_title: 'Season 1', total_episodes: '', current_episode: 0, status: 'plan_to_watch', date_started: '' }],
        initialMode: 'search',
        searchQuery: recommendedTitle,
        searchFallback: fallback,
      })
      setOpen(false)
    } finally {
      resolvingRef.current.delete(recommendationId)
      setResolvingRecommendation(null)
    }
  }

  const saveRecommendation = async values => {
    setAddSaving(true)
    setAddError('')
    try {
      const added = await createAnime(values)
      if (adding?.recommendationId) {
        setInLibraryRecommendations(current => new Set([...current, adding.recommendationId]))
      }
      setAdding(null)
      toast('Anime added to your library.')
      window.dispatchEvent(new Event('kitsu:library-refresh'))
      findAnimeWatchProviders(added.id).catch(() => {})
    } catch (cause) {
      if (cause.code === '23505' || /already in your library|already exists/i.test(cause.message || '')) {
        if (adding?.recommendationId) {
          setInLibraryRecommendations(current => new Set([...current, adding.recommendationId]))
        }
        setAdding(null)
        toast('This anime is already in your library.')
        return
      }
      const message = cause.code === '23505' ? 'This anime is already in your library.' : cause.message || 'Could not add this anime.'
      setAddError(message)
      throw new Error(message)
    } finally { setAddSaving(false) }
  }

  if (!user) return null

  return <>
    {!open && <KitsuMascot className="assistant-launcher" onClick={openAssistant}/>}
    {open && <div className="assistant-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false) }}>
      <section className="assistant-window" role="dialog" aria-modal="true" aria-label="Kitsu anime assistant">
        <header className="assistant-header">
          <div className="assistant-brand-mark"><img src="/mascots/kitsu-open.webp" alt="" width="40" height="40"/></div>
          <div className="assistant-heading-copy"><strong>Kitsu Assistant</strong><span>Your personal anime companion</span></div>
          <button className="assistant-icon-button" onClick={createConversation} aria-label="New conversation" title="New conversation"><Plus size={18}/></button>
          <button className={`assistant-icon-button ${showHistory ? 'selected' : ''}`} onClick={() => { setShowHistory(value => !value); loadConversationList().catch(() => {}) }} aria-label="Conversation history" title="Conversation history"><Clock3 size={17}/></button>
          <button className="assistant-icon-button" onClick={() => setOpen(false)} aria-label="Close assistant"><X size={19}/></button>
        </header>

        {showHistory && <div className="assistant-history-panel">
          <div className="assistant-history-heading"><strong>Recent conversations</strong><button onClick={() => setShowHistory(false)} aria-label="Close history"><X size={15}/></button></div>
          {conversations.length ? conversations.map(item => <div className={`assistant-history-row ${conversation?.id === item.id ? 'active' : ''}`} key={item.id}><button className="assistant-history-item" onClick={() => openConversation(item)}><span>{item.title}</span><small>{new Date(item.updated_at).toLocaleDateString()}</small></button><button className="assistant-history-delete" onClick={event => removeConversation(event, item)} aria-label={`Delete ${item.title}`} title="Delete conversation"><Trash2 size={14}/></button></div>) : <p className="assistant-history-empty">Your saved chats will appear here.</p>}
          {hasMoreConversations && <button className="assistant-load-conversations" onClick={loadMoreConversations} disabled={loadingMoreConversations}>{loadingMoreConversations ? 'Loading…' : 'Load older conversations'}</button>}
          <button className="assistant-new-chat" onClick={createConversation}><Plus size={15}/> New conversation</button>
        </div>}

        <div className="assistant-messages" ref={scrollRef} aria-live="polite">
          {messages.length > 0 && hasOlderMessages && <button className="assistant-load-older" onClick={loadOlderMessages} disabled={loadingOlder}>{loadingOlder ? <LoaderCircle className="assistant-spin" size={13}/> : <Clock3 size={13}/>} Load older messages</button>}
          {loadingHistory ? <div className="assistant-loading"><LoaderCircle className="assistant-spin" size={18}/> Loading your chat…</div> : messages.map(message => <article className={`assistant-message ${message.role} ${message.id.startsWith('welcome:') ? 'welcome-message' : ''}`} key={message.id}>
          <div className="assistant-message-avatar">{message.role === 'assistant' ? <img src="/mascots/kitsu-open.webp" alt="Kitsu" width="32" height="32"/> : <span>{user.email?.[0]?.toUpperCase() || 'Y'}</span>}</div>
            <div className="assistant-message-body"><div className="assistant-bubble">{message.role === 'assistant'
              ? <ReactMarkdown components={{ a: ({ href, children, ...props }) => <a href={href} target="_blank" rel="noreferrer" {...props}>{children}</a> }}>{message.content}</ReactMarkdown>
              : message.content}</div>
              {message.id.startsWith('welcome:') && messages.length === 1 && <div className="assistant-suggestions">{SUGGESTIONS.map(suggestion => <button type="button" key={suggestion} onClick={() => performSend(suggestion)}>{suggestion}</button>)}</div>}
              {message.role === 'assistant' && (message.metadata?.recommendations || []).map((card, index) => {
                const show = card.tvmaze || {}
                const recommendationId = `${message.id}:${index}:${normalizeAnimeTitle(card.title || '')}`
                const inLibrary = inLibraryRecommendations.has(recommendationId)
                const resolving = resolvingRecommendation === recommendationId
                const genres = show.genres || card.genres || []
                const episodeCount = Number.isInteger(show.episode_count) ? show.episode_count : card.episode_count
                const synopsis = toPlainText(show.synopsis || '')
                return <article className="assistant-recommendation-card" key={`${message.id}-${show.id || card.title}-${index}`}>
                  {show.image ? <img src={show.image} alt="" loading="lazy" onError={event => { event.currentTarget.hidden = true; event.currentTarget.nextElementSibling?.removeAttribute('hidden') }}/> : null}
                  <div className="assistant-recommendation-poster-placeholder" hidden={Boolean(show.image)} aria-hidden="true"><ImageOff size={19}/><span>Poster unavailable</span></div>
                  <div className="assistant-recommendation-copy"><strong>{show.name || card.title}</strong>
                    <span>{[show.premiered?.slice(0, 4) || 'Year unavailable', ...(genres.length ? genres.slice(0, 3) : ['Genres unavailable'])].filter(Boolean).join(' · ')}</span>
                    {card.reason && <p>{card.reason}</p>}
                    {synopsis && <small>{synopsis.slice(0, 220)}{synopsis.length > 220 ? '…' : ''}</small>}
                    <div className="assistant-card-actions"><span>{Number.isInteger(episodeCount) ? `${episodeCount} episodes` : 'Episode count unavailable'}</span>
                      {show.url && <a href={show.url} target="_blank" rel="noreferrer">TVmaze <ArrowUpRight size={12}/></a>}
                      <button disabled={inLibrary || resolving || addSaving} onClick={() => addRecommendation(card, recommendationId)}>{inLibrary ? 'In Library' : resolving ? <><LoaderCircle className="assistant-spin" size={13}/> Finding anime…</> : <><Plus size={13}/> Add to Library</>}</button>
                    </div>
                  </div>
                </article>
              })}
            </div>
          </article>)}
          {sending && <div className="assistant-typing"><span/><span/><span/><em>Kitsu is thinking…</em></div>}
          {error && <div className="assistant-error" role="alert"><span>{error}</span>{retryRequest && <button onClick={() => performSend(retryRequest.message, retryRequest)}>Retry</button>}</div>}
        </div>

        {messages.length === 0 && !loadingHistory && <div className="assistant-data-note"><BookOpen size={13}/> Library questions use only your private Kitsu data. Catalog matches are credited to TVmaze.</div>}
        <form className="assistant-input-row rounded-2xl transition-colors focus-within:!border-primary" onSubmit={submit}>
          <textarea className="w-full resize-none border-0 bg-transparent" ref={inputRef} value={input} onChange={event => setInput(event.target.value.slice(0, 1800))} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(event) } }} placeholder="Ask about anime or your library…" maxLength={1800} rows={1} aria-label="Message the anime assistant" disabled={sending}/>
          <span className="assistant-char-count">{input.length}/1800</span>
          <button type="submit" disabled={!input.trim() || sending} aria-label="Send message"><Send size={17}/></button>
        </form>
        <footer className="assistant-footer">AI responses can be mistaken. Library details are retrieved from your account.</footer>
      </section>
    </div>}

    {adding && <Modal title={`Add ${adding.title} to your library`} wide onClose={() => { if (!addSaving) { setAdding(null); setAddError('') } }}>
      <div className="assistant-add-modal-content"><p className="assistant-add-note">Review the anime details and installments before saving. You can choose a matching anime or add it manually.</p>{addError && <p className="form-error" role="alert">{addError}</p>}<AnimeForm key={adding.recommendationId || adding.external_id || adding.title} initial={adding} initialMode={adding.initialMode || 'manual'} initialSearchQuery={adding.searchQuery || ''} initialSearchFallback={adding.searchFallback || adding} onSubmit={saveRecommendation} saving={addSaving}/></div>
    </Modal>}
  </>
}
