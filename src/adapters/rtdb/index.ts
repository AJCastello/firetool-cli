import type { TFiretoolError } from '../../shared/types.ts'

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

function rtdbBase(host: string, port: number): string {
  return `http://${host}:${port}`
}

/** Normalize a path so it always starts with "/" and never ends with "/". */
function normalizePath(path: string): string {
  const trimmed = path.replace(/\/+$/, '').replace(/^\/+/, '')
  return trimmed ? `/${trimmed}` : '/'
}

function rtdbUrl(host: string, port: number, projectId: string, path: string): string {
  const base = rtdbBase(host, port)
  const normalized = normalizePath(path)
  return `${base}${normalized}.json?ns=${encodeURIComponent(projectId)}`
}

/**
 * Headers for Realtime Database data operations.
 *
 * Data commands are local administration tools, so they talk to the emulator with
 * admin credentials and are not subject to `database.rules`. The emulator accepts
 * `Authorization: Bearer owner` for this; the `?auth=owner` query form is rejected.
 * Use `firetool rules check` to validate what your rules allow for a given identity.
 */
function rtdbHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }
}

async function callRtdb<T>(
  url: string,
  init: RequestInit,
  fetcher: Fetcher,
): Promise<{ data: T } | { error: TFiretoolError }> {
  try {
    const res = await fetcher(url, {
      ...init,
      headers: { ...rtdbHeaders(), ...(init.headers ?? {}) },
    })

    let body: unknown
    try {
      body = await res.json()
    } catch {
      body = null
    }

    if (res.status === 401 || res.status === 403) {
      const errMsg =
        typeof body === 'object' && body !== null && 'error' in body
          ? String((body as Record<string, unknown>)['error'])
          : `HTTP ${res.status}`
      return {
        error: {
          code: 'RULE_DENIED',
          message: `Realtime Database Emulator denied the operation: ${errMsg}`,
          hint: 'Firetool data commands run with emulator admin credentials, so this usually means the emulator rejected them. Confirm you are targeting a local Realtime Database Emulator.',
        },
      }
    }

    if (!res.ok) {
      const errMsg =
        typeof body === 'object' && body !== null && 'error' in body
          ? String((body as Record<string, unknown>)['error'])
          : `HTTP ${res.status}`
      return {
        error: {
          code: 'INVALID_INPUT',
          message: `Realtime Database Emulator returned an error: ${errMsg}`,
          hint: 'Check the provided path and data.',
        },
      }
    }

    return { data: body as T }
  } catch (err) {
    return {
      error: {
        code: 'EMULATOR_NOT_RUNNING',
        message: `Could not connect to Realtime Database Emulator: ${err instanceof Error ? err.message : String(err)}`,
        hint: 'Ensure the Realtime Database Emulator is running locally and retry.',
      },
    }
  }
}

// ---------------------------------------------------------------------------
// Path operations
// ---------------------------------------------------------------------------

export async function getData(
  host: string,
  port: number,
  projectId: string,
  path: string,
  fetcher: Fetcher = fetch,
): Promise<{ data: unknown } | { error: TFiretoolError }> {
  const url = rtdbUrl(host, port, projectId, path)
  return callRtdb<unknown>(url, { method: 'GET' }, fetcher)
}

export async function setData(
  host: string,
  port: number,
  projectId: string,
  path: string,
  data: unknown,
  fetcher: Fetcher = fetch,
): Promise<{ data: unknown } | { error: TFiretoolError }> {
  const url = rtdbUrl(host, port, projectId, path)
  return callRtdb<unknown>(url, { method: 'PUT', body: JSON.stringify(data) }, fetcher)
}

export async function updateData(
  host: string,
  port: number,
  projectId: string,
  path: string,
  data: Record<string, unknown>,
  fetcher: Fetcher = fetch,
): Promise<{ data: unknown } | { error: TFiretoolError }> {
  const url = rtdbUrl(host, port, projectId, path)
  return callRtdb<unknown>(url, { method: 'PATCH', body: JSON.stringify(data) }, fetcher)
}

export async function pushData(
  host: string,
  port: number,
  projectId: string,
  path: string,
  data: unknown,
  fetcher: Fetcher = fetch,
): Promise<{ data: { name: string } } | { error: TFiretoolError }> {
  const url = rtdbUrl(host, port, projectId, path)
  return callRtdb<{ name: string }>(
    url,
    { method: 'POST', body: JSON.stringify(data) },
    fetcher,
  )
}

export async function deleteData(
  host: string,
  port: number,
  projectId: string,
  path: string,
  fetcher: Fetcher = fetch,
): Promise<{ data: { path: string; deleted: true } } | { error: TFiretoolError }> {
  const url = rtdbUrl(host, port, projectId, path)
  const result = await callRtdb<null>(url, { method: 'DELETE' }, fetcher)
  if ('error' in result) return result
  return { data: { path, deleted: true } }
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export type RtdbQueryFilter = {
  orderBy?: string
  equalTo?: unknown
  startAt?: unknown
  endAt?: unknown
  limitToFirst?: number
  limitToLast?: number
}

export async function queryData(
  host: string,
  port: number,
  projectId: string,
  path: string,
  filter: RtdbQueryFilter = {},
  fetcher: Fetcher = fetch,
): Promise<{ data: unknown } | { error: TFiretoolError }> {
  const base = rtdbBase(host, port)
  const normalized = normalizePath(path)
  const params = new URLSearchParams({ ns: projectId })

  if (filter.orderBy !== undefined) {
    params.set('orderBy', JSON.stringify(filter.orderBy))
  }
  if (filter.equalTo !== undefined) {
    params.set('equalTo', JSON.stringify(filter.equalTo))
  }
  if (filter.startAt !== undefined) {
    params.set('startAt', JSON.stringify(filter.startAt))
  }
  if (filter.endAt !== undefined) {
    params.set('endAt', JSON.stringify(filter.endAt))
  }
  if (filter.limitToFirst !== undefined) {
    params.set('limitToFirst', String(filter.limitToFirst))
  }
  if (filter.limitToLast !== undefined) {
    params.set('limitToLast', String(filter.limitToLast))
  }

  const url = `${base}${normalized}.json?${params.toString()}`
  return callRtdb<unknown>(url, { method: 'GET' }, fetcher)
}

// ---------------------------------------------------------------------------
// Seed / Import / Export
// ---------------------------------------------------------------------------

export type SeedEffect = 'created' | 'updated' | 'overwritten'

export async function seedData(
  host: string,
  port: number,
  projectId: string,
  path: string,
  data: unknown,
  fetcher: Fetcher = fetch,
): Promise<
  { data: { path: string; effect: SeedEffect; written: true } } | { error: TFiretoolError }
> {
  // Check existing data to determine effect
  const existing = await getData(host, port, projectId, path, fetcher)
  if ('error' in existing) return existing

  const effect: SeedEffect =
    existing.data === null
      ? 'created'
      : typeof existing.data === 'object' && existing.data !== null
        ? 'overwritten'
        : 'updated'

  const result = await setData(host, port, projectId, path, data, fetcher)
  if ('error' in result) return result

  return { data: { path, effect, written: true } }
}

export async function exportData(
  host: string,
  port: number,
  projectId: string,
  path: string,
  fetcher: Fetcher = fetch,
): Promise<{ data: { path: string; data: unknown } } | { error: TFiretoolError }> {
  const result = await getData(host, port, projectId, path, fetcher)
  if ('error' in result) return result
  return { data: { path, data: result.data } }
}

export { normalizePath }
