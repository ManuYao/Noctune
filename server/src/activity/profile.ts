import { ROOM_STYLES, type ProfileData, type RoomStyle } from '../../../shared/protocol'
import type { Activity } from './activity'

export interface ProfileSources {
  memberSince: Date
  /** Rooms they host now. */
  roomsHosted: number
  /** Tracks in their playlists, all together. */
  playlistTracks: number
  /** The name of a room that is open now, or undefined when it is not (deleted, or never was). */
  roomName: (roomId: string) => string | undefined
}

const TOP_STYLES = 3
const TOP_ROOMS = 2

/** What the profile page and the badges read: the counters of `activity` plus what lives in other tables. Pure. */
export function assembleProfile(activity: Activity, sources: ProfileSources): ProfileData {
  const known = (style: string): style is RoomStyle => (ROOM_STYLES as readonly string[]).includes(style)
  const styles = [...activity.styles].filter((entry): entry is [RoomStyle, (typeof entry)[1]] => known(entry[0]))
  const topStyles = styles
    .filter(([, value]) => value.seconds > 0)
    .sort((a, b) => b[1].seconds - a[1].seconds || a[0].localeCompare(b[0]))
    .slice(0, TOP_STYLES)
    .map(([style]) => style)

  const topRooms = [...activity.rooms]
    .filter(([, value]) => value.seconds > 0)
    .sort((a, b) => b[1].seconds - a[1].seconds || a[0].localeCompare(b[0]))
    .flatMap(([id]) => {
      const name = sources.roomName(id)
      return name === undefined ? [] : [{ id, name }]
    })
    .slice(0, TOP_ROOMS)

  return {
    stats: {
      tracksPlayed: activity.tracksPlayed,
      likesReceived: activity.likesReceived,
      likesGiven: activity.likesGiven,
      listenSeconds: activity.listenSeconds,
      roomsVisited: activity.rooms.size,
      stylesVisited: styles.filter(([, value]) => value.visited).length,
      stylesPlayed: styles.filter(([, value]) => value.played).length,
      bestTrackLikes: activity.bestTrackLikes,
      daysActive: activity.days.size,
      messagesSent: activity.messagesSent,
      roomsHosted: sources.roomsHosted,
      membersInBestRoom: activity.bestRoomMembers,
      playlistTracks: sources.playlistTracks,
      nightOwl: activity.nightOwl,
      memberSince: sources.memberSince.toISOString(),
    },
    topStyles,
    topRooms,
  }
}
