// `npm start`: runs the web app and the realtime server together, one log with a prefix per line, and starts the
// local database first when the project was set up for it (npm run db:setup).
// Ctrl+C stops everything, and so does either service exiting on its own (a port already in use, for example).
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { createInterface } from 'node:readline'
import { ensureRunning, stop as stopDatabase } from './db.mjs'

const SERVER_PORT = 3001 // also the target of the Vite proxy (vite.config.ts)

// The dev server restarts on file changes, so after "port already in use" it just waits: better to say it now.
function isPortInUse(port) {
  return new Promise((resolve) => {
    const probe = createServer()
    probe.once('error', (error) => resolve(error.code === 'EADDRINUSE'))
    probe.once('listening', () => probe.close(() => resolve(false)))
    probe.listen(port)
  })
}

if (await isPortInUse(SERVER_PORT)) {
  console.error(
    `Le port ${SERVER_PORT} est déjà utilisé : un ancien serveur Noctune tourne sans doute encore. ` +
      "Ferme l'autre terminal (ou arrête le processus node) puis relance npm start.",
  )
  process.exit(1)
}

// The accounts need the database. Without a local one the server still runs, for visitors only: it says so itself.
let database = { available: false, startedByUs: false }
try {
  database = ensureRunning()
} catch (error) {
  console.error(`[base] ${error.message}`)
  process.exit(1)
}
if (database.available) {
  console.log(`[base] ${database.startedByUs ? 'base locale démarrée' : 'base locale déjà démarrée'}.`)
  // Brings the schema up to date, so that a new version of the project never meets an old database.
  const migrated = spawnSync('npm run db:migrate', { shell: true, stdio: 'inherit' })
  if (migrated.status !== 0) {
    if (database.startedByUs) stopDatabase()
    process.exit(1)
  }
}

const SERVICES = [
  { name: 'serveur', command: 'npm run dev:server' },
  { name: 'site   ', command: 'npm run dev' },
]

const isWindows = process.platform === 'win32'
let stopping = false

function stop(code) {
  if (stopping) return
  stopping = true
  for (const child of children) {
    if (child.exitCode !== null || child.pid === undefined) continue
    // The services run behind a shell and npm: the whole tree has to go, not only the first process.
    if (isWindows) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    else process.kill(-child.pid, 'SIGTERM')
  }
  // A database somebody else started is theirs to stop.
  if (database.startedByUs) {
    try {
      stopDatabase()
      console.log('[base] base locale arrêtée.')
    } catch (error) {
      console.error(`[base] arrêt impossible : ${error.message}`)
    }
  }
  process.exit(code)
}

function relay(stream, name, target) {
  createInterface({ input: stream }).on('line', (line) => target.write(`[${name}] ${line}\n`))
}

const children = SERVICES.map(({ name, command }) => {
  // On Linux and macOS each service gets its own process group, so Ctrl+C reaches this script only.
  const child = spawn(command, { shell: true, stdio: ['ignore', 'pipe', 'pipe'], detached: !isWindows })
  relay(child.stdout, name, process.stdout)
  relay(child.stderr, name, process.stderr)
  child.on('exit', (code) => {
    if (stopping) return
    console.error(`[${name}] s'est arrêté (code ${code}). Arrêt de l'autre service.`)
    stop(code ?? 1)
  })
  return child
})

process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))

console.log('Noctune démarre : site sur http://localhost:5173, serveur temps réel sur :3001. Ctrl+C pour tout arrêter.')
