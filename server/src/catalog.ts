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

export interface TestTrack {
  id: string
  videoId: string
  title: string
  artist: string
  durationSec: number
}

// Real, embeddable, copyright-free videos (NoCopyrightSounds), so the player can be built before DJs add
// their own. The server changes track when the duration is over: it must match the video exactly
// (checked on YouTube: lengthSeconds and playableInEmbed).
export const TEST_TRACKS: TestTrack[] = [
  { id: 'ncs-my-heart', videoId: 'jK2aIUmmdP4', title: 'My Heart', artist: 'Different Heaven & EH!DE', durationSec: 267 },
  { id: 'ncs-sky-high', videoId: 'TW9d8vYrVFQ', title: 'Sky High', artist: 'Elektronomia', durationSec: 238 },
  { id: 'ncs-on-and-on', videoId: 'K4DyBUG242c', title: 'On & On', artist: 'Cartoon, Jéja (feat. Daniel Levi)', durationSec: 208 },
  { id: 'ncs-heroes-tonight', videoId: '3nQNiWdeH2Q', title: 'Heroes Tonight', artist: 'Janji (feat. Johnning)', durationSec: 208 },
]
