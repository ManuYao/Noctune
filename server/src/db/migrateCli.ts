// `npm run db:migrate`: brings the database named by DATABASE_URL up to date.
import { loadLocalEnv } from '../env'
import { createPool } from './pool'
import { migrate } from './migrate'

loadLocalEnv()
const url = process.env.DATABASE_URL
if (!url) {
  console.log('[base] DATABASE_URL n\'est pas défini : rien à migrer (le serveur tourne alors sans comptes).')
  process.exit(0)
}

const pool = createPool(url)
try {
  const applied = await migrate(pool)
  console.log(applied.length ? `[base] migrations appliquées : ${applied.join(', ')}` : '[base] la base est à jour.')
} catch (error) {
  console.error(`[base] ${(error as Error).message}`)
  process.exitCode = 1
} finally {
  await pool.end()
}
