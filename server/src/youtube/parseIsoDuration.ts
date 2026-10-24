// Nine digits per part keep every sum far below the safe integer limit: absurd values stay numbers (the caller
// decides what is too long) instead of overflowing.
const DURATION = /^P(?:(\d{1,9})D)?(?:T(?:(\d{1,9})H)?(?:(\d{1,9})M)?(?:(\d{1,9})S)?)?$/

/**
 * Whole seconds in an ISO 8601 duration as YouTube writes it ("PT4M28S", "PT1H2M3S", "P1DT2H", "PT0S").
 * Null when it is not one: no part at all, parts out of order, signs, decimals, weeks, months, years, lower case.
 */
export function parseIsoDuration(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const match = DURATION.exec(value)
  if (!match) return null
  // "P" and "PT" fit the pattern but say nothing, and a "T" must be followed by a part.
  if (value.endsWith('T')) return null
  const [, days, hours, minutes, seconds] = match as unknown as Array<string | undefined>
  if (days === undefined && hours === undefined && minutes === undefined && seconds === undefined) return null
  return Number(days ?? 0) * 86_400 + Number(hours ?? 0) * 3600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0)
}
