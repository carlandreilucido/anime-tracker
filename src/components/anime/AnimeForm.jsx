import { useState } from 'react'
import { GENRES, STATUSES, STATUS_LABELS } from '../../constants'
import { Minus, Plus, Star } from 'lucide-react'
import AnimeSearchForm from './AnimeSearchForm'

const blank = { title: '', alternative_title: '', poster_url: '', genres: [], rating: '', notes: '' }
const newSeason = number => ({ season_number: number, season_title: `Season ${number}`, total_episodes: '', current_episode: 0, status: 'plan_to_watch', date_started: '' })

export default function AnimeForm({ initial, initialMode = 'search', onSubmit, saving }) {
  const [form, setForm] = useState({ ...blank, ...initial, genres: initial?.genres || [] })
  const [seasons, setSeasons] = useState(initial?.id ? [] : initial?.seasons?.length ? initial.seasons : [newSeason(1)])
  const [custom, setCustom] = useState('')
  const [error, setError] = useState('')
  const [mode, setMode] = useState(initial?.id ? 'manual' : initialMode)
  const isEditing = Boolean(initial?.id)
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const setSeason = (index, key, value) => setSeasons(current => current.map((season, seasonIndex) => seasonIndex === index ? { ...season, [key]: value } : season))
  const toggleGenre = genre => set('genres', form.genres.includes(genre) ? form.genres.filter(value => value !== genre) : [...form.genres, genre])

  const submit = async event => {
    event.preventDefault()
    setError('')
    const rating = form.rating === '' ? null : Number(form.rating)
    if (!form.title.trim()) return setError('Anime title is required.')
    if (rating !== null && (rating < 1 || rating > 10)) return setError('Rating must be between 1 and 10.')

    let seasonValues = []
    if (!isEditing) {
      if (!seasons.length) return setError('Add at least one season.')
      const numbers = seasons.map(season => Number(season.season_number))
      if (numbers.some(value => !Number.isInteger(value) || value < 1)) return setError('Season numbers must be positive whole numbers.')
      if (new Set(numbers).size !== numbers.length) return setError('Each season number must be unique.')
      for (const season of seasons) {
        const total = season.total_episodes === '' || season.total_episodes === null || season.total_episodes === undefined ? null : Number(season.total_episodes)
        const current = Number(season.current_episode) || 0
        if (total !== null && (!Number.isInteger(total) || total < 0)) return setError(`Season ${season.season_number}: total episodes must be zero or higher.`)
        if (!Number.isInteger(current) || current < 0 || (total !== null && current > total)) return setError(`Season ${season.season_number}: watched episodes must be between 0 and the total.`)
        const status = total && current === total ? 'completed' : season.status
        seasonValues.push({
          ...season,
          season_number: Number(season.season_number),
          season_title: season.season_title?.trim() || `Season ${season.season_number}`,
          total_episodes: total,
          current_episode: current,
          status,
          date_started: season.date_started || null,
          date_completed: status === 'completed' ? (season.date_completed || new Date().toISOString().slice(0, 10)) : null,
        })
      }
    }

    try {
      await onSubmit({
        title: form.title.trim(),
        alternative_title: form.alternative_title?.trim() || null,
        poster_url: form.poster_url?.trim() || null,
        genres: form.genres,
        rating,
        notes: form.notes?.trim() || null,
        ...(initial?.external_provider ? {
          synopsis: initial.synopsis || null,
          release_date: initial.release_date || null,
          community_rating: initial.community_rating ?? null,
          external_provider: initial.external_provider,
          external_id: initial.external_id || null,
          external_url: initial.external_url || null,
          metadata_updated_at: initial.metadata_updated_at || new Date().toISOString(),
        } : {}),
        ...(!isEditing ? { seasons: seasonValues } : {}),
      })
    } catch (cause) {
      setError(cause.message || 'Could not save anime.')
    }
  }

  const manualForm = <form className="anime-form" onSubmit={submit}>
    <div className="anime-form-content">
    <div className="form-grid">
      <label className="field full">Anime title *<input required autoFocus value={form.title} onChange={event => set('title', event.target.value)} placeholder="e.g. Frieren: Beyond Journey’s End"/></label>
      <label className="field full">Alternative title<input value={form.alternative_title || ''} onChange={event => set('alternative_title', event.target.value)} placeholder="Optional"/></label>
      <label className="field full">Poster image URL<input type="url" value={form.poster_url || ''} onChange={event => set('poster_url', event.target.value)} placeholder="https://..."/></label>
      <label className="field">Rating <span className="optional">(optional)</span><span className="rating-input"><Star size={16} fill="currentColor"/><select value={form.rating ?? ''} onChange={event => set('rating', event.target.value)}><option value="">Not rated</option>{Array.from({ length: 10 }, (_, index) => <option value={index + 1} key={index}>{index + 1} / 10</option>)}</select></span></label>
    </div>

    {!isEditing ? <section className="season-editor">
      <div className="season-editor-heading"><div><span className="section-kicker">SEASON TRACKING</span><h3>Add seasons</h3><p>Each season has its own episode count and progress.</p></div><button className="outline-btn season-add-btn" type="button" onClick={() => setSeasons(current => [...current, newSeason(Math.max(0, ...current.map(season => Number(season.season_number) || 0)) + 1)])}><Plus size={14}/> Add season</button></div>
      <div className="season-edit-list">{seasons.map((season, index) => <fieldset className="season-edit-card" key={index}>
        <legend>Season {season.season_number || index + 1}</legend>
        <div className="season-form-grid"><label className="field">Season number<input type="number" min="1" step="1" required value={season.season_number} onChange={event => setSeason(index, 'season_number', event.target.value)}/></label><label className="field">Season name<input value={season.season_title || ''} onChange={event => setSeason(index, 'season_title', event.target.value)} placeholder={`Season ${index + 1}`}/></label><label className="field">Total episodes<input type="number" min="0" step="1" value={season.total_episodes ?? ''} onChange={event => setSeason(index, 'total_episodes', event.target.value)} placeholder="e.g. 24"/></label><label className="field">Episodes watched<input type="number" min="0" step="1" max={season.total_episodes || undefined} value={season.current_episode ?? 0} onFocus={event => event.currentTarget.select()} onChange={event => setSeason(index, 'current_episode', event.target.value)}/></label><label className="field">Status<select value={season.status} onChange={event => setSeason(index, 'status', event.target.value)}>{STATUSES.map(status => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></label><label className="field">Date started<input type="date" value={season.date_started || ''} onChange={event => setSeason(index, 'date_started', event.target.value)}/></label></div>
        {seasons.length > 1 && <button type="button" className="season-remove-btn" onClick={() => setSeasons(current => current.filter((_, seasonIndex) => seasonIndex !== index))}><Minus size={13}/> Remove season</button>}
      </fieldset>)}</div>
    </section> : <div className="season-editor-hint">Season episode progress is managed on the anime details page.</div>}

    <fieldset className="genre-picker"><legend>Genres</legend><div className="genre-options">{GENRES.map(genre => <button type="button" key={genre} onClick={() => toggleGenre(genre)} className={`genre-option ${form.genres.includes(genre) ? 'selected' : ''}`}>{genre}</button>)}</div><div className="custom-genre"><input value={custom} onChange={event => setCustom(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (custom.trim()) { toggleGenre(custom.trim()); setCustom('') } } }} placeholder="Add a custom genre"/><button type="button" className="small-btn" onClick={() => { if (custom.trim() && !form.genres.includes(custom.trim())) set('genres', [...form.genres, custom.trim()]); setCustom('') }}>Add</button></div></fieldset>
    <label className="field notes-field">Personal notes<textarea rows="3" value={form.notes || ''} onChange={event => set('notes', event.target.value)} placeholder="Your thoughts, reminders, or where to pick back up…"/></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    </div>
    <div className="form-actions"><button type="submit" className="primary-btn" disabled={saving}>{saving ? 'Saving…' : isEditing ? 'Save changes' : 'Add series to my list'}</button></div>
  </form>

  if (isEditing) return manualForm

  return <div className="anime-add-flow">
    <div className="anime-add-tabs" role="tablist" aria-label="How to add anime">
      <button type="button" role="tab" aria-selected={mode === 'search'} className={mode === 'search' ? 'active' : ''} onClick={() => setMode('search')}>Search Anime</button>
      <button type="button" role="tab" aria-selected={mode === 'manual'} className={mode === 'manual' ? 'active' : ''} onClick={() => setMode('manual')}>Add Manually</button>
    </div>
    {mode === 'search' ? <AnimeSearchForm onSubmit={onSubmit} saving={saving}/> : manualForm}
  </div>
}
