// Local PostgreSQL for development, kept on the D: drive (nothing may go on C:).
//   node scripts/db.mjs setup    installs (once), starts, creates the role and the databases, writes .env.local
//   node scripts/db.mjs start | stop | status
// In production the server reads a hosted database from DATABASE_URL instead: this script is only for a dev machine.
import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { appendFileSync, createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// Next to the project, outside it: a gigabyte of binaries and a data folder that changes all the time stay out of git and the editor.
export const PG_HOME = resolve(process.env.NOCTUNE_PG_HOME ?? join(ROOT, '..', 'noctune-postgres'))
const BIN = join(PG_HOME, 'pgsql', 'bin')
const DATA = join(PG_HOME, 'data')
const TMP = join(PG_HOME, 'tmp')
const LOG = join(PG_HOME, 'postgres.log')
const SUPERUSER_FILE = join(PG_HOME, 'superuser.password')
const ENV_FILE = join(ROOT, '.env.local')
const DOWNLOAD_DIR = join(ROOT, '.tmp', 'pg-download')
export const PORT = 5433 // not the default 5432, so that it never clashes with another PostgreSQL on this machine
const APP_ROLE = 'noctune'
const DATABASES = ['noctune', 'noctune_test']

// Official EDB build of PostgreSQL for Windows. EDB publishes no checksum: this is the hash of the file downloaded
// over HTTPS from the official link on 2026-10-23, checked on every download from now on.
const DOWNLOAD = {
  url: 'https://get.enterprisedb.com/postgresql/postgresql-18.6-5-windows-x64-binaries.zip',
  sha256: 'e2246ba91d22345bc3d017586c09ede52d9df180b1eeb480f050445f1cad84e2',
}

const exe = (name) => join(BIN, `${name}.exe`)
const isInstalled = () => existsSync(exe('postgres'))
const hasCluster = () => existsSync(join(DATA, 'PG_VERSION'))
const say = (message) => console.log(`[base] ${message}`)

function assertNotOnC() {
  if (/^c:/i.test(PG_HOME)) throw new Error(`Le disque C: est interdit : ${PG_HOME}. Utilise NOCTUNE_PG_HOME pour choisir un dossier sur D:.`)
}

/** Runs one of the PostgreSQL programs. Its temporary files go next to its data, never to the C: drive. */
function run(name, args, { env = {}, input, quiet = false } = {}) {
  mkdirSync(TMP, { recursive: true })
  const result = spawnSync(exe(name), args, {
    encoding: 'utf8',
    input,
    windowsHide: true,
    stdio: quiet ? 'ignore' : ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, TEMP: TMP, TMP, ...env },
  })
  return result
}

export function isRunning() {
  return isInstalled() && hasCluster() && run('pg_ctl', ['status', '-D', DATA], { quiet: true }).status === 0
}

export function start() {
  if (isRunning()) return false
  // The server's own output goes to the log file: nothing is left attached to this process.
  run('pg_ctl', ['start', '-D', DATA, '-l', LOG, '-w', '-t', '60'], { quiet: true })
  if (!isRunning()) throw new Error(`PostgreSQL ne démarre pas. Voir ${LOG}`)
  return true
}

export function stop() {
  if (!isRunning()) return false
  run('pg_ctl', ['stop', '-D', DATA, '-m', 'fast', '-w', '-t', '60'], { quiet: true })
  return !isRunning()
}

/**
 * Does the project use this local database? True without a DATABASE_URL, or with one that points at this instance;
 * false for any other (a hosted database): this script must then neither start anything nor replace the setting.
 */
export function usesLocalDatabase() {
  const url = process.env.DATABASE_URL ?? parseEnvFile().get('DATABASE_URL')
  if (!url) return true
  try {
    const { hostname, port } = new URL(url)
    return ['127.0.0.1', 'localhost', '[::1]'].includes(hostname) && Number(port) === PORT
  } catch {
    return false
  }
}

/**
 * For `npm start`: makes sure the local database is there when the project was set up for it.
 * Returns whether the database is available and whether this call started it (so that the caller stops it afterwards).
 */
export function ensureRunning() {
  if (!usesLocalDatabase() || !isInstalled() || !hasCluster()) return { available: false, startedByUs: false }
  return { available: true, startedByUs: start() }
}

/** The unique identifier of the account that runs this script (a name can resolve to another account). */
function mySid() {
  const result = spawnSync('whoami', ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true })
  return /"(S-1-[0-9-]+)"\s*$/.exec((result.stdout ?? '').trim())?.[1] ?? null
}

/**
 * On Windows a file made under D:\ is readable, and writable, by every account of the computer. The passwords, and the
 * settings of the database (who may connect, how), are for the person who runs the project alone.
 * Careful, each point of this was learned the hard way: the account is given by its SID; the right is granted before
 * the inheritance is cut (the other way round, a failed grant leaves nobody); the cut is made on the folder only, never
 * with /T (which strips the children of what they inherit, so that nobody can open them); and a check that the owner
 * can still read, with the inherited permissions given back if not.
 */
function keepForMe(path, { folder }) {
  if (process.platform !== 'win32') return
  const sid = mySid()
  if (!sid) return
  const run = (...args) => spawnSync('icacls', [path, ...args], { stdio: 'ignore', windowsHide: true }).status === 0
  if (!run('/grant:r', `*${sid}:${folder ? '(OI)(CI)F' : 'F'}`) || !run('/inheritance:r')) {
    run('/reset')
    return
  }
  try {
    if (folder) readdirSync(path)
    else readFileSync(path)
  } catch {
    run('/reset')
  }
}

// What this script generates, and what it puts in a SQL script: nothing else may come in through .env.local.
const SECRET_SHAPE = /^[A-Za-z0-9_-]+$/

function parseEnvFile() {
  const values = new Map()
  if (!existsSync(ENV_FILE)) return values
  for (const line of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (match) values.set(match[1], match[2])
  }
  return values
}

function writeEnvFile(values) {
  const lines = [
    '# Local settings, never committed (see .gitignore). Written by `npm run db:setup`.',
    ...[...values].map(([key, value]) => `${key}=${value}`),
    '',
  ]
  writeFileSync(ENV_FILE, lines.join('\n'))
  keepForMe(ENV_FILE, { folder: false })
}

async function sha256Of(file) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}

/** Downloads to `destination`, picking up where a dropped connection or an earlier run stopped. */
async function download(destination) {
  const MAX_ATTEMPTS = 8
  for (let attempt = 1; ; attempt += 1) {
    let received = existsSync(destination) ? statSync(destination).size : 0
    try {
      const response = await fetch(DOWNLOAD.url, { headers: received ? { Range: `bytes=${received}-` } : {} })
      if (response.status === 416) return // nothing left to fetch: the file is complete
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`)
      if (received && response.status !== 206) received = 0 // the server sent everything again: start over
      const total = received + Number(response.headers.get('content-length') ?? 0)
      let shown = -1
      const count = new Transform({
        transform(chunk, _encoding, done) {
          received += chunk.length
          const tenth = total ? Math.floor((received / total) * 10) : 0
          if (tenth !== shown) {
            shown = tenth
            say(`téléchargement : ${tenth * 10} %`)
          }
          done(null, chunk)
        },
      })
      await pipeline(Readable.fromWeb(response.body), count, createWriteStream(destination, { flags: received ? 'a' : 'w' }))
      return
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) throw new Error(`Téléchargement impossible : ${error.message}`)
      say(`connexion interrompue (${error.message}), reprise…`)
    }
  }
}

async function install() {
  mkdirSync(DOWNLOAD_DIR, { recursive: true })
  const zip = join(DOWNLOAD_DIR, 'pg.zip')
  if (!existsSync(zip) || (await sha256Of(zip)) !== DOWNLOAD.sha256) {
    say("téléchargement de PostgreSQL 18.6 (environ 385 Mo) depuis le site officiel d'EDB…")
    await download(zip)
    const found = await sha256Of(zip)
    if (found !== DOWNLOAD.sha256) {
      rmSync(zip)
      throw new Error(`Empreinte inattendue (${found}) : le fichier est supprimé, rien n'est installé.`)
    }
  }
  say('empreinte vérifiée, extraction…')
  mkdirSync(PG_HOME, { recursive: true })
  // bsdtar, which ships with Windows, reads zip files.
  const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
  const extracted = spawnSync(tar, ['-xf', zip, '-C', PG_HOME], { stdio: 'inherit', windowsHide: true })
  if (extracted.status !== 0) throw new Error("L'extraction a échoué.")
  rmSync(DOWNLOAD_DIR, { recursive: true, force: true })
}

// The archive carries pgAdmin, a graphical tool of about 800 MB that this project does not use.
function prune() {
  for (const unused of ['pgAdmin 4', 'StackBuilder', 'doc']) rmSync(join(PG_HOME, 'pgsql', unused), { recursive: true, force: true })
}

const secret = () => randomBytes(24).toString('base64url')

function psql(sql, { database = 'postgres', password }) {
  const result = run('psql', ['-h', '127.0.0.1', '-p', String(PORT), '-U', 'postgres', '-d', database, '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-f', '-'], {
    input: sql,
    env: { PGPASSWORD: password },
  })
  if (result.status !== 0) throw new Error(`psql a échoué : ${result.stderr.trim()}`)
  return result.stdout.trim()
}

async function setup() {
  assertNotOnC()
  if (!usesLocalDatabase()) {
    throw new Error(
      'DATABASE_URL pointe vers une autre base (hébergée ?) : db:setup ne la remplace pas. ' +
        'Retire DATABASE_URL de .env.local (et de l\'environnement) pour installer la base locale.',
    )
  }
  say(`dossier : ${PG_HOME}`)
  if (!isInstalled()) await install()
  else say('PostgreSQL est déjà installé.')
  prune()

  if (!hasCluster()) {
    mkdirSync(TMP, { recursive: true })
    const superuserPassword = secret()
    writeFileSync(SUPERUSER_FILE, superuserPassword)
    const pwfile = join(TMP, 'initdb.pw')
    writeFileSync(pwfile, superuserPassword)
    say('création de la base de données (une seule fois)…')
    const init = run('initdb', ['-D', DATA, '-U', 'postgres', '-E', 'UTF8', '--locale-provider=builtin', '--builtin-locale=C.UTF-8', '--locale=C', '--auth=scram-sha-256', `--pwfile=${pwfile}`])
    rmSync(pwfile, { force: true })
    if (init.status !== 0) throw new Error(`initdb a échoué : ${init.stderr.trim()}`)
    // Reachable from this computer only.
    appendFileSync(join(DATA, 'postgresql.conf'), `\nlisten_addresses = '127.0.0.1'\nport = ${PORT}\nmax_connections = 50\n`)
  }

  say(start() ? 'PostgreSQL démarré.' : 'PostgreSQL tourne déjà.')

  keepForMe(PG_HOME, { folder: true })

  const admin = readFileSync(SUPERUSER_FILE, 'utf8').trim()
  const env = parseEnvFile()
  const existing = /^postgres:\/\/noctune:([^@]+)@/.exec(env.get('DATABASE_URL') ?? '')
  const appPassword = existing ? existing[1] : secret()
  for (const password of [admin, appPassword]) {
    if (!SECRET_SHAPE.test(password)) {
      throw new Error('Un mot de passe de .env.local ou de superuser.password a une forme inattendue : supprime ces fichiers et relance db:setup.')
    }
  }
  psql(
    `DO $$ BEGIN
       IF EXISTS (SELECT FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
         ALTER ROLE ${APP_ROLE} LOGIN CREATEDB PASSWORD '${appPassword}';
       ELSE
         CREATE ROLE ${APP_ROLE} LOGIN CREATEDB PASSWORD '${appPassword}';
       END IF;
     END $$;`,
    { password: admin },
  )
  for (const database of DATABASES) {
    const found = psql(`SELECT 1 FROM pg_database WHERE datname = '${database}'`, { password: admin })
    if (found !== '1') psql(`CREATE DATABASE ${database} OWNER ${APP_ROLE} ENCODING 'UTF8' TEMPLATE template0 LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8'`, { password: admin })
  }

  const url = (database) => `postgres://${APP_ROLE}:${appPassword}@127.0.0.1:${PORT}/${database}`
  env.set('DATABASE_URL', url('noctune'))
  env.set('DATABASE_URL_TEST', url('noctune_test'))
  writeEnvFile(env)
  say(`prêt. Accès écrits dans ${ENV_FILE} (jamais envoyé sur git).`)
  say('Étape suivante : npm start (il démarre et arrête la base avec le reste).')
}

function status() {
  if (!isInstalled() || !hasCluster()) return say('non installée. Lance : npm run db:setup')
  say(`${isRunning() ? 'démarrée' : 'arrêtée'} (port ${PORT}, données dans ${DATA})`)
}

async function main() {
  const command = process.argv[2]
  if (command === 'setup') await setup()
  else if (command === 'start') say(start() ? 'démarrée.' : 'tournait déjà.')
  else if (command === 'stop') say(stop() ? 'arrêtée.' : "n'était pas démarrée.")
  else if (command === 'status') status()
  else {
    console.error('Usage : node scripts/db.mjs setup | start | stop | status')
    process.exit(2)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[base] ${error.message}`)
    process.exit(1)
  })
}
