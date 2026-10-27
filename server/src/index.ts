import { AccountService } from './accounts/AccountService'
import { PgAccountStore } from './accounts/PgAccountStore'
import { PgActivityStore } from './activity/PgActivityStore'
import type { ActivityStore } from './activity/ActivityStore'
import { createNoctuneServer } from './createServer'
import { createPool } from './db/pool'
import { loadLocalEnv } from './env'
import { parseAllowedOrigins } from './http/origin'
import { PgPlaylistStore } from './playlists/PgPlaylistStore'
import type { PlaylistStore } from './playlists/PlaylistStore'
import { PgRoomStore } from './rooms/PgRoomStore'
import type { RoomStore } from './rooms/RoomStore'
import { YouTubeResolver } from './youtube/YouTubeResolver'

loadLocalEnv()

const PORT = Number(process.env.PORT ?? 3001)
const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS

/** A setting that is wrong stops the server with a sentence, instead of a stack trace or a server that refuses everything. */
function setting<T>(read: () => T): T {
  try {
    return read()
  } catch (error) {
    console.error(`[config] ${(error as Error).message}`)
    process.exit(1)
  }
}

// Comma-separated. In production: the address of the site, over HTTPS.
const allowedOrigins = setting(() => parseAllowedOrigins(process.env.APP_ORIGIN, 'http://localhost:5173'))

// How many reverse proxies stand in front of the server (0: none, the default). See clientIp: with a number here,
// the Node port must only be reachable through the proxy.
const trustedProxies = setting(() => {
  const count = Number(process.env.TRUST_PROXY ?? 0)
  if (!Number.isInteger(count) || count < 0 || count > 5) {
    throw new Error(`TRUST_PROXY doit être le nombre de proxys devant le serveur (0 à 5), pas « ${process.env.TRUST_PROXY} ».`)
  }
  return count
})

// The session cookie only travels over HTTPS when the site is served over HTTPS.
const secureCookies = process.env.NODE_ENV === 'production' || allowedOrigins.every((origin) => origin.startsWith('https://'))

/** Accounts, playlists and rooms of members need a database. Without DATABASE_URL the server still runs, for visitors only. */
async function openDatabase(): Promise<{ accounts: AccountService; playlistStore: PlaylistStore; roomStore: RoomStore; activityStore: ActivityStore } | null> {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.log('[base] DATABASE_URL absent : le serveur tourne sans comptes ni playlists (visiteurs seulement). Voir npm run db:setup.')
    return null
  }
  const pool = createPool(url)
  try {
    // Fails now, and loudly, rather than at the first sign-in.
    await pool.query('SELECT 1 FROM users LIMIT 1')
    await pool.query('SELECT 1 FROM playlists LIMIT 1')
    await pool.query('SELECT 1 FROM rooms LIMIT 1')
    await pool.query('SELECT 1 FROM member_activity LIMIT 1')
  } catch (error) {
    console.error(`[base] base inaccessible ou pas à jour : ${(error as Error).message}. Essaie npm run db:migrate.`)
    await pool.end()
    process.exit(1)
  }
  console.log('[base] comptes, playlists et rooms de membres activés.')
  return {
    accounts: new AccountService(new PgAccountStore(pool)),
    playlistStore: new PgPlaylistStore(pool),
    roomStore: new PgRoomStore(pool),
    activityStore: new PgActivityStore(pool),
  }
}

const database = await openDatabase()
const accounts = database?.accounts ?? null
if (accounts) {
  // The counters of attempts are cleaned every minute (they grow with every address seen), the expired sessions hourly.
  setInterval(() => accounts.sweepLimits(), MINUTE_MS).unref()
  setInterval(() => {
    accounts.sweepSessions().catch((error: Error) => console.error(`[base] nettoyage impossible : ${error.message}`))
  }, HOUR_MS).unref()
}

/** DJs line tracks up by pasting YouTube links: reading them needs a YouTube Data API key. Without one, they cannot. */
function openResolver(): YouTubeResolver | null {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) {
    console.log('[youtube] YOUTUBE_API_KEY absente : les DJ ne peuvent pas ajouter de morceaux.')
    return null
  }
  console.log('[youtube] lecture des vidéos activée : les membres peuvent passer DJ.')
  return new YouTubeResolver({ apiKey })
}

const resolver = openResolver()

// The rooms that exist at the start: the rooms of the team, and those the members made. Without a database, the rooms of
// the team alone (served from memory, by the server itself).
const initialRooms = database ? await database.roomStore.list() : undefined

const { httpServer, playlists, rooms, activity } = createNoctuneServer({
  accounts,
  playlistStore: database?.playlistStore ?? null,
  roomStore: database?.roomStore ?? null,
  activityStore: database?.activityStore ?? null,
  initialRooms,
  resolver,
  allowedOrigins,
  secureCookies,
  trustedProxies,
})
// The counters of requests to the playlists are cleaned every minute, like those of the accounts.
if (playlists) setInterval(() => playlists.sweep(), MINUTE_MS).unref()
setInterval(() => rooms.sweep(), MINUTE_MS).unref()
// What members did is written by batches while the server runs, and once more when it is asked to stop.
activity?.start()
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    // A database that does not answer must not keep the server from stopping.
    const giveUp = setTimeout(() => process.exit(0), 5000)
    activity
      ?.stop()
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(giveUp)
        process.exit(0)
      })
    if (!activity) process.exit(0)
  })
}
httpServer.listen(PORT, () => console.log(`Serveur temps réel sur :${PORT}`))
