// Placeholder catalog until rooms and tracks come from a database.
export interface RoomDef {
  id: string
  name: string
  genre: string
}

// The order here is the order of the list of rooms.
export const ROOM_DEFS: RoomDef[] = [
  { id: 'lofi-du-soir', name: 'Lo-fi du soir', genre: 'Lo-fi' },
  { id: 'rock-progressif', name: 'Rock progressif', genre: 'Rock' },
  { id: 'electro-nuit', name: 'Electro de nuit', genre: 'Électro' },
  { id: 'jazz-cafe', name: 'Jazz café', genre: 'Jazz' },
  { id: 'hip-hop-classics', name: 'Hip-hop classics', genre: 'Hip-hop' },
  { id: 'french-touch', name: 'French touch', genre: 'House' },
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
