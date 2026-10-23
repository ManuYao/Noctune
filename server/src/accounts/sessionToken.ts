import { createHash, randomBytes } from 'node:crypto'

export const SESSION_COOKIE = 'noctune_session'

/** 32 random bytes in base64url: always 43 characters. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/

export const hashToken = (token: string): Buffer => createHash('sha256').update(token).digest()

/** The token goes to the browser; only its hash is kept on the server. */
export function newSessionToken(): { token: string; hash: Buffer } {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: hashToken(token) }
}

/** The session token in a `Cookie` header, or undefined when there is none or it cannot be one of ours. */
export function readSessionToken(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=')
    if (separator === -1 || part.slice(0, separator).trim() !== SESSION_COOKIE) continue
    const value = part.slice(separator + 1).trim()
    return TOKEN_SHAPE.test(value) ? value : undefined
  }
  return undefined
}

interface CookieOptions {
  /** Add `Secure`: the browser then only sends the cookie over HTTPS. */
  secure: boolean
}

// HttpOnly: the page's scripts cannot read it (a script injected into the page cannot steal the session).
// SameSite=Lax: other sites cannot make the browser send it along with their own requests.
const ATTRIBUTES = 'HttpOnly; SameSite=Lax; Path=/'

export function sessionCookie(token: string, maxAgeSec: number, { secure }: CookieOptions): string {
  return `${SESSION_COOKIE}=${token}; ${ATTRIBUTES}; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`
}

export function clearedSessionCookie({ secure }: CookieOptions): string {
  return `${SESSION_COOKIE}=; ${ATTRIBUTES}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure ? '; Secure' : ''}`
}
