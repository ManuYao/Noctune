import type { AvatarId } from '../../shared/protocol'

/** The four heads of the mock-ups: antenna, ears, tuft, and the classic one with nothing on top. */
export type AvatarShape = 'antenna' | 'ears' | 'tuft' | 'classic'

export interface AvatarDef {
  id: AvatarId
  name: string
  shape: AvatarShape
  /** Colour of the body (`color` in the mock-ups). */
  body: string
  /** Colour of the headphones (`fill` in the mock-ups). */
  headphones: string
}

// The eight avatars of the mock-ups, colour for colour.
export const AVATARS: AvatarDef[] = [
  { id: 'pulse', name: 'Pulse', shape: 'antenna', body: '#FF6B9A', headphones: '#16142B' },
  { id: 'mango', name: 'Mango', shape: 'ears', body: '#FFB347', headphones: '#3A2A8C' },
  { id: 'moss', name: 'Moss', shape: 'tuft', body: '#7BD88F', headphones: '#16142B' },
  { id: 'cloud', name: 'Cloud', shape: 'classic', body: '#5CC8FF', headphones: '#FF4F7B' },
  { id: 'grape', name: 'Grape', shape: 'antenna', body: '#A98BFF', headphones: '#16142B' },
  { id: 'ember', name: 'Ember', shape: 'ears', body: '#FF7A59', headphones: '#FFE58A' },
  { id: 'lemon', name: 'Lemon', shape: 'tuft', body: '#F2E55C', headphones: '#3A2A8C' },
  { id: 'mist', name: 'Mist', shape: 'classic', body: '#E6ECF5', headphones: '#FF4F7B' },
]

/** The avatar of an id, if the page knows it. */
export const findAvatar = (id: string): AvatarDef | undefined => AVATARS.find((candidate) => candidate.id === id)
