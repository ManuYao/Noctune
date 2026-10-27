import { useMediaQuery } from './useMediaQuery'

/** The width up to which the pages wear their phone design (mock-ups M1 to M4): the same 760 px as the CSS media queries. */
export const PHONE_QUERY = '(max-width: 760px)'

/** Whether the window is phone-wide right now. */
export function useIsPhone(): boolean {
  return useMediaQuery(PHONE_QUERY)
}
