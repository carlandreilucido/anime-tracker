/** Normalize the optional @ prefix without mutating the displayed/stored username. */
export function normalizeUserSearchTerm(query) {
  return String(query ?? '').trim().replace(/^@/, '').trim()
}
