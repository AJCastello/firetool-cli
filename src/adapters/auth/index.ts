import type { TFiretoolError } from '../../shared/types.ts'

export type AuthUser = {
  localId: string
  email?: string
  displayName?: string
  phoneNumber?: string
  disabled?: boolean
  emailVerified?: boolean
  createdAt?: string
  lastLoginAt?: string
  providerUserInfo?: Array<{
    providerId: string
    email?: string
    displayName?: string
  }>
}

export type CreateUserData = {
  email?: string
  password?: string
  displayName?: string
  phoneNumber?: string
  disabled?: boolean
  emailVerified?: boolean
}

export type UpdateUserData = {
  email?: string
  password?: string
  displayName?: string
  phoneNumber?: string
  disabled?: boolean
  emailVerified?: boolean
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

function adminHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    // The Auth Emulator accepts any Bearer token as admin credentials.
    Authorization: 'Bearer owner',
  }
}

async function callEmulator<T>(
  url: string,
  init: RequestInit,
  fetcher: Fetcher,
): Promise<{ data: T } | { error: TFiretoolError }> {
  try {
    const res = await fetcher(url, {
      ...init,
      headers: {
        ...adminHeaders(),
        ...(init.headers ?? {}),
      },
    })

    let body: unknown
    try {
      body = await res.json()
    } catch {
      body = {}
    }

    if (!res.ok) {
      const errBody = body as { error?: { message?: string } }
      return {
        error: {
          code: 'INVALID_INPUT',
          message: errBody.error?.message ?? `Auth Emulator returned HTTP ${res.status}.`,
          hint: 'Check the provided data and retry.',
        },
      }
    }

    return { data: body as T }
  } catch (err) {
    return {
      error: {
        code: 'EMULATOR_NOT_RUNNING',
        message: `Could not connect to Auth Emulator: ${err instanceof Error ? err.message : String(err)}`,
        hint: 'Ensure the Auth Emulator is running locally and retry.',
      },
    }
  }
}

/** Admin API base path (Identity Toolkit admin routes on the emulator). */
function adminBase(host: string, port: number, projectId: string): string {
  return `http://${host}:${port}/identitytoolkit.googleapis.com/v1/projects/${projectId}`
}

export async function listUsers(
  host: string,
  port: number,
  projectId: string,
  fetcher: Fetcher = fetch,
): Promise<{ data: AuthUser[] } | { error: TFiretoolError }> {
  const url = `${adminBase(host, port, projectId)}/accounts:batchGet?maxResults=500&key=owner`
  const result = await callEmulator<{ users?: AuthUser[] }>(url, { method: 'GET' }, fetcher)
  if ('error' in result) return result
  return { data: result.data.users ?? [] }
}

export async function createUser(
  host: string,
  port: number,
  projectId: string,
  data: CreateUserData,
  fetcher: Fetcher = fetch,
): Promise<{ data: AuthUser } | { error: TFiretoolError }> {
  const url = `${adminBase(host, port, projectId)}/accounts?key=owner`
  const result = await callEmulator<AuthUser>(
    url,
    { method: 'POST', body: JSON.stringify(data) },
    fetcher,
  )
  if ('error' in result) return result
  return { data: result.data }
}

export async function getUser(
  host: string,
  port: number,
  projectId: string,
  identifier: string,
  fetcher: Fetcher = fetch,
): Promise<{ data: AuthUser } | { error: TFiretoolError }> {
  const isEmail = identifier.includes('@')
  const url = `${adminBase(host, port, projectId)}/accounts:lookup?key=owner`
  const body = isEmail ? { email: [identifier] } : { localId: [identifier] }

  const result = await callEmulator<{ users?: AuthUser[] }>(
    url,
    { method: 'POST', body: JSON.stringify(body) },
    fetcher,
  )
  if ('error' in result) return result

  const users = result.data.users ?? []
  if (users.length === 0) {
    return {
      error: {
        code: 'INVALID_INPUT',
        message: `No user found with ${isEmail ? 'email' : 'uid'} "${identifier}".`,
        hint: 'Verify the uid or email and retry.',
      },
    }
  }
  return { data: users[0]! }
}

export async function updateUser(
  host: string,
  port: number,
  projectId: string,
  localId: string,
  data: UpdateUserData,
  fetcher: Fetcher = fetch,
): Promise<{ data: AuthUser } | { error: TFiretoolError }> {
  const url = `${adminBase(host, port, projectId)}/accounts/${localId}`
  const result = await callEmulator<AuthUser>(
    url,
    { method: 'PATCH', body: JSON.stringify(data) },
    fetcher,
  )
  if ('error' in result) return result
  return { data: result.data }
}

export async function deleteUser(
  host: string,
  port: number,
  projectId: string,
  localId: string,
  fetcher: Fetcher = fetch,
): Promise<{ data: { localId: string } } | { error: TFiretoolError }> {
  const url = `${adminBase(host, port, projectId)}/accounts/${localId}`
  const result = await callEmulator<Record<string, never>>(url, { method: 'DELETE' }, fetcher)
  if ('error' in result) return result
  return { data: { localId } }
}

export async function clearUsers(
  host: string,
  port: number,
  projectId: string,
  fetcher: Fetcher = fetch,
): Promise<{ data: { cleared: true } } | { error: TFiretoolError }> {
  // The emulator management endpoint is the canonical way to clear all users.
  const url = `http://${host}:${port}/emulator/v1/projects/${projectId}/accounts`
  const result = await callEmulator<Record<string, never>>(url, { method: 'DELETE' }, fetcher)
  if ('error' in result) return result
  return { data: { cleared: true } }
}
