import type { TestTrack } from './catalog'

/**
 * What each room of the team plays when no DJ does, in a random order (see Room.startHouse). Picked by the user on
 * YouTube Music; titles, artists and durations read from the YouTube API on 29/10/2026. The server changes track when the
 * duration is over, so a duration must match the video. These tracks are not judged by the rules of the room.
 */
export const HOUSE_TRACKS: Record<string, TestTrack[]> = {
  'lofi-du-soir': [
    { id: 'h-DFVuYoDVS_g', videoId: 'DFVuYoDVS_g', title: 'Dreaming', artist: 'Lee', durationSec: 285 },
    { id: 'h-QIGqEFsOhjk', videoId: 'QIGqEFsOhjk', title: 'Night Walk', artist: 'xander.', durationSec: 210 },
    { id: 'h-8huTQu-uPkc', videoId: '8huTQu-uPkc', title: 'Song For The Sun', artist: 'Stan Forebee', durationSec: 200 },
    { id: 'h-4x6VDKJSOhw', videoId: '4x6VDKJSOhw', title: 'B Urself', artist: 'Aso', durationSec: 225 },
  ],
  'rock-progressif': [
    { id: 'h-4jyFBUyCu5s', videoId: '4jyFBUyCu5s', title: 'Saturation (Strange Love)', artist: 'Grey Daze', durationSec: 236 },
    { id: 'h-G3dwKAHPC_s', videoId: 'G3dwKAHPC_s', title: 'Abracadavre', artist: 'Kevin Sherwood', durationSec: 366 },
    { id: 'h-S-LO6dctBms', videoId: 'S-LO6dctBms', title: 'Eye of the Tiger', artist: 'Survivor', durationSec: 244 },
    { id: 'h-ikFFVfObwss', videoId: 'ikFFVfObwss', title: 'Highway to Hell', artist: 'AC/DC', durationSec: 209 },
    { id: 'h-ljUtuoFt-8c', videoId: 'ljUtuoFt-8c', title: 'Smells Like Teen Spirit', artist: 'Nirvana', durationSec: 302 },
    { id: 'h-CHIWNDAwTqQ', videoId: 'CHIWNDAwTqQ', title: 'Enter Sandman', artist: 'Metallica', durationSec: 332 },
  ],
  'jazz-cafe': [
    { id: 'h-y-5x24V8oSE', videoId: 'y-5x24V8oSE', title: 'Nothing Burns Like The Cold', artist: 'Snoh Aalegra', durationSec: 210 },
    { id: 'h-68adYUg2WUk', videoId: '68adYUg2WUk', title: 'Forever More', artist: 'Tom Browne', durationSec: 202 },
    { id: 'h-io9lJoHubQk', videoId: 'io9lJoHubQk', title: 'Her Silent Smile', artist: 'Tom Browne', durationSec: 311 },
    { id: 'h-nVM15HL5i8w', videoId: 'nVM15HL5i8w', title: 'Earned It (From "Fifty Shades of Grey")', artist: 'L\'Orchestra Cinematique', durationSec: 239 },
    { id: 'h-EHGDooPcfJU', videoId: 'EHGDooPcfJU', title: 'The World We Knew (Over And Over)', artist: 'Frank Sinatra', durationSec: 168 },
    { id: 'h-XvfImv9NseY', videoId: 'XvfImv9NseY', title: 'That\'s Life', artist: 'Frank Sinatra', durationSec: 188 },
    { id: 'h-IN1Y8kO-QKw', videoId: 'IN1Y8kO-QKw', title: 'Papa Was A Rollin\' Stone (Single Version)', artist: 'The Temptations', durationSec: 420 },
  ],
  'electro-nuit': [
    { id: 'h-gI3Zn9-tuq8', videoId: 'gI3Zn9-tuq8', title: 'Rockstar (Crankdat Remix)', artist: 'Post Malone ft. 21 Savage', durationSec: 264 },
    { id: 'h-_DlHKsQpm9k', videoId: '_DlHKsQpm9k', title: 'Overthinker', artist: 'INZO', durationSec: 268 },
    { id: 'h-jC3-nd4bNoE', videoId: 'jC3-nd4bNoE', title: 'I\'m Dreaming', artist: 'INZO', durationSec: 238 },
    { id: 'h-TC5uDOp_r4s', videoId: 'TC5uDOp_r4s', title: 'Majesty feat. Wasiu', artist: 'Apashe', durationSec: 268 },
    { id: 'h-if5sW3mkpdQ', videoId: 'if5sW3mkpdQ', title: 'Good News', artist: 'Apashe', durationSec: 285 },
    { id: 'h-ahCHo2cgCwg', videoId: 'ahCHo2cgCwg', title: 'Tommy\'s Theme (Original)', artist: 'Noisia', durationSec: 281 },
    { id: 'h-EljUfqNIQBU', videoId: 'EljUfqNIQBU', title: 'Supersonic (my existence)', artist: 'Skrillex', durationSec: 166 },
  ],
  'hip-hop-classics': [
    { id: 'h-hA6KmAXfnt8', videoId: 'hA6KmAXfnt8', title: 'Work REMIX', artist: 'A$AP Ferg', durationSec: 284 },
    { id: 'h-i4B5VcoaS9s', videoId: 'i4B5VcoaS9s', title: 'Nuthin\' But A "G" Thang', artist: 'Dr. Dre', durationSec: 238 },
    { id: 'h-Bo4Jo6sdLNQ', videoId: 'Bo4Jo6sdLNQ', title: 'Ali Bomaye', artist: 'The Game', durationSec: 373 },
    { id: 'h-Y2cWHiKaFjc', videoId: 'Y2cWHiKaFjc', title: 'Do For Love', artist: '2Pac', durationSec: 282 },
    { id: 'h-EHWEvu3B_Yo', videoId: 'EHWEvu3B_Yo', title: 'Keep Their Heads Ringin\'', artist: 'Dr. Dre', durationSec: 307 },
  ],
  'french-touch': [
    { id: 'h-SydM3XlcPkE', videoId: 'SydM3XlcPkE', title: '#BaWéMonAmi', artist: 'Niro', durationSec: 248 },
    { id: 'h-zTOA1eLbOZU', videoId: 'zTOA1eLbOZU', title: 'Timal', artist: 'Timal', durationSec: 205 },
    { id: 'h-4Kae0Ej65l0', videoId: '4Kae0Ej65l0', title: 'Bizon', artist: 'Kaaris', durationSec: 196 },
    { id: 'h-FYjjgKC24ZI', videoId: 'FYjjgKC24ZI', title: 'Blood', artist: 'Zikxo', durationSec: 179 },
    { id: 'h-wrFKcBnFIhA', videoId: 'wrFKcBnFIhA', title: '6 Pierres', artist: '404Billy', durationSec: 126 },
    { id: 'h-arnRrFyLHm4', videoId: 'arnRrFyLHm4', title: 'Temps mort 2.0', artist: 'Booba', durationSec: 188 },
    { id: 'h-ZU2oxtozZYc', videoId: 'ZU2oxtozZYc', title: 'H9', artist: 'Heykel', durationSec: 213 },
    { id: 'h-BXnAJp6opOM', videoId: 'BXnAJp6opOM', title: 'Mood', artist: 'KeBlack', durationSec: 172 },
  ],
  'afro-caribeen-zouk': [
    { id: 'h-JE2WppoGj60', videoId: 'JE2WppoGj60', title: 'SHATTAZ', artist: 'Bamby', durationSec: 146 },
    { id: 'h-5ROzYZozIC8', videoId: '5ROzYZozIC8', title: 'OU LA', artist: 'Toulou', durationSec: 200 },
    { id: 'h-udWLiFhCnYw', videoId: 'udWLiFhCnYw', title: 'Dis-leur (feat. Eleen)', artist: 'Marvin', durationSec: 201 },
    { id: 'h-mekjAuNuy88', videoId: 'mekjAuNuy88', title: 'ALORS', artist: 'Barth', durationSec: 173 },
    { id: 'h-Zop5NZIj9k4', videoId: 'Zop5NZIj9k4', title: 'TROP LOVE', artist: 'Kalipsxau', durationSec: 180 },
    { id: 'h-l4itlXckaic', videoId: 'l4itlXckaic', title: 'LV', artist: 'Volcano', durationSec: 196 },
    { id: 'h-8YSm_cRrJ74', videoId: '8YSm_cRrJ74', title: 'Poison', artist: 'Kalipsxau', durationSec: 226 },
    { id: 'h-ZmPLmIZLR-8', videoId: 'ZmPLmIZLR-8', title: 'Jusqu\'au bout du monde', artist: 'Marvin', durationSec: 214 },
  ],
  'mood-afro': [
    { id: 'h-OkEFHhDBK74', videoId: 'OkEFHhDBK74', title: 'Calm Down', artist: 'Rema', durationSec: 240 },
    { id: 'h-fPk7MbxHXV4', videoId: 'fPk7MbxHXV4', title: 'Skeletun', artist: 'Tekno', durationSec: 193 },
    { id: 'h-Boi1A41nuMI', videoId: 'Boi1A41nuMI', title: 'Soweto', artist: 'Victony', durationSec: 148 },
    { id: 'h-IGUXFzIzWMo', videoId: 'IGUXFzIzWMo', title: 'Omo Ope (feat. Olamide)', artist: 'Asake', durationSec: 167 },
    { id: 'h-z4kX_KIv3_w', videoId: 'z4kX_KIv3_w', title: 'Cough (Odo)', artist: 'Kizz Daniel', durationSec: 177 },
    { id: 'h-_Yim8-FwXt8', videoId: '_Yim8-FwXt8', title: 'Forever (Remix)', artist: 'Gyakie', durationSec: 202 },
    { id: 'h-4Akn5os57_g', videoId: '4Akn5os57_g', title: 'Sip (Alcohol)', artist: 'Joeboy', durationSec: 159 },
  ],
}

// The rooms of the team whose tracks play in a member's room of the same style.
const ROOMS_OF_STYLE: Record<string, string[]> = {
  lofi: ['lofi-du-soir'],
  rock: ['rock-progressif'],
  electro: ['electro-nuit'],
  jazz: ['jazz-cafe'],
  rap: ['hip-hop-classics', 'french-touch'],
  afro: ['afro-caribeen-zouk', 'mood-afro'],
}

/** What a room of a member plays when no DJ does: the tracks of the team's rooms of its styles, or of all of them (pop, classical, no style). */
export function houseTracksForStyles(styles: readonly string[]): TestTrack[] {
  const wanted = styles.flatMap((style) => ROOMS_OF_STYLE[style] ?? [])
  const rooms = wanted.length > 0 ? wanted : Object.keys(HOUSE_TRACKS)
  const byVideo = new Map<string, TestTrack>()
  for (const room of rooms) for (const track of HOUSE_TRACKS[room] ?? []) byVideo.set(track.videoId, track)
  return [...byVideo.values()]
}
