import type { AuthDone, AuthResult, ProfileReply } from '../../shared/protocol'

/** What the server answered, or a failure that never got an answer (offline, server down). */
export type AccountCallResult = AuthResult | { ok: false; error: 'network' }
export type AccountDoneResult = AuthDone | { ok: false; error: 'network' }

// The session lives in a cookie the page cannot read: the browser sends it by itself, to this site only.
async function send<T>(method: 'PATCH' | 'POST' | 'DELETE', path: string, body: unknown): Promise<T | { ok: false; error: 'network' }> {
  try {
    const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return (await response.json()) as T
  } catch {
    // No connection, or something that is not our server answering (a proxy error page): not a refusal of ours.
    return { ok: false, error: 'network' }
  }
}

export const updateProfile = (input: { pseudo?: string; avatarId?: string }) => send<AuthResult>('PATCH', '/api/auth/me', input)

export const changePassword = (input: { currentPassword: string; newPassword: string }) =>
  send<AuthResult>('POST', '/api/auth/password', input)

export const logoutEverywhere = () => send<AuthDone>('POST', '/api/auth/logout-all', {})

export const deleteAccount = (password: string) => send<AuthDone>('DELETE', '/api/auth/me', { password })

export type ExportResult = { ok: true; blob: Blob } | Extract<AccountDoneResult, { ok: false }>

/** The member's data as a JSON file (right of access). A refusal comes back as JSON; the file as an attachment. */
export async function fetchExport(): Promise<ExportResult> {
  try {
    const response = await fetch('/api/auth/export')
    if (response.ok) return { ok: true, blob: await response.blob() }
    return (await response.json()) as Extract<AccountDoneResult, { ok: false }>
  } catch {
    return { ok: false, error: 'network' }
  }
}

export type ProfileResult = ProfileReply | { ok: false; error: 'network' }

/** What the server counted about the member (statistics, genres, rooms listened to). */
export async function fetchProfile(): Promise<ProfileResult> {
  try {
    const response = await fetch('/api/auth/profile', { cache: 'no-store' })
    return (await response.json()) as ProfileReply
  } catch {
    return { ok: false, error: 'network' }
  }
}
