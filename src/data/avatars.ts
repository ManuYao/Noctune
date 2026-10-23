import type { AvatarId } from '../../shared/protocol'

export type AvatarShape = 'antenna' | 'ears' | 'tuft' | 'classic'

export interface AvatarDef {
  id: AvatarId
  name: string
  shape: AvatarShape
  body: string
  headphones: string
}

export const AVATARS: AvatarDef[] = [
  { id: 'pulse', name: 'Pulse', shape: 'antenna', body: '#ff4d8d', headphones: '#2a2260' },
  { id: 'mango', name: 'Mango', shape: 'ears', body: '#ffa63d', headphones: '#4a3fa8' },
  { id: 'moss', name: 'Moss', shape: 'tuft', body: '#5be08a', headphones: '#2a2260' },
  { id: 'cloud', name: 'Cloud', shape: 'classic', body: '#3db8ff', headphones: '#ff5c8a' },
  { id: 'grape', name: 'Grape', shape: 'antenna', body: '#a77bff', headphones: '#2a2260' },
  { id: 'ember', name: 'Ember', shape: 'ears', body: '#ff6a4d', headphones: '#ffd166' },
  { id: 'lemon', name: 'Lemon', shape: 'tuft', body: '#ffe94d', headphones: '#4a3fa8' },
  { id: 'mist', name: 'Mist', shape: 'classic', body: '#eceaf8', headphones: '#ff5c8a' },
]
