const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

/** "octobre 2026", from an ISO date. */
export function memberSinceLabel(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

// A no-break space between the thousands, as in the mock-up ("1 204"); built from its code so it stays visible here.
const THOUSANDS_SPACE = String.fromCharCode(0xa0)

export function formatCount(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, THOUSANDS_SPACE)
}

/** Listening time as a tile: "34 h" from one hour, "45 min" under, "0 min" at the start. */
export function formatListen(seconds: number): string {
  const minutes = Math.floor(Math.max(0, seconds) / 60)
  if (seconds > 0 && minutes === 0) return '< 1 min'
  if (minutes < 60) return `${minutes} min`
  return `${formatCount(Math.floor(minutes / 60))}${THOUSANDS_SPACE}h`
}
