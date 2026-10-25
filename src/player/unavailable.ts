/** Why the YouTube player refused a track, in terms the viewer can act on. */
export type UnavailableReason = 'not-found' | 'blocked' | 'other'

/**
 * What the IFrame API says when it cannot play a video: 100 the video is gone or private; 101 and 150 its owner does
 * not allow it in an embedded player, which is also what a block in the viewer's country usually looks like, and what
 * the real player answered for a video that does not exist at all (checked: the API does not tell them apart, and
 * nothing here knows the viewer's country); 2 (bad parameter), 5 (player trouble) and
 * anything else is a problem of the player, not of the video.
 */
export function unavailableReason(code: number): UnavailableReason {
  if (code === 100) return 'not-found'
  if (code === 101 || code === 150) return 'blocked'
  return 'other'
}

interface UnavailableText {
  /** On the video screen, which has nothing else to show: a title, then what to do. */
  title: string
  text: string
  /** In the bar: one line, even on a phone (the screen has the rest). */
  note: string
}

// The message belongs to the viewer whose player could not play the track: the room goes on, and so does everybody else.
export const UNAVAILABLE_TEXT: Record<UnavailableReason, UnavailableText> = {
  'not-found': {
    title: 'Morceau introuvable',
    text: "Ce morceau n'existe plus ou est privé. Le suivant démarrera tout seul.",
    note: 'Morceau introuvable ou privé.',
  },
  blocked: {
    title: 'Morceau indisponible pour toi',
    text: "Il est bloqué dans ton pays, a été retiré, ou son propriétaire en interdit la lecture ici. Change de room, ou patiente jusqu'au prochain morceau.",
    note: 'Morceau indisponible pour toi.',
  },
  other: {
    title: 'Problème de lecture',
    text: 'Le lecteur a rencontré un problème sur ce morceau. Il repartira au prochain morceau.',
    note: 'Problème de lecture sur ce morceau.',
  },
}
