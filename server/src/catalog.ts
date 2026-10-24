import type { RoomRules } from '../../shared/protocol'

// Placeholder catalog until rooms come from a database.
export interface RoomDef {
  id: string
  name: string
  genre: string
  /** What the room asks of the tracks its DJs bring. Each room has its own; the host will choose them later. */
  rules: RoomRules
}

const MINUTE = 60
const HOUR = 60 * MINUTE

// The order here is the order of the list of rooms.
export const ROOM_DEFS: RoomDef[] = [
  {
    id: 'lofi-du-soir',
    name: 'Lo-fi du soir',
    genre: 'Lo-fi',
    rules: { maxTrackSec: 7 * MINUTE, repeatDelaySec: 2 * HOUR, maxDjs: 10 },
  },
  {
    id: 'rock-progressif',
    name: 'Rock progressif',
    genre: 'Rock',
    rules: { maxTrackSec: 15 * MINUTE, repeatDelaySec: 4 * HOUR, maxDjs: 8 },
  },
  {
    id: 'electro-nuit',
    name: 'Electro de nuit',
    genre: 'Électro',
    rules: { maxTrackSec: 8 * MINUTE, repeatDelaySec: 2 * HOUR, maxDjs: 12 },
  },
  {
    id: 'jazz-cafe',
    name: 'Jazz café',
    genre: 'Jazz',
    rules: { maxTrackSec: 10 * MINUTE, repeatDelaySec: 4 * HOUR, maxDjs: 8 },
  },
  {
    id: 'hip-hop-classics',
    name: 'Hip-hop classics',
    genre: 'Hip-hop',
    rules: { maxTrackSec: 6 * MINUTE, repeatDelaySec: 2 * HOUR, maxDjs: 12 },
  },
  {
    id: 'french-touch',
    name: 'French touch',
    genre: 'House',
    rules: { maxTrackSec: 7 * MINUTE, repeatDelaySec: 2 * HOUR, maxDjs: 10 },
  },
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
