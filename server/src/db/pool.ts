import pg from 'pg'

/**
 * TLS to the database. By default the URL decides (`?sslmode=require` etc., read by pg). DATABASE_SSL overrides it:
 * `require` (encrypted, certificate checked), `no-verify` (encrypted, certificate NOT checked: only if the host leaves no
 * other choice), `disable`.
 */
export function sslSetting(env: string | undefined): pg.ClientConfig['ssl'] | undefined {
  const value = env?.trim().toLowerCase()
  if (!value) return undefined
  if (value === 'require') return { rejectUnauthorized: true }
  if (value === 'no-verify') return { rejectUnauthorized: false }
  if (value === 'disable') return false
  throw new Error(`DATABASE_SSL doit valoir require, no-verify ou disable, pas « ${env} ».`)
}

/** One pool of connections per process. `connectionString` is a DATABASE_URL: local or hosted, the code does not care. */
export function createPool(connectionString: string, { queryTimeoutMs = 5_000 } = {}): pg.Pool {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // A database that stops answering (frozen host, half-open connection) must make errors, not hangs: without these,
    // every sign-in and every join would wait for ever.
    statement_timeout: queryTimeoutMs,
    query_timeout: queryTimeoutMs,
    keepAlive: true,
  })
  // A dropped idle connection must not crash the server: the pool replaces it by itself.
  pool.on('error', (error) => console.error(`[base] connexion inactive perdue : ${error.message}`))
  return pool
}
