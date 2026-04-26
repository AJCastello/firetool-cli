import type { TFiretoolError } from '../../shared/types.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RulesCheckResult = {
  service: 'firestore' | 'storage'
  path: string
  intent: string
  allowed: boolean
  /** Present when the document/object does not exist but access was allowed. */
  notFound?: boolean
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

/**
 * Resolve an Authorization header value from an auth context object.
 *
 * Accepts:
 * - `{ token: string }` — a raw Bearer token (used verbatim)
 * - `{ uid: string; email?: string }` — a simulated Firebase user (builds an unsigned JWT
 *   that the emulator accepts because it does not verify signatures)
 */
export function resolveAuthHeader(auth: unknown, projectId: string): string | undefined {
  if (!auth || typeof auth !== 'object') return undefined
  const a = auth as Record<string, unknown>
  if (typeof a['token'] === 'string') return `Bearer ${a['token']}`
  if (typeof a['uid'] === 'string') {
    const token = buildEmulatorToken(
      a['uid'],
      typeof a['email'] === 'string' ? a['email'] : undefined,
      projectId,
    )
    return `Bearer ${token}`
  }
  return undefined
}

/** Build an unsigned JWT accepted by the Firebase Emulator for rules testing. */
function buildEmulatorToken(uid: string, email: string | undefined, projectId: string): string {
  const header = toBase64Url({ alg: 'none', typ: 'JWT' })
  const now = Math.floor(Date.now() / 1000)
  const payload = toBase64Url({
    sub: uid,
    uid,
    iss: `https://securetoken.google.com/${projectId}`,
    aud: projectId,
    iat: now,
    exp: now + 3600,
    ...(email ? { email, email_verified: true } : {}),
    firebase: {
      sign_in_provider: 'custom',
      identities: email ? { email: [email] } : {},
    },
  })
  return `${header}.${payload}.`
}

function toBase64Url(data: unknown): string {
  return Buffer.from(JSON.stringify(data), 'utf8').toString('base64url')
}

// ---------------------------------------------------------------------------
// Intent → HTTP method
// ---------------------------------------------------------------------------

const READ_INTENTS = new Set(['read', 'get', 'list'])
const DELETE_INTENTS = new Set(['delete'])

export function intentToMethod(intent: string): 'GET' | 'POST' | 'PATCH' | 'DELETE' {
  const lower = intent.toLowerCase()
  if (READ_INTENTS.has(lower)) return 'GET'
  if (DELETE_INTENTS.has(lower)) return 'DELETE'
  if (lower === 'update') return 'PATCH'
  return 'POST' // write / create / default
}

// ---------------------------------------------------------------------------
// Firestore rules probe
// ---------------------------------------------------------------------------

async function probeFirestore(
  host: string,
  port: number,
  projectId: string,
  resourcePath: string,
  intent: string,
  authHeader: string | undefined,
  fetcher: Fetcher,
): Promise<{ data: RulesCheckResult } | { error: TFiretoolError }> {
  const base = `http://${host}:${port}/v1/projects/${projectId}/databases/(default)/documents`
  const method = intentToMethod(intent)
  const path = resourcePath.replace(/^\/+/, '')
  const url = `${base}/${path}`

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (authHeader) headers['Authorization'] = authHeader

  let body: string | undefined
  if (method === 'POST') {
    body = JSON.stringify({ fields: {} })
  } else if (method === 'PATCH') {
    // PATCH with empty updateMask tests write permission without modifying data
    body = JSON.stringify({ fields: {} })
  }

  try {
    const fetchUrl = method === 'PATCH' ? `${url}?updateMask.fieldPaths=_probe` : url
    const res = await fetcher(fetchUrl, { method, headers, body })

    if (res.status === 401 || res.status === 403) {
      return {
        error: {
          code: 'RULE_DENIED',
          message: `Firestore rules denied "${intent}" on path "${path}".`,
          hint: 'Check your firestore.rules to see which conditions block this operation.',
        },
      }
    }

    if (res.status === 404 && READ_INTENTS.has(intent.toLowerCase())) {
      return {
        data: { service: 'firestore', path, intent, allowed: true, notFound: true },
      }
    }

    if (res.status === 400) {
      const errBody = await safeJson(res)
      return {
        error: {
          code: 'INVALID_INPUT',
          message: `Firestore returned a bad request for path "${path}": ${extractErrorMessage(errBody, res.status)}`,
          hint: 'Check the resource path format.',
        },
      }
    }

    if (!res.ok) {
      return {
        error: {
          code: 'INVALID_INPUT',
          message: `Firestore Emulator returned HTTP ${res.status} for path "${path}".`,
          hint: 'Check the resource path and intent.',
        },
      }
    }

    return { data: { service: 'firestore', path, intent, allowed: true } }
  } catch (err) {
    return connectionError('Firestore', err)
  }
}

// ---------------------------------------------------------------------------
// Storage rules probe
// ---------------------------------------------------------------------------

function encodeStoragePath(objectPath: string): string {
  return objectPath
    .replace(/^\/+/, '')
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('%2F')
}

async function probeStorage(
  host: string,
  port: number,
  bucket: string,
  resourcePath: string,
  intent: string,
  authHeader: string | undefined,
  fetcher: Fetcher,
): Promise<{ data: RulesCheckResult } | { error: TFiretoolError }> {
  const method = intentToMethod(intent)
  const path = resourcePath.replace(/^\/+/, '')
  const encodedPath = encodeStoragePath(path)

  const headers: Record<string, string> = {}
  if (authHeader) headers['Authorization'] = authHeader

  let url: string
  let body: string | undefined
  if (method === 'POST') {
    const params = new URLSearchParams({ uploadType: 'media', name: path })
    url = `http://${host}:${port}/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?${params}`
    headers['Content-Type'] = 'application/octet-stream'
    body = ''
  } else if (method === 'DELETE') {
    url = `http://${host}:${port}/v0/b/${encodeURIComponent(bucket)}/o/${encodedPath}`
  } else {
    url = `http://${host}:${port}/v0/b/${encodeURIComponent(bucket)}/o/${encodedPath}?alt=media`
  }

  try {
    const res = await fetcher(url, { method, headers, body })

    if (res.status === 401 || res.status === 403) {
      return {
        error: {
          code: 'RULE_DENIED',
          message: `Storage rules denied "${intent}" on path "${path}" in bucket "${bucket}".`,
          hint: 'Check your storage.rules to see which conditions block this operation.',
        },
      }
    }

    if (res.status === 404 && READ_INTENTS.has(intent.toLowerCase())) {
      return {
        data: { service: 'storage', path, intent, allowed: true, notFound: true },
      }
    }

    if (res.status === 400) {
      const errBody = await safeJson(res)
      return {
        error: {
          code: 'INVALID_INPUT',
          message: `Storage returned a bad request for path "${path}": ${extractErrorMessage(errBody, res.status)}`,
          hint: 'Check the resource path format.',
        },
      }
    }

    if (!res.ok) {
      return {
        error: {
          code: 'INVALID_INPUT',
          message: `Storage Emulator returned HTTP ${res.status} for path "${path}".`,
          hint: 'Check the resource path and intent.',
        },
      }
    }

    return { data: { service: 'storage', path, intent, allowed: true } }
  } catch (err) {
    return connectionError('Storage', err)
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Probe the Firestore or Storage emulator to determine if the given `intent`
 * (read / write / delete / …) is allowed by the configured security rules.
 *
 * Error codes map to:
 * - `RULE_DENIED`          — rules explicitly deny the operation (403/401)
 * - `EMULATOR_NOT_RUNNING` — cannot connect to the emulator (technical limitation)
 * - `CONTEXT_NOT_FOUND`    — no firebase.json / project context (absent context)
 * - `INVALID_INPUT`        — bad path, bucket, or intent format (invalid input)
 */
export async function checkRules(
  host: string,
  port: number,
  projectId: string,
  service: 'firestore' | 'storage',
  resourcePath: string,
  intent: string,
  bucket: string | undefined,
  auth: unknown,
  fetcher: Fetcher = fetch,
): Promise<{ data: RulesCheckResult } | { error: TFiretoolError }> {
  if (!resourcePath) {
    return {
      error: {
        code: 'INVALID_INPUT',
        message: 'A resource path is required for rules check.',
        hint: 'Pass --path <path> to specify the document or object path.',
      },
    }
  }

  const authHeader = resolveAuthHeader(auth, projectId)

  if (service === 'firestore') {
    return probeFirestore(host, port, projectId, resourcePath, intent, authHeader, fetcher)
  }

  const resolvedBucket = bucket ?? `${projectId}.appspot.com`
  return probeStorage(host, port, resolvedBucket, resourcePath, intent, authHeader, fetcher)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

function extractErrorMessage(body: unknown, status: number): string {
  if (body !== null && typeof body === 'object') {
    const b = body as Record<string, unknown>
    if (typeof b['message'] === 'string') return b['message']
    if (b['error'] && typeof b['error'] === 'object') {
      const e = b['error'] as Record<string, unknown>
      if (typeof e['message'] === 'string') return e['message']
    }
  }
  return `HTTP ${status}`
}

function connectionError(service: string, err: unknown): { error: TFiretoolError } {
  return {
    error: {
      code: 'EMULATOR_NOT_RUNNING',
      message: `Could not connect to ${service} Emulator: ${err instanceof Error ? err.message : String(err)}`,
      hint: `Ensure the ${service} Emulator is running locally and retry.`,
    },
  }
}
