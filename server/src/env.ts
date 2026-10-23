import { existsSync } from 'node:fs'

const LOCAL_ENV = new URL('../../.env.local', import.meta.url)

/**
 * Reads `.env.local` at the root of the project (written by `npm run db:setup`, never committed).
 * Variables already set in the environment win: a hosted database is chosen by setting DATABASE_URL, no file needed.
 */
export function loadLocalEnv() {
  if (existsSync(LOCAL_ENV)) process.loadEnvFile(LOCAL_ENV)
}
