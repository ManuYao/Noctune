/** m:ss, the way a player shows the length or the position of a track. */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** A length of time in words, for rules and waits: "45 s", "7 min", "7 min 30 s", "2 h", "1 h 30 min". */
export function formatSpan(totalSeconds: number): string {
  const total = Math.max(0, Math.round(totalSeconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours > 0) return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`
  if (minutes > 0) return seconds > 0 ? `${minutes} min ${seconds} s` : `${minutes} min`
  return `${seconds} s`
}

/** A rough wait, rounded to the minute: it is an estimate, so it never pretends to the second. */
export function formatWait(totalSeconds: number): string {
  if (totalSeconds < 45) return "moins d'une minute"
  const minutes = Math.round(totalSeconds / 60)
  if (minutes < 60) return `environ ${minutes} min`
  return `environ ${formatSpan(Math.round(totalSeconds / 300) * 300)}`
}
