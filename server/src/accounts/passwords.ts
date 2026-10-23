import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto'

export interface PasswordCost {
  /** CPU and memory cost: a power of two. */
  N: number
  r: number
  p: number
}

// One of the equivalent scrypt settings the OWASP password storage guide gives (N = 2^17, r = 8, p = 1 and
// N = 2^16, r = 8, p = 2 cost the same): about 64 MiB and a few tenths of a second per password on this machine.
export const DEFAULT_COST: PasswordCost = { N: 2 ** 16, r: 8, p: 2 }

const KEY_LENGTH = 64
const SALT_LENGTH = 16
// A stored hash states its own cost, so that the cost can go up later without locking anyone out. Whatever a damaged
// row claims, it may not ask for more than this.
const MAX_COST: PasswordCost = { N: 2 ** 17, r: 16, p: 16 }

function derive(password: string, salt: Buffer, { N, r, p }: PasswordCost): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // scrypt needs 128 * N * r bytes, which is above Node's default ceiling of 32 MiB for these costs.
    const options: ScryptOptions = { N, r, p, maxmem: 256 * N * r }
    // Unicode-normalised, so that the same password typed on another keyboard or system gives the same hash.
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, options, (error, key) => (error ? reject(error) : resolve(key)))
  })
}

/** `scrypt$N$r$p$salt$key`: everything needed to check the password later, nothing that gives it back. */
export async function hashPassword(password: string, cost: PasswordCost = DEFAULT_COST): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const key = await derive(password, salt, cost)
  return ['scrypt', cost.N, cost.r, cost.p, salt.toString('base64'), key.toString('base64')].join('$')
}

/** False for a wrong password and for anything that is not a hash we made. Never throws. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const cost: PasswordCost = { N: Number(parts[1]), r: Number(parts[2]), p: Number(parts[3]) }
  const salt = Buffer.from(parts[4], 'base64')
  const expected = Buffer.from(parts[5], 'base64')
  const powerOfTwo = Number.isInteger(cost.N) && cost.N >= 2 && (cost.N & (cost.N - 1)) === 0
  const inRange = powerOfTwo && cost.N <= MAX_COST.N && Number.isInteger(cost.r) && cost.r >= 1 && cost.r <= MAX_COST.r && Number.isInteger(cost.p) && cost.p >= 1 && cost.p <= MAX_COST.p
  if (!inRange || salt.length === 0 || expected.length !== KEY_LENGTH) return false
  try {
    return timingSafeEqual(await derive(password, salt, cost), expected)
  } catch {
    return false
  }
}
