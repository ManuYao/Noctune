import type { AuthResult, SessionResult } from '../../shared/protocol'

/** What the server answered, or a failure that never got an answer (offline, server down). */
export type AuthCallResult = AuthResult | { ok: false; error: 'network' }

// The session lives in a cookie the page cannot read: the browser sends it by itself, to this site only.
// In development Vite forwards /api to the realtime server (see vite.config.ts).
async function post(path: string, body: unknown): Promise<AuthCallResult> {
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return (await response.json()) as AuthResult
  } catch {
    // No connection, or something that is not our server answering (a proxy error page): not a refusal of ours.
    return { ok: false, error: 'network' }
  }
}

export interface RegisterInput {
  email: string
  password: string
  pseudo: string
  avatarId: string
}

export const register = (input: RegisterInput) => post('/api/auth/register', input)

export const login = (input: { email: string; password: string }) => post('/api/auth/login', input)

/**
 * True when the server ended the session. False when it could not be told (offline, server restarting, refused): the
 * session then lives on, and the page must not pretend the person is signed out, least of all on a shared computer.
 */
export async function logout(): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    return response.ok
  } catch {
    return false
  }
}

/** The account behind the cookie, null for a visitor. Undefined when the server could not be asked. */
export async function fetchSession(): Promise<SessionResult['account'] | undefined> {
  try {
    const response = await fetch('/api/auth/me')
    const body = (await response.json()) as SessionResult
    return body.ok ? body.account : undefined
  } catch {
    return undefined
  }
}
