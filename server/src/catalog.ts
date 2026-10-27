import type { RoomRules, RoomStyle, RoomTheme } from '../../shared/protocol'

/**
 * A room of the team: the source of the six rows that migration 003 puts in the database (a test proves they are the
 * same) and of the memory store the tests and the e2e server use. Rooms of members are only in the database.
 */
export interface RoomDef {
  id: string
  name: string
  description: string
  styles: RoomStyle[]
  theme: RoomTheme
  /** What the room asks of the tracks its DJs bring. Provisional: the rules of each room are to be thought through. */
  rules: RoomRules
}

const MINUTE = 60
const HOUR = 60 * MINUTE

// The order here is the order of the list of rooms.
export const ROOM_DEFS: RoomDef[] = [
  {
    id: 'lofi-du-soir',
    name: 'Lo-fi du soir',
    description: 'Beats calmes pour bosser ou se poser, sans pression.',
    styles: ['lofi'],
    theme: 'neon',
    rules: { maxTrackSec: 7 * MINUTE, repeatDelaySec: 2 * HOUR, maxDjs: 10 },
  },
  {
    id: 'rock-progressif',
    name: 'Rock progressif',
    description: 'Guitares planantes, longs morceaux et albums cultes.',
    styles: ['rock'],
    theme: 'neon',
    rules: { maxTrackSec: 15 * MINUTE, repeatDelaySec: 4 * HOUR, maxDjs: 8 },
  },
  {
    id: 'electro-nuit',
    name: 'Electro de nuit',
    description: 'Des sets qui montent doucement, du premier battement au petit matin.',
    styles: ['electro'],
    theme: 'neon',
    rules: { maxTrackSec: 8 * MINUTE, repeatDelaySec: 2 * HOUR, maxDjs: 12 },
  },
  {
    id: 'jazz-cafe',
    name: 'Jazz café',
    description: 'Un piano, un café, du jazz à toute heure.',
    styles: ['jazz'],
    theme: 'neon',
    rules: { maxTrackSec: 10 * MINUTE, repeatDelaySec: 4 * HOUR, maxDjs: 8 },
  },
  {
    id: 'hip-hop-classics',
    name: 'Hip-hop classics',
    description: 'Les classiques du rap : boom bap, samples et vieilles écoles.',
    styles: ['rap'],
    theme: 'neon',
    rules: { maxTrackSec: 6 * MINUTE, repeatDelaySec: 2 * HOUR, maxDjs: 12 },
  },
  {
    id: 'french-touch',
    name: 'French touch',
    description: 'House filtrée et basses rondes, à la française.',
    styles: ['electro'],
    theme: 'neon',
    rules: { maxTrackSec: 7 * MINUTE, repeatDelaySec: 2 * HOUR, maxDjs: 10 },
  },
  {
    id: 'afro-caraibes',
    name: 'Afro Caraïbes',
    description: 'Afrobeats, amapiano et rythmes des îles : de quoi danser jusqu’au matin.',
    styles: ['afro'],
    theme: 'neon',
    rules: { maxTrackSec: 6 * MINUTE, repeatDelaySec: 2 * HOUR, maxDjs: 12 },
  },
  {
    id: 'zouk-dancehall',
    name: 'Zouk & Dancehall',
    description: 'Zouk, kompa, dancehall et soca : le soleil des Caraïbes dans les enceintes.',
    styles: ['afro'],
    theme: 'neon',
    rules: { maxTrackSec: 6 * MINUTE, repeatDelaySec: 2 * HOUR, maxDjs: 12 },
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
