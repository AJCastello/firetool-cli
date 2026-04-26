import type { TFiretoolError } from '../../shared/types.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StorageObject = {
  name: string
  bucket: string
  size: string
  contentType?: string
  timeCreated?: string
  updated?: string
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

function storageBase(host: string, port: number): string {
  return `http://${host}:${port}`
}

/** Encode an object path for use in a URL segment (encode all except '/'). */
function encodeObjectPath(objectPath: string): string {
  return objectPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('%2F')
}

function normalizeObjectPath(objectPath: string): string {
  return objectPath.replace(/^\/+/, '')
}

// ---------------------------------------------------------------------------
// List objects
// ---------------------------------------------------------------------------

type ListResponse = {
  kind?: string
  items?: StorageObject[]
  nextPageToken?: string
}

export async function listObjects(
  host: string,
  port: number,
  bucket: string,
  prefix?: string,
  fetcher: Fetcher = fetch,
): Promise<{ data: { bucket: string; objects: StorageObject[]; count: number } } | { error: TFiretoolError }> {
  const base = storageBase(host, port)
  const params = new URLSearchParams()
  if (prefix) params.set('prefix', prefix)

  const url = `${base}/v0/b/${encodeURIComponent(bucket)}/o${params.size > 0 ? `?${params}` : ''}`

  try {
    const res = await fetcher(url, { method: 'GET' })

    if (res.status === 401 || res.status === 403) {
      return {
        error: {
          code: 'RULE_DENIED',
          message: `Storage Emulator denied the list operation on bucket "${bucket}".`,
          hint: 'Check your storage.rules or use a service account that bypasses rules.',
        },
      }
    }

    if (!res.ok) {
      const body = await safeJson(res)
      const errMsg = extractErrorMessage(body, res.status)
      return {
        error: {
          code: 'INVALID_INPUT',
          message: `Storage Emulator returned an error: ${errMsg}`,
          hint: 'Check the bucket name and prefix.',
        },
      }
    }

    const body = (await res.json()) as ListResponse
    const objects = body.items ?? []
    return { data: { bucket, objects, count: objects.length } }
  } catch (err) {
    return connectionError(err)
  }
}

// ---------------------------------------------------------------------------
// Upload object
// ---------------------------------------------------------------------------

export async function uploadObject(
  host: string,
  port: number,
  bucket: string,
  objectPath: string,
  content: Uint8Array,
  contentType = 'application/octet-stream',
  fetcher: Fetcher = fetch,
): Promise<{ data: { bucket: string; name: string; size: number; uploaded: true } } | { error: TFiretoolError }> {
  const base = storageBase(host, port)
  const normalized = normalizeObjectPath(objectPath)
  const params = new URLSearchParams({ uploadType: 'media', name: normalized })
  const url = `${base}/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?${params}`

  try {
    const res = await fetcher(url, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body: content,
    })

    if (res.status === 401 || res.status === 403) {
      return {
        error: {
          code: 'RULE_DENIED',
          message: `Storage Emulator denied the upload to "${normalized}" in bucket "${bucket}".`,
          hint: 'Check your storage.rules or use a service account that bypasses rules.',
        },
      }
    }

    if (!res.ok) {
      const body = await safeJson(res)
      const errMsg = extractErrorMessage(body, res.status)
      return {
        error: {
          code: 'INVALID_INPUT',
          message: `Storage Emulator returned an error uploading "${normalized}": ${errMsg}`,
          hint: 'Check the object path and bucket name.',
        },
      }
    }

    return { data: { bucket, name: normalized, size: content.length, uploaded: true } }
  } catch (err) {
    return connectionError(err)
  }
}

// ---------------------------------------------------------------------------
// Download object
// ---------------------------------------------------------------------------

export async function downloadObject(
  host: string,
  port: number,
  bucket: string,
  objectPath: string,
  fetcher: Fetcher = fetch,
): Promise<{ data: { bucket: string; name: string; content: Uint8Array; size: number } } | { error: TFiretoolError }> {
  const base = storageBase(host, port)
  const normalized = normalizeObjectPath(objectPath)
  const encoded = encodeObjectPath(normalized)
  const url = `${base}/v0/b/${encodeURIComponent(bucket)}/o/${encoded}?alt=media`

  try {
    const res = await fetcher(url, { method: 'GET' })

    if (res.status === 401 || res.status === 403) {
      return {
        error: {
          code: 'RULE_DENIED',
          message: `Storage Emulator denied the download of "${normalized}" from bucket "${bucket}".`,
          hint: 'Check your storage.rules or use a service account that bypasses rules.',
        },
      }
    }

    if (res.status === 404) {
      return {
        error: {
          code: 'INVALID_INPUT',
          message: `Object "${normalized}" not found in bucket "${bucket}".`,
          hint: 'Check the object path and verify it exists with "storage list".',
        },
      }
    }

    if (!res.ok) {
      const body = await safeJson(res)
      const errMsg = extractErrorMessage(body, res.status)
      return {
        error: {
          code: 'INVALID_INPUT',
          message: `Storage Emulator returned an error downloading "${normalized}": ${errMsg}`,
          hint: 'Check the object path and bucket name.',
        },
      }
    }

    const arrayBuffer = await res.arrayBuffer()
    const content = new Uint8Array(arrayBuffer)
    return { data: { bucket, name: normalized, content, size: content.length } }
  } catch (err) {
    return connectionError(err)
  }
}

// ---------------------------------------------------------------------------
// Remove object
// ---------------------------------------------------------------------------

export async function removeObject(
  host: string,
  port: number,
  bucket: string,
  objectPath: string,
  fetcher: Fetcher = fetch,
): Promise<{ data: { bucket: string; name: string; removed: true } } | { error: TFiretoolError }> {
  const base = storageBase(host, port)
  const normalized = normalizeObjectPath(objectPath)
  const encoded = encodeObjectPath(normalized)
  const url = `${base}/v0/b/${encodeURIComponent(bucket)}/o/${encoded}`

  try {
    const res = await fetcher(url, { method: 'DELETE' })

    if (res.status === 401 || res.status === 403) {
      return {
        error: {
          code: 'RULE_DENIED',
          message: `Storage Emulator denied the removal of "${normalized}" from bucket "${bucket}".`,
          hint: 'Check your storage.rules or use a service account that bypasses rules.',
        },
      }
    }

    if (res.status === 404) {
      return {
        error: {
          code: 'INVALID_INPUT',
          message: `Object "${normalized}" not found in bucket "${bucket}".`,
          hint: 'Check the object path and verify it exists with "storage list".',
        },
      }
    }

    if (!res.ok) {
      const body = await safeJson(res)
      const errMsg = extractErrorMessage(body, res.status)
      return {
        error: {
          code: 'INVALID_INPUT',
          message: `Storage Emulator returned an error removing "${normalized}": ${errMsg}`,
          hint: 'Check the object path and bucket name.',
        },
      }
    }

    return { data: { bucket, name: normalized, removed: true } }
  } catch (err) {
    return connectionError(err)
  }
}

// ---------------------------------------------------------------------------
// Clear bucket (list + delete all)
// ---------------------------------------------------------------------------

export async function clearBucket(
  host: string,
  port: number,
  bucket: string,
  fetcher: Fetcher = fetch,
): Promise<
  { data: { bucket: string; removed: string[]; count: number; cleared: true } } | { error: TFiretoolError }
> {
  const listResult = await listObjects(host, port, bucket, undefined, fetcher)
  if ('error' in listResult) return listResult

  const objects = listResult.data.objects
  const removed: string[] = []

  for (const obj of objects) {
    const result = await removeObject(host, port, bucket, obj.name, fetcher)
    if ('error' in result) return result
    removed.push(obj.name)
  }

  return { data: { bucket, removed, count: removed.length, cleared: true } }
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
  if (body !== null && typeof body === 'object' && 'error' in body) {
    const err = (body as Record<string, unknown>)['error']
    if (typeof err === 'string') return err
    if (typeof err === 'object' && err !== null && 'message' in err) {
      return String((err as Record<string, unknown>)['message'])
    }
  }
  return `HTTP ${status}`
}

function connectionError(err: unknown): { error: TFiretoolError } {
  return {
    error: {
      code: 'EMULATOR_NOT_RUNNING',
      message: `Could not connect to Storage Emulator: ${err instanceof Error ? err.message : String(err)}`,
      hint: 'Ensure the Storage Emulator is running locally and retry.',
    },
  }
}

export { normalizeObjectPath, encodeObjectPath }
