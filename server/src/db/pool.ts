import pg from 'pg'

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
