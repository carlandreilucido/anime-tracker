import { useEffect, useRef, useState } from 'react'

export default function EpisodeNumberInput({ value = 0, totalEpisodes = null, seasonLabel = 'season', onCommit, onInvalid, disabled = false }) {
  const [draft, setDraft] = useState(String(value ?? 0))
  const skipNextCommit = useRef(false)
  useEffect(() => { setDraft(String(value ?? 0)) }, [value])

  const commit = async () => {
    if (skipNextCommit.current) { skipNextCommit.current = false; return }
    const trimmed = draft.trim()
    const episode = Number(trimmed)
    if (!/^\d+$/.test(trimmed) || !Number.isSafeInteger(episode) || episode < 0 || (totalEpisodes !== null && totalEpisodes !== undefined && episode > totalEpisodes)) {
      setDraft(String(value ?? 0))
      onInvalid?.(`Enter a whole episode number from 0 to ${totalEpisodes ?? 'the available total'}.`)
      return
    }
    if (episode === Number(value ?? 0)) return
    try {
      await onCommit(episode)
      setDraft(String(episode))
    } catch {
      setDraft(String(value ?? 0))
    }
  }

  return <input
    className="episode-number-input"
    type="number"
    min="0"
    max={totalEpisodes ?? undefined}
    step="1"
    inputMode="numeric"
    value={draft}
    disabled={disabled}
    aria-label={`Season episode number for ${seasonLabel}`}
    onChange={event => setDraft(event.target.value)}
    onBlur={commit}
    onKeyDown={event => {
      if (event.key === 'Enter') event.currentTarget.blur()
      if (event.key === 'Escape') { skipNextCommit.current = true; setDraft(String(value ?? 0)); event.currentTarget.blur() }
    }}
  />
}
