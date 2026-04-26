import type { TFiretoolError } from '../../shared/types.ts'

// ---------------------------------------------------------------------------
// Firestore REST value encoding / decoding
// ---------------------------------------------------------------------------

type FirestoreValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { bytesValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } }

type FirestoreDocument = {
  name?: string
  fields?: Record<string, FirestoreValue>
  createTime?: string
  updateTime?: string
}

/** Convert a plain JS value to a Firestore REST typed value. */
export function encodeValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value }
  }
  if (typeof value === 'string') return { stringValue: value }
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map(encodeValue),
      },
    }
  }
  if (typeof value === 'object') {
    const fields: Record<string, FirestoreValue> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      fields[k] = encodeValue(v)
    }
    return { mapValue: { fields } }
  }
  return { stringValue: String(value) }
}

/** Convert a Firestore REST typed value back to a plain JS value. */
export function decodeValue(v: FirestoreValue): unknown {
  if ('nullValue' in v) return null
  if ('booleanValue' in v) return v.booleanValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return v.doubleValue
  if ('stringValue' in v) return v.stringValue
  if ('bytesValue' in v) return v.bytesValue
  if ('arrayValue' in v) {
    return (v.arrayValue.values ?? []).map(decodeValue)
  }
  if ('mapValue' in v) {
    const out: Record<string, unknown> = {}
    for (const [k, fv] of Object.entries(v.mapValue.fields ?? {})) {
      out[k] = decodeValue(fv)
    }
    return out
  }
  return null
}

/** Encode a plain JS object's fields into Firestore typed fields. */
export function encodeFields(data: Record<string, unknown>): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {}
  for (const [k, v] of Object.entries(data)) {
    fields[k] = encodeValue(v)
  }
  return fields
}

/** Decode a Firestore document's fields to a plain JS object, preserving `_id`. */
export function decodeDocument(doc: FirestoreDocument): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(doc.fields ?? {})) {
    out[k] = decodeValue(v)
  }
  if (doc.name) {
    // Extract doc ID from the resource name (last path segment)
    const parts = doc.name.split('/')
    out['_id'] = parts[parts.length - 1]
  }
  return out
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

function firestoreHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json' }
}

async function callFirestore<T>(
  url: string,
  init: RequestInit,
  fetcher: Fetcher,
): Promise<{ data: T } | { error: TFiretoolError }> {
  try {
    const res = await fetcher(url, {
      ...init,
      headers: { ...firestoreHeaders(), ...(init.headers ?? {}) },
    })

    let body: unknown
    try {
      body = await res.json()
    } catch {
      body = {}
    }

    if (!res.ok) {
      const errBody = body as { error?: { message?: string; status?: string } }
      return {
        error: {
          code: 'INVALID_INPUT',
          message:
            errBody.error?.message ??
            `Firestore Emulator returned HTTP ${res.status}.`,
          hint: 'Check the provided collection path, document ID, and data.',
        },
      }
    }

    return { data: body as T }
  } catch (err) {
    return {
      error: {
        code: 'EMULATOR_NOT_RUNNING',
        message: `Could not connect to Firestore Emulator: ${err instanceof Error ? err.message : String(err)}`,
        hint: 'Ensure the Firestore Emulator is running locally and retry.',
      },
    }
  }
}

/** REST API base path for Firestore documents. */
function docsBase(host: string, port: number, projectId: string): string {
  return `http://${host}:${port}/v1/projects/${projectId}/databases/(default)/documents`
}

// ---------------------------------------------------------------------------
// Document operations
// ---------------------------------------------------------------------------

export async function getDocument(
  host: string,
  port: number,
  projectId: string,
  collectionPath: string,
  docId: string,
  fetcher: Fetcher = fetch,
): Promise<{ data: Record<string, unknown> } | { error: TFiretoolError }> {
  const url = `${docsBase(host, port, projectId)}/${collectionPath}/${docId}`
  const result = await callFirestore<FirestoreDocument>(url, { method: 'GET' }, fetcher)
  if ('error' in result) return result
  return { data: decodeDocument(result.data) }
}

export async function setDocument(
  host: string,
  port: number,
  projectId: string,
  collectionPath: string,
  docId: string | null,
  data: Record<string, unknown>,
  fetcher: Fetcher = fetch,
): Promise<{ data: { id: string; written: 1 } } | { error: TFiretoolError }> {
  const base = docsBase(host, port, projectId)
  let result: { data: FirestoreDocument } | { error: TFiretoolError }

  if (docId) {
    // PATCH creates or overwrites the document at a specific ID
    const url = `${base}/${collectionPath}/${docId}`
    result = await callFirestore<FirestoreDocument>(
      url,
      { method: 'PATCH', body: JSON.stringify({ fields: encodeFields(data) }) },
      fetcher,
    )
  } else {
    // POST auto-generates an ID
    const url = `${base}/${collectionPath}`
    result = await callFirestore<FirestoreDocument>(
      url,
      { method: 'POST', body: JSON.stringify({ fields: encodeFields(data) }) },
      fetcher,
    )
  }

  if ('error' in result) return result

  const parts = (result.data.name ?? '').split('/')
  const id = parts[parts.length - 1] ?? docId ?? ''
  return { data: { id, written: 1 } }
}

export async function updateDocument(
  host: string,
  port: number,
  projectId: string,
  collectionPath: string,
  docId: string,
  data: Record<string, unknown>,
  fetcher: Fetcher = fetch,
): Promise<{ data: Record<string, unknown> } | { error: TFiretoolError }> {
  const fieldPaths = Object.keys(data)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join('&')
  const url = `${docsBase(host, port, projectId)}/${collectionPath}/${docId}?${fieldPaths}`
  const result = await callFirestore<FirestoreDocument>(
    url,
    { method: 'PATCH', body: JSON.stringify({ fields: encodeFields(data) }) },
    fetcher,
  )
  if ('error' in result) return result
  return { data: decodeDocument(result.data) }
}

export async function deleteDocument(
  host: string,
  port: number,
  projectId: string,
  collectionPath: string,
  docId: string,
  fetcher: Fetcher = fetch,
): Promise<{ data: { id: string; deleted: 1 } } | { error: TFiretoolError }> {
  const url = `${docsBase(host, port, projectId)}/${collectionPath}/${docId}`
  const result = await callFirestore<Record<string, never>>(url, { method: 'DELETE' }, fetcher)
  if ('error' in result) return result
  return { data: { id: docId, deleted: 1 } }
}

// ---------------------------------------------------------------------------
// Collection operations
// ---------------------------------------------------------------------------

export async function listDocuments(
  host: string,
  port: number,
  projectId: string,
  collectionPath: string,
  fetcher: Fetcher = fetch,
): Promise<{ data: Record<string, unknown>[] } | { error: TFiretoolError }> {
  const url = `${docsBase(host, port, projectId)}/${collectionPath}`
  const result = await callFirestore<{ documents?: FirestoreDocument[] }>(
    url,
    { method: 'GET' },
    fetcher,
  )
  if ('error' in result) return result
  return { data: (result.data.documents ?? []).map(decodeDocument) }
}

export type QueryFilter = {
  field: string
  op: 'EQUAL' | 'LESS_THAN' | 'LESS_THAN_OR_EQUAL' | 'GREATER_THAN' | 'GREATER_THAN_OR_EQUAL' | 'ARRAY_CONTAINS'
  value: unknown
}

export async function queryCollection(
  host: string,
  port: number,
  projectId: string,
  collectionPath: string,
  filters: QueryFilter[] = [],
  fetcher: Fetcher = fetch,
): Promise<{ data: Record<string, unknown>[] } | { error: TFiretoolError }> {
  const base = docsBase(host, port, projectId)

  // Split collectionPath into parent + collectionId
  const segments = collectionPath.split('/')
  const collectionId = segments[segments.length - 1]!
  const parentSuffix = segments.slice(0, -1).join('/')
  const parentUrl = parentSuffix ? `${base}/${parentSuffix}` : base

  const structuredQuery: Record<string, unknown> = {
    from: [{ collectionId }],
  }

  if (filters.length > 0) {
    const fieldFilters = filters.map((f) => ({
      fieldFilter: {
        field: { fieldPath: f.field },
        op: f.op,
        value: encodeValue(f.value),
      },
    }))
    structuredQuery['where'] =
      fieldFilters.length === 1
        ? fieldFilters[0]
        : {
            compositeFilter: {
              op: 'AND',
              filters: fieldFilters,
            },
          }
  }

  const url = `${parentUrl}:runQuery`
  const result = await callFirestore<Array<{ document?: FirestoreDocument }>>(
    url,
    { method: 'POST', body: JSON.stringify({ structuredQuery }) },
    fetcher,
  )
  if ('error' in result) return result

  const docs = (Array.isArray(result.data) ? result.data : [])
    .filter((r) => r.document)
    .map((r) => decodeDocument(r.document!))

  return { data: docs }
}

export async function deleteCollection(
  host: string,
  port: number,
  projectId: string,
  collectionPath: string,
  fetcher: Fetcher = fetch,
): Promise<{ data: { collection: string; deleted: number } } | { error: TFiretoolError }> {
  // List all docs and delete them
  const listResult = await listDocuments(host, port, projectId, collectionPath, fetcher)
  if ('error' in listResult) return listResult

  const docs = listResult.data
  let deleted = 0
  for (const doc of docs) {
    const id = doc['_id'] as string | undefined
    if (!id) continue
    const delResult = await deleteDocument(host, port, projectId, collectionPath, id, fetcher)
    if ('error' in delResult) return delResult
    deleted++
  }

  return { data: { collection: collectionPath, deleted } }
}

export async function clearDatabase(
  host: string,
  port: number,
  projectId: string,
  fetcher: Fetcher = fetch,
): Promise<{ data: { cleared: true } } | { error: TFiretoolError }> {
  const url = `http://${host}:${port}/emulator/v1/projects/${projectId}/databases/(default)/documents`
  const result = await callFirestore<Record<string, never>>(url, { method: 'DELETE' }, fetcher)
  if ('error' in result) return result
  return { data: { cleared: true } }
}

// ---------------------------------------------------------------------------
// Seed / Import / Export
// ---------------------------------------------------------------------------

export type SeedDoc = {
  _id?: string
  [key: string]: unknown
}

export async function seedCollection(
  host: string,
  port: number,
  projectId: string,
  collectionPath: string,
  docs: SeedDoc[],
  fetcher: Fetcher = fetch,
): Promise<{ data: { collection: string; written: number } } | { error: TFiretoolError }> {
  let written = 0
  for (const doc of docs) {
    const { _id, ...fields } = doc
    const result = await setDocument(
      host,
      port,
      projectId,
      collectionPath,
      _id ?? null,
      fields,
      fetcher,
    )
    if ('error' in result) return result
    written++
  }
  return { data: { collection: collectionPath, written } }
}

export async function exportCollection(
  host: string,
  port: number,
  projectId: string,
  collectionPath: string,
  fetcher: Fetcher = fetch,
): Promise<{ data: { collection: string; documents: Record<string, unknown>[] } } | { error: TFiretoolError }> {
  const result = await listDocuments(host, port, projectId, collectionPath, fetcher)
  if ('error' in result) return result
  return { data: { collection: collectionPath, documents: result.data } }
}
