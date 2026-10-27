import { createHmac, randomBytes } from 'node:crypto'

/** What a connection's sanctions stick to, and what it is checked against. */
export interface SanctionIdentity {
  /** The key of the person (account for a member, address for a visitor): warnings, allowances. */
  primary: string
  /** Where a mute or an exclusion of this person is written. */
  mark: readonly string[]
  /** What is looked up to know whether this person is muted or excluded: one hit is enough. */
  check: readonly string[]
}

/**
 * What a sanction sticks to. A member is sanctioned by their account, so that it follows them to another device, and
 * their address is marked too, so that they cannot come back as a visitor. A visitor has no account: they are sanctioned
 * by a keyed hash of their address (the "light blocking" decided for visitors), and that also stops a member who arrives
 * from that address. The key of the hash is made when the server starts and never kept: the address itself is never
 * stored, and the hashes mean nothing after a restart. Whoever shares an address (a family, a school) shares a visitor's
 * sanction. A member's sanction marks the address in a way that only visitors read (`a:`), so that other members of the
 * same address are not touched by it.
 */
export class SanctionKeys {
  constructor(private readonly secret: Buffer = randomBytes(32)) {}

  private hashed(address: string): string {
    return createHmac('sha256', this.secret).update(address).digest('hex').slice(0, 32)
  }

  member(accountId: string): string {
    return `m:${accountId}`
  }

  visitor(address: string): string {
    return `v:${this.hashed(address)}`
  }

  identity(accountId: string | undefined, address: string): SanctionIdentity {
    const hashed = this.hashed(address)
    if (accountId === undefined) return { primary: `v:${hashed}`, mark: [`v:${hashed}`], check: [`v:${hashed}`, `a:${hashed}`] }
    const own = this.member(accountId)
    return { primary: own, mark: [own, `a:${hashed}`], check: [own, `v:${hashed}`] }
  }
}
