import { useCallback, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  ArrowUpRight, BookOpen, Clock3, LoaderCircle, Plus,
  Send, Sparkles, Trash2, X,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../ui/Toast'
import Modal from '../ui/Modal'
import AnimeForm from '../anime/AnimeForm'
import {
  createChatConversation, deleteChatConversation, getChatMessages,
  listChatConversations, sendChatMessage,
} from '../../services/chatService'
import { createAnime } from '../../services/animeService'
import { findAnimeWatchProviders } from '../../services/providers'
import { getTvmazeInstallments, getTvmazeShowAliases } from '../../services/tvmazeService'

const SUGGESTIONS = [
  'Recommend anime like Dragon Ball.',
  'What should I watch next based on my library?',
  'Recommend a romance anime.',
  'Suggest an underrated anime.',
  'Analyze my highly rated anime.',
  'Recommend a short anime.',
]

function normalizeTitle(value = '') {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
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
  const [hydrated, setHydrated] = useState(false)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const requestInFlight = useRef(false)
  const scrollAnchor = useRef(null)
  const handledOpenRequest = useRef(0)

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
      setMessages(loaded)
      setHasOlderMessages(loaded.length === 50)
    }
    catch (cause) { setError(cause.message || 'Could not load this conversation.') }
    finally { setLoadingHistory(false) }
  }, [])

  const openAssistant = useCallback(async () => {
    setOpen(true)
    if (!hydrated) {
      setLoadingHistory(true)
      try {
        const list = await loadConversationList()
        if (list[0]) await openConversation(list[0])
        setHydrated(true)
      } catch (cause) { setError(cause.message || 'Could not load chat history.') }
      finally { setLoadingHistory(false) }
    }
    window.setTimeout(() => inputRef.current?.focus(), 80)
  }, [hydrated, loadConversationList, openConversation])

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
      setMessages([])
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

  const addRecommendation = async show => {
    setAddError('')
    setAddSaving(true)
    try {
      const [installments, aliases] = await Promise.all([
        getTvmazeInstallments(show),
        getTvmazeShowAliases(show.id).catch(() => []),
      ])
      const alternative = aliases.find(alias => alias.name && normalizeTitle(alias.name) !== normalizeTitle(show.name))?.name || ''
      setAdding({
        title: show.name || '',
        alternative_title: alternative,
        poster_url: show.image_original || show.image || '',
        genres: Array.isArray(show.genres) ? show.genres : [],
        rating: '',
        notes: '',
        synopsis: toPlainText(show.summary),
        release_date: show.premiered || null,
        community_rating: show.rating?.average ?? null,
        external_provider: 'tvmaze',
        external_id: show.id,
        external_url: show.url || `https://www.tvmaze.com/shows/${show.id}`,
        metadata_updated_at: new Date().toISOString(),
        seasons: installments.map((season, index) => ({
          season_number: index + 1,
          season_title: season.season_title,
          total_episodes: season.total_episodes,
          current_episode: 0,
          status: 'plan_to_watch',
          date_started: '',
          media_type: season.media_type || 'tv',
          external_provider: season.season_id ? 'tvmaze' : null,
          external_id: season.season_id || null,
          external_show_id: season.show_id || show.id,
          external_url: season.external_url || null,
        })),
      })
    } catch (cause) {
      const message = cause.message || 'Could not load seasons for this recommendation. You can still add it manually.'
      setAddError(message)
      toast(message, 'error')
    } finally { setAddSaving(false) }
  }

  const saveRecommendation = async values => {
    setAddSaving(true)
    setAddError('')
    try {
      const added = await createAnime(values)
      setAdding(null)
      toast('Anime added to your library.')
      window.dispatchEvent(new Event('kitsu:library-refresh'))
      findAnimeWatchProviders(added.id).catch(() => {})
    } catch (cause) {
      const message = cause.code === '23505' ? 'This anime is already in your library.' : cause.message || 'Could not add this anime.'
      setAddError(message)
      throw new Error(message)
    } finally { setAddSaving(false) }
  }

  if (!user) return null

  return <>
    {!open && <button className="assistant-launcher" onClick={openAssistant} aria-label="Open Kitsu anime assistant"><Sparkles size={19}/><span>Anime AI</span></button>}
    {open && <div className="assistant-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false) }}>
      <section className="assistant-window" role="dialog" aria-modal="true" aria-label="Kitsu anime assistant">
        <header className="assistant-header">
          <div className="assistant-brand-mark"><Sparkles size={17}/></div>
          <div className="assistant-heading-copy"><strong>Kitsu assistant</strong><span>Anime discovery, grounded in your library</span></div>
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
          {loadingHistory ? <div className="assistant-loading"><LoaderCircle className="assistant-spin" size={18}/> Loading your chat…</div> : messages.length === 0 ? <div className="assistant-welcome">
            <span className="assistant-welcome-icon"><Sparkles size={20}/></span>
            <h2>What are you in the mood for?</h2>
            <p>Ask about anime, recommendations, or your own watchlist.</p>
            <div className="assistant-suggestions">{SUGGESTIONS.map(suggestion => <button key={suggestion} onClick={() => performSend(suggestion)}>{suggestion}</button>)}</div>
          </div> : messages.map(message => <article className={`assistant-message ${message.role}`} key={message.id}>
            <div className="assistant-message-avatar">{message.role === 'assistant' ? <Sparkles size={14}/> : <span>{user.email?.[0]?.toUpperCase() || 'Y'}</span>}</div>
            <div className="assistant-message-body"><div className="assistant-bubble">{message.role === 'assistant'
              ? <ReactMarkdown components={{ a: ({ href, children, ...props }) => <a href={href} target="_blank" rel="noreferrer" {...props}>{children}</a> }}>{message.content}</ReactMarkdown>
              : message.content}</div>
              {message.role === 'assistant' && (message.metadata?.recommendations || []).map((card, index) => {
                const show = card.tvmaze || {}
                const genres = show.genres || card.genres || []
                const episodeCount = Number.isInteger(show.episode_count) ? show.episode_count : card.episode_count
                const synopsis = toPlainText(show.synopsis || '')
                return <article className="assistant-recommendation-card" key={`${message.id}-${show.id || card.title}-${index}`}>
                  {show.image && <img src={show.image} alt="" loading="lazy"/>}
                  <div className="assistant-recommendation-copy"><strong>{show.name || card.title}</strong>
                    <span>{[show.premiered?.slice(0, 4), ...(genres.length ? genres.slice(0, 3) : ['Genres unavailable'])].filter(Boolean).join(' · ')}</span>
                    {card.reason && <p>{card.reason}</p>}
                    {synopsis && <small>{synopsis.slice(0, 220)}{synopsis.length > 220 ? '…' : ''}</small>}
                    <div className="assistant-card-actions"><span>{Number.isInteger(episodeCount) ? `${episodeCount} episodes` : 'Episode total unknown'}</span>
                      {show.url && <a href={show.url} target="_blank" rel="noreferrer">TVmaze <ArrowUpRight size={12}/></a>}
                      {show.id && <button disabled={addSaving} onClick={() => addRecommendation(show)}>{addSaving ? <LoaderCircle className="assistant-spin" size={13}/> : <Plus size={13}/>} Add to Library</button>}
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
        <form className="assistant-input-row" onSubmit={submit}>
          <textarea ref={inputRef} value={input} onChange={event => setInput(event.target.value.slice(0, 1800))} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(event) } }} placeholder="Ask about anime or your library…" maxLength={1800} rows={1} aria-label="Message the anime assistant" disabled={sending}/>
          <span className="assistant-char-count">{input.length}/1800</span>
          <button type="submit" disabled={!input.trim() || sending} aria-label="Send message"><Send size={17}/></button>
        </form>
        <footer className="assistant-footer">AI responses can be mistaken. Library details are retrieved from your account.</footer>
      </section>
    </div>}

    {adding && <Modal title={`Add ${adding.title} to your library`} wide onClose={() => { if (!addSaving) { setAdding(null); setAddError('') } }}>
      <div className="assistant-add-modal-content"><p className="assistant-add-note">Review the TVmaze details and season progress before saving. Personal ratings and watch status remain yours to set.</p>{addError && <p className="form-error" role="alert">{addError}</p>}<AnimeForm key={adding.external_id} initial={adding} initialMode="manual" onSubmit={saveRecommendation} saving={addSaving}/></div>
    </Modal>}
  </>
}
