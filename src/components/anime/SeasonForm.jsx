import { useEffect, useState } from 'react'
import { STATUSES, STATUS_LABELS } from '../../constants'

export default function SeasonForm({ nextSeasonNumber, initial, onSubmit, saving }) {
  const [form, setForm] = useState(() => ({ season_number: nextSeasonNumber, season_title: `Season ${nextSeasonNumber}`, status: 'plan_to_watch', date_started: '', media_type: '', ...initial, total_episodes: initial?.total_episodes ?? '', current_episode: initial?.current_episode ?? 0 }))
  const [error, setError] = useState('')
  useEffect(() => { setForm(current => ({ ...current, ...initial, media_type: initial?.media_type || '', total_episodes: initial?.total_episodes ?? '', current_episode: initial?.current_episode ?? 0 })); setError('') }, [initial])
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const submit = async event => {
    event.preventDefault()
    setError('')
    const number = Number(form.season_number)
    const total = form.total_episodes === '' ? null : Number(form.total_episodes)
    const current = Number(form.current_episode)
    if (!Number.isInteger(number) || number < 1) return setError('Season number must be a positive whole number.')
    if (total !== null && (!Number.isInteger(total) || total < 0)) return setError('Total episodes must be zero or higher.')
    if (!Number.isInteger(current) || current < 0 || (total !== null && current > total)) return setError('Episodes watched must be between 0 and the total episodes.')
    const status = total && current === total ? 'completed' : form.status
    try {
      await onSubmit({ ...form, season_number: number, season_title: form.season_title.trim() || `Season ${number}`, total_episodes: total, current_episode: current, status, date_started: form.date_started || null, date_completed: status === 'completed' ? new Date().toISOString().slice(0, 10) : null })
    } catch (cause) { setError(cause.message || 'Could not add season.') }
  }
  return <form className="anime-form season-form" onSubmit={submit}><p className="season-form-intro">{initial?.id ? 'Update this installment’s type, episode total, and progress.' : 'Add an installment to this series. Episode progress will be tracked separately.'}</p><div className="form-grid"><label className="field">Order number<input required type="number" min="1" step="1" value={form.season_number} onChange={event => set('season_number', event.target.value)}/></label><label className="field">Installment name<input value={form.season_title || ''} onChange={event => set('season_title', event.target.value)} placeholder={`Season ${form.season_number}`}/></label><label className="field">Type<select value={form.media_type || ''} onChange={event => set('media_type', event.target.value)}><option value="">TV / unspecified</option><option value="tv">TV</option><option value="movie">Movie</option><option value="ova">OVA</option><option value="ona">ONA</option><option value="special">Special</option><option value="recap">Recap</option><option value="spin_off">Spin-off</option><option value="remake">Remake</option><option value="other">Other</option></select></label><label className="field">Total episodes<input type="number" min="0" step="1" value={form.total_episodes} onChange={event => set('total_episodes', event.target.value)} placeholder="e.g. 24"/></label><label className="field">Episodes watched<input type="number" min="0" step="1" max={form.total_episodes || undefined} value={form.current_episode} onChange={event => set('current_episode', event.target.value)}/></label><label className="field">Watch status<select value={form.status} onChange={event => set('status', event.target.value)}>{STATUSES.map(status => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></label><label className="field">Date started<input type="date" value={form.date_started || ''} onChange={event => set('date_started', event.target.value)}/></label></div>{error&&<p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button className="primary-btn" disabled={saving}>{saving ? 'Saving…' : initial?.id ? 'Save installment' : 'Add installment'}</button></div></form>
}
