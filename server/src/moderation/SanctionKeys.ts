import { createHmac, randomBytes } from 'node:crypto'

/**
 * What a sanction sticks to. A member is sanctioned by their account, so that it follows them to another device. A
 * visitor has no account: they are sanctioned by a keyed hash of their address (the "light blocking" decided for visitors).
 * The key of the hash is made when the server starts and never kept: the address itself is never stored, and the hashes
 * mean nothing after a restart. Whoever shares an address (a family, a school) shares the sanction: that is the price of
 * blocking somebody who has no account.
 */
export class SanctionKeys {
  constructor(private readonly secret: Buffer = randomBytes(32)) {}

  member(accountId: string): string {
    return `m:${accountId}`
  }

  visitor(address: string): string {
    return `v:${createHmac('sha256', this.secret).update(address).digest('hex').slice(0, 32)}`
  }
}
