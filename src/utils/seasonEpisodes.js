export function getSeasonEpisodeNumbers(seasons = []) {
  const ordered = [...seasons].sort((a, b) => a.season_number - b.season_number)
  let offset = 0
  let offsetsKnown = true
  const numbers = new Map()

  for (const season of ordered) {
    const total = season.total_episodes === null || season.total_episodes === undefined || season.total_episodes === ''
      ? null
      : Number(season.total_episodes)
    const watched = Number(season.current_episode) || 0
    if (!offsetsKnown) {
      numbers.set(season.id, { startNumber: null, endNumber: null, lastWatchedNumber: null, nextEpisodeNumber: null, seriesTotal: null })
      continue
    }
    numbers.set(season.id, {
      startNumber: offset + 1,
      endNumber: total === null ? null : offset + total,
      lastWatchedNumber: watched > 0 ? offset + watched : null,
      nextEpisodeNumber: offset + watched + 1,
      seriesTotal: null,
    })
    if (total === null) offsetsKnown = false
    else offset += total
  }

  const seriesTotal = offsetsKnown ? offset : null
  for (const [id, value] of numbers) numbers.set(id, { ...value, seriesTotal })
  return numbers
}

export function episodeRangeLabel(numbers) {
  if (!numbers || numbers.startNumber === null) return 'Overall numbering unavailable'
  if (numbers.endNumber === null) return `Episodes ${numbers.startNumber}–?`
  if (numbers.endNumber < numbers.startNumber) return '0 episodes'
  return `Episodes ${numbers.startNumber}–${numbers.endNumber}`
}
