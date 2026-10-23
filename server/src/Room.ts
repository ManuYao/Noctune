import type { Participant, Track } from '../../shared/protocol'
import { FAKE_TRACKS } from './catalog'

/** In-memory state of one room. The server is the only source of truth. */
export class Room {
  private participants = new Map<string, Participant>()
  private trackIndex = 0
  private timer: NodeJS.Timeout | undefined
  nowPlaying: Track | null = null

  constructor(
    readonly id: string,
    readonly name: string,
    private onTrackChange: (track: Track | null) => void,
  ) {}

  get size() {
    return this.participants.size
  }

  list(): Participant[] {
    return [...this.participants.values()]
  }

  isPseudoTaken(pseudo: string): boolean {
    const wanted = pseudo.toLowerCase()
    return this.list().some((participant) => participant.pseudo.toLowerCase() === wanted)
  }

  add(participant: Participant) {
    this.participants.set(participant.id, participant)
    if (this.participants.size === 1) this.startTrack()
  }

  /** Returns true when the participant was actually in the room. */
  remove(participantId: string): boolean {
    const removed = this.participants.delete(participantId)
    if (removed && this.participants.size === 0) this.stopPlayback()
    return removed
  }

  private startTrack() {
    const fake = FAKE_TRACKS[this.trackIndex % FAKE_TRACKS.length]
    this.trackIndex += 1
    this.nowPlaying = { ...fake, startedAt: Date.now() }
    this.onTrackChange(this.nowPlaying)
    this.timer = setTimeout(() => this.startTrack(), fake.durationSec * 1000)
  }

  private stopPlayback() {
    clearTimeout(this.timer)
    this.timer = undefined
    this.nowPlaying = null
  }
}
