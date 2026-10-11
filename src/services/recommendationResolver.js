export function normalizeAnimeTitle(value = '') {
  return String(value).normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

/** Match only exact normalized names/aliases; avoid guessing from partial titles. */
export function findExactAnimeMatch(title, shows = [], aliasesByShowId = new Map()) {
  const target = normalizeAnimeTitle(title)
  if (!target) return null
  return shows.find(show => {
    if (normalizeAnimeTitle(show?.name) === target) return true
    const aliases = aliasesByShowId.get(show?.id) || []
    return aliases.some(alias => normalizeAnimeTitle(typeof alias === 'string' ? alias : alias?.name) === target)
  }) || null
}
