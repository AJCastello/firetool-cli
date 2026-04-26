import { describe, it, expect } from 'bun:test'
import {
  encodeValue,
  decodeValue,
  encodeFields,
  decodeDocument,
  getDocument,
  setDocument,
  updateDocument,
  deleteDocument,
  listDocuments,
  queryCollection,
  deleteCollection,
  clearDatabase,
  seedCollection,
  exportCollection,
} from '../../src/adapters/firestore/index.ts'

// ---------------------------------------------------------------------------
// Fake fetcher helpers
// ---------------------------------------------------------------------------

function okFetcher(body: unknown, status = 200) {
  return async (_url: string, _init?: RequestInit): Promise<Response> => {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

function errorFetcher(message: string, status = 400) {
  return okFetcher({ error: { message } }, status)
}

function networkErrorFetcher() {
  return async (): Promise<Response> => {
    throw new Error('ECONNREFUSED')
  }
}

// ---------------------------------------------------------------------------
// Value encoding / decoding
// ---------------------------------------------------------------------------

describe('encodeValue', () => {
  it('encodes null', () => {
    expect(encodeValue(null)).toEqual({ nullValue: null })
  })

  it('encodes boolean', () => {
    expect(encodeValue(true)).toEqual({ booleanValue: true })
    expect(encodeValue(false)).toEqual({ booleanValue: false })
  })

  it('encodes integer', () => {
    expect(encodeValue(42)).toEqual({ integerValue: '42' })
  })

  it('encodes double', () => {
    expect(encodeValue(3.14)).toEqual({ doubleValue: 3.14 })
  })

  it('encodes string', () => {
    expect(encodeValue('hello')).toEqual({ stringValue: 'hello' })
  })

  it('encodes array', () => {
    const result = encodeValue([1, 'a'])
    expect(result).toEqual({
      arrayValue: { values: [{ integerValue: '1' }, { stringValue: 'a' }] },
    })
  })

  it('encodes nested object', () => {
    const result = encodeValue({ city: 'NYC' })
    expect(result).toEqual({
      mapValue: { fields: { city: { stringValue: 'NYC' } } },
    })
  })
})

describe('decodeValue', () => {
  it('decodes nullValue', () => {
    expect(decodeValue({ nullValue: null })).toBeNull()
  })

  it('decodes booleanValue', () => {
    expect(decodeValue({ booleanValue: true })).toBe(true)
  })

  it('decodes integerValue', () => {
    expect(decodeValue({ integerValue: '42' })).toBe(42)
  })

  it('decodes doubleValue', () => {
    expect(decodeValue({ doubleValue: 3.14 })).toBe(3.14)
  })

  it('decodes stringValue', () => {
    expect(decodeValue({ stringValue: 'hello' })).toBe('hello')
  })

  it('decodes arrayValue', () => {
    const result = decodeValue({ arrayValue: { values: [{ stringValue: 'a' }] } })
    expect(result).toEqual(['a'])
  })

  it('decodes mapValue', () => {
    const result = decodeValue({ mapValue: { fields: { x: { integerValue: '1' } } } })
    expect(result).toEqual({ x: 1 })
  })
})

describe('encodeFields / decodeDocument round-trip', () => {
  it('round-trips a plain document', () => {
    const data = { name: 'Alice', age: 30, active: true, score: 9.5, tags: ['a', 'b'] }
    const fields = encodeFields(data)
    const doc = { name: 'projects/p/databases/(default)/documents/users/uid1', fields }
    const decoded = decodeDocument(doc)
    expect(decoded['name']).toBe('Alice')
    expect(decoded['age']).toBe(30)
    expect(decoded['active']).toBe(true)
    expect(decoded['score']).toBe(9.5)
    expect(decoded['tags']).toEqual(['a', 'b'])
    expect(decoded['_id']).toBe('uid1')
  })
})

// ---------------------------------------------------------------------------
// getDocument
// ---------------------------------------------------------------------------

describe('getDocument', () => {
  it('returns decoded document on success', async () => {
    const doc = {
      name: 'projects/p/databases/(default)/documents/products/abc',
      fields: { name: { stringValue: 'Widget' }, price: { integerValue: '10' } },
    }
    const res = await getDocument('localhost', 8080, 'demo-project', 'products', 'abc', okFetcher(doc))
    expect('data' in res).toBe(true)
    if ('data' in res) {
      expect(res.data['name']).toBe('Widget')
      expect(res.data['price']).toBe(10)
      expect(res.data['_id']).toBe('abc')
    }
  })

  it('returns INVALID_INPUT on HTTP error', async () => {
    const res = await getDocument('localhost', 8080, 'p', 'c', 'doc', errorFetcher('NOT_FOUND', 404))
    expect('error' in res).toBe(true)
    if ('error' in res) expect(res.error.code).toBe('INVALID_INPUT')
  })

  it('returns EMULATOR_NOT_RUNNING on network error', async () => {
    const res = await getDocument('localhost', 8080, 'p', 'c', 'doc', networkErrorFetcher())
    expect('error' in res).toBe(true)
    if ('error' in res) expect(res.error.code).toBe('EMULATOR_NOT_RUNNING')
  })

  it('calls the correct URL', async () => {
    let captured = ''
    const fetcher = async (url: string): Promise<Response> => {
      captured = url
      return new Response(JSON.stringify({ name: 'x', fields: {} }), { status: 200 })
    }
    await getDocument('localhost', 8080, 'my-project', 'products', 'abc123', fetcher)
    expect(captured).toContain('/v1/projects/my-project/databases/(default)/documents/products/abc123')
  })
})

// ---------------------------------------------------------------------------
// setDocument
// ---------------------------------------------------------------------------

describe('setDocument', () => {
  it('returns id and written:1 on success with explicit docId', async () => {
    const doc = { name: 'projects/p/databases/(default)/documents/products/abc', fields: {} }
    const res = await setDocument('localhost', 8080, 'p', 'products', 'abc', { name: 'Widget' }, okFetcher(doc))
    expect('data' in res).toBe(true)
    if ('data' in res) {
      expect(res.data.id).toBe('abc')
      expect(res.data.written).toBe(1)
    }
  })

  it('uses PATCH for named doc, POST for auto-id', async () => {
    const methods: string[] = []
    const fetcher = async (url: string, init?: RequestInit): Promise<Response> => {
      methods.push(init?.method ?? 'GET')
      const segments = url.split('/')
      const id = segments[segments.length - 1]!
      return new Response(JSON.stringify({ name: `x/${id}`, fields: {} }), { status: 200 })
    }
    await setDocument('localhost', 8080, 'p', 'products', 'abc', {}, fetcher)
    await setDocument('localhost', 8080, 'p', 'products', null, {}, fetcher)
    expect(methods[0]).toBe('PATCH')
    expect(methods[1]).toBe('POST')
  })

  it('returns EMULATOR_NOT_RUNNING on network error', async () => {
    const res = await setDocument('localhost', 8080, 'p', 'c', 'doc', {}, networkErrorFetcher())
    expect('error' in res).toBe(true)
    if ('error' in res) expect(res.error.code).toBe('EMULATOR_NOT_RUNNING')
  })
})

// ---------------------------------------------------------------------------
// updateDocument
// ---------------------------------------------------------------------------

describe('updateDocument', () => {
  it('returns decoded document on success', async () => {
    const doc = {
      name: 'projects/p/databases/(default)/documents/products/abc',
      fields: { name: { stringValue: 'Updated' } },
    }
    const res = await updateDocument('localhost', 8080, 'p', 'products', 'abc', { name: 'Updated' }, okFetcher(doc))
    expect('data' in res).toBe(true)
    if ('data' in res) expect(res.data['name']).toBe('Updated')
  })

  it('sends PATCH with updateMask query params', async () => {
    let capturedUrl = ''
    let method = ''
    const fetcher = async (url: string, init?: RequestInit): Promise<Response> => {
      capturedUrl = url
      method = init?.method ?? ''
      return new Response(JSON.stringify({ name: 'x', fields: {} }), { status: 200 })
    }
    await updateDocument('localhost', 8080, 'p', 'products', 'abc', { price: 5 }, fetcher)
    expect(method).toBe('PATCH')
    expect(capturedUrl).toContain('updateMask.fieldPaths=price')
  })

  it('returns EMULATOR_NOT_RUNNING on network error', async () => {
    const res = await updateDocument('localhost', 8080, 'p', 'c', 'doc', {}, networkErrorFetcher())
    if ('error' in res) expect(res.error.code).toBe('EMULATOR_NOT_RUNNING')
  })
})

// ---------------------------------------------------------------------------
// deleteDocument
// ---------------------------------------------------------------------------

describe('deleteDocument', () => {
  it('returns id and deleted:1 on success', async () => {
    const res = await deleteDocument('localhost', 8080, 'p', 'products', 'abc', okFetcher({}))
    expect('data' in res).toBe(true)
    if ('data' in res) {
      expect(res.data.id).toBe('abc')
      expect(res.data.deleted).toBe(1)
    }
  })

  it('sends DELETE to the correct URL', async () => {
    let method = ''
    let url = ''
    const fetcher = async (u: string, init?: RequestInit): Promise<Response> => {
      method = init?.method ?? ''
      url = u
      return new Response(JSON.stringify({}), { status: 200 })
    }
    await deleteDocument('localhost', 8080, 'p', 'products', 'abc', fetcher)
    expect(method).toBe('DELETE')
    expect(url).toContain('/products/abc')
  })

  it('returns EMULATOR_NOT_RUNNING on network error', async () => {
    const res = await deleteDocument('localhost', 8080, 'p', 'c', 'doc', networkErrorFetcher())
    if ('error' in res) expect(res.error.code).toBe('EMULATOR_NOT_RUNNING')
  })
})

// ---------------------------------------------------------------------------
// listDocuments
// ---------------------------------------------------------------------------

describe('listDocuments', () => {
  it('returns empty array when no documents', async () => {
    const res = await listDocuments('localhost', 8080, 'p', 'products', okFetcher({}))
    expect('data' in res).toBe(true)
    if ('data' in res) expect(res.data).toEqual([])
  })

  it('returns decoded documents', async () => {
    const docs = {
      documents: [
        {
          name: 'projects/p/databases/(default)/documents/products/a',
          fields: { name: { stringValue: 'Widget A' } },
        },
        {
          name: 'projects/p/databases/(default)/documents/products/b',
          fields: { name: { stringValue: 'Widget B' } },
        },
      ],
    }
    const res = await listDocuments('localhost', 8080, 'p', 'products', okFetcher(docs))
    expect('data' in res).toBe(true)
    if ('data' in res) {
      expect(res.data).toHaveLength(2)
      expect(res.data[0]!['name']).toBe('Widget A')
      expect(res.data[0]!['_id']).toBe('a')
    }
  })

  it('returns EMULATOR_NOT_RUNNING on network error', async () => {
    const res = await listDocuments('localhost', 8080, 'p', 'products', networkErrorFetcher())
    if ('error' in res) expect(res.error.code).toBe('EMULATOR_NOT_RUNNING')
  })
})

// ---------------------------------------------------------------------------
// queryCollection
// ---------------------------------------------------------------------------

describe('queryCollection', () => {
  it('returns decoded documents from runQuery response', async () => {
    const queryResponse = [
      {
        document: {
          name: 'projects/p/databases/(default)/documents/products/a',
          fields: { price: { integerValue: '10' } },
        },
      },
    ]
    const res = await queryCollection('localhost', 8080, 'p', 'products', [], okFetcher(queryResponse))
    expect('data' in res).toBe(true)
    if ('data' in res) {
      expect(res.data).toHaveLength(1)
      expect(res.data[0]!['price']).toBe(10)
    }
  })

  it('filters out entries without a document field', async () => {
    const queryResponse = [{ readTime: '2024-01-01' }]
    const res = await queryCollection('localhost', 8080, 'p', 'products', [], okFetcher(queryResponse))
    expect('data' in res).toBe(true)
    if ('data' in res) expect(res.data).toHaveLength(0)
  })

  it('sends POST to :runQuery', async () => {
    let url = ''
    let method = ''
    const fetcher = async (u: string, init?: RequestInit): Promise<Response> => {
      url = u
      method = init?.method ?? ''
      return new Response(JSON.stringify([]), { status: 200 })
    }
    await queryCollection('localhost', 8080, 'p', 'products', [], fetcher)
    expect(method).toBe('POST')
    expect(url).toContain(':runQuery')
  })

  it('returns EMULATOR_NOT_RUNNING on network error', async () => {
    const res = await queryCollection('localhost', 8080, 'p', 'products', [], networkErrorFetcher())
    if ('error' in res) expect(res.error.code).toBe('EMULATOR_NOT_RUNNING')
  })
})

// ---------------------------------------------------------------------------
// deleteCollection
// ---------------------------------------------------------------------------

describe('deleteCollection', () => {
  it('returns deleted count equal to number of documents', async () => {
    const docs = {
      documents: [
        { name: 'projects/p/databases/(default)/documents/products/a', fields: {} },
        { name: 'projects/p/databases/(default)/documents/products/b', fields: {} },
      ],
    }
    // listDocuments → GET, then two deleteDocument → DELETE
    let callCount = 0
    const fetcher = async (_url: string, init?: RequestInit): Promise<Response> => {
      callCount++
      if (callCount === 1) return new Response(JSON.stringify(docs), { status: 200 })
      return new Response(JSON.stringify({}), { status: 200 })
    }
    const res = await deleteCollection('localhost', 8080, 'p', 'products', fetcher)
    expect('data' in res).toBe(true)
    if ('data' in res) {
      expect(res.data.collection).toBe('products')
      expect(res.data.deleted).toBe(2)
    }
  })

  it('returns 0 deleted when collection is empty', async () => {
    const res = await deleteCollection('localhost', 8080, 'p', 'products', okFetcher({}))
    expect('data' in res).toBe(true)
    if ('data' in res) expect(res.data.deleted).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// clearDatabase
// ---------------------------------------------------------------------------

describe('clearDatabase', () => {
  it('returns cleared:true on success', async () => {
    const res = await clearDatabase('localhost', 8080, 'p', okFetcher({}))
    expect('data' in res).toBe(true)
    if ('data' in res) expect(res.data.cleared).toBe(true)
  })

  it('sends DELETE to the emulator management endpoint', async () => {
    let method = ''
    let url = ''
    const fetcher = async (u: string, init?: RequestInit): Promise<Response> => {
      method = init?.method ?? ''
      url = u
      return new Response(JSON.stringify({}), { status: 200 })
    }
    await clearDatabase('localhost', 8080, 'p', fetcher)
    expect(method).toBe('DELETE')
    expect(url).toContain('/emulator/v1/projects/p/databases/(default)/documents')
  })

  it('returns EMULATOR_NOT_RUNNING on network error', async () => {
    const res = await clearDatabase('localhost', 8080, 'p', networkErrorFetcher())
    if ('error' in res) expect(res.error.code).toBe('EMULATOR_NOT_RUNNING')
  })
})

// ---------------------------------------------------------------------------
// seedCollection
// ---------------------------------------------------------------------------

describe('seedCollection', () => {
  it('writes each document and returns total written count', async () => {
    const docs = [
      { _id: 'a', name: 'A' },
      { _id: 'b', name: 'B' },
      { name: 'C' }, // no _id → auto-id via POST
    ]
    let callCount = 0
    const fetcher = async (_url: string, _init?: RequestInit): Promise<Response> => {
      callCount++
      return new Response(
        JSON.stringify({ name: `x/doc${callCount}`, fields: {} }),
        { status: 200 },
      )
    }
    const res = await seedCollection('localhost', 8080, 'p', 'products', docs, fetcher)
    expect('data' in res).toBe(true)
    if ('data' in res) {
      expect(res.data.collection).toBe('products')
      expect(res.data.written).toBe(3)
    }
  })

  it('returns EMULATOR_NOT_RUNNING when any write fails with network error', async () => {
    const docs = [{ name: 'A' }]
    const res = await seedCollection('localhost', 8080, 'p', 'products', docs, networkErrorFetcher())
    expect('error' in res).toBe(true)
    if ('error' in res) expect(res.error.code).toBe('EMULATOR_NOT_RUNNING')
  })
})

// ---------------------------------------------------------------------------
// exportCollection
// ---------------------------------------------------------------------------

describe('exportCollection', () => {
  it('returns the collection name and documents', async () => {
    const docs = {
      documents: [
        {
          name: 'projects/p/databases/(default)/documents/products/a',
          fields: { sku: { stringValue: 'SKU-1' } },
        },
      ],
    }
    const res = await exportCollection('localhost', 8080, 'p', 'products', okFetcher(docs))
    expect('data' in res).toBe(true)
    if ('data' in res) {
      expect(res.data.collection).toBe('products')
      expect(res.data.documents).toHaveLength(1)
      expect(res.data.documents[0]!['sku']).toBe('SKU-1')
    }
  })

  it('returns EMULATOR_NOT_RUNNING on network error', async () => {
    const res = await exportCollection('localhost', 8080, 'p', 'products', networkErrorFetcher())
    if ('error' in res) expect(res.error.code).toBe('EMULATOR_NOT_RUNNING')
  })
})
