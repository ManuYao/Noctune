// Placeholder data until the realtime server owns room state.
export interface RoomSummary {
  id: string
  name: string
  genre: string
  online: number
  djSlotFree: boolean
}

export const ROOMS: RoomSummary[] = [
  { id: 'lofi-du-soir', name: 'Lo-fi du soir', genre: 'Lo-fi', online: 14, djSlotFree: true },
  { id: 'rock-progressif', name: 'Rock progressif', genre: 'Rock', online: 9, djSlotFree: false },
  { id: 'electro-nuit', name: 'Electro de nuit', genre: 'Électro', online: 31, djSlotFree: true },
  { id: 'jazz-cafe', name: 'Jazz café', genre: 'Jazz', online: 6, djSlotFree: true },
  { id: 'hip-hop-classics', name: 'Hip-hop classics', genre: 'Hip-hop', online: 22, djSlotFree: false },
  { id: 'french-touch', name: 'French touch', genre: 'House', online: 18, djSlotFree: true },
]
