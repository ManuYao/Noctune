// Placeholder catalog until rooms and tracks come from a database.
export interface RoomDef {
  id: string
  name: string
}

export const ROOM_DEFS: RoomDef[] = [
  { id: 'lofi-du-soir', name: 'Lo-fi du soir' },
  { id: 'rock-progressif', name: 'Rock progressif' },
  { id: 'electro-nuit', name: 'Electro de nuit' },
  { id: 'jazz-cafe', name: 'Jazz café' },
  { id: 'hip-hop-classics', name: 'Hip-hop classics' },
  { id: 'french-touch', name: 'French touch' },
]

export interface FakeTrack {
  id: string
  title: string
  artist: string
  durationSec: number
}

// Fake tracks cycled by the server so playback sync can be built before the YouTube player.
export const FAKE_TRACKS: FakeTrack[] = [
  { id: 'fake-1', title: 'Café froid', artist: 'Nuit Blanche', durationSec: 95 },
  { id: 'fake-2', title: 'Néons sous la pluie', artist: 'Kora', durationSec: 140 },
  { id: 'fake-3', title: 'Dernier métro', artist: 'Mazout', durationSec: 120 },
]
