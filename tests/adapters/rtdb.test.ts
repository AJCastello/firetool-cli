import { describe, it, expect } from 'bun:test'
import {
  getData,
  setData,
  updateData,
  pushData,
  deleteData,
  queryData,
  seedData,
  exportData,
  normalizePath,
} from '../../src/adapters/rtdb/index.ts'

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

function errorFetcher(errorMsg: string, status = 400) {
  return okFetcher({ error: errorMsg }, status)
}

function ruleDeniedFetcher() {
  return okFetcher({ error: 'Permission denied' }, 401)
}

function networkErrorFetcher() {
  return async (): Promise<Response> => {
    throw new Error('ECONNREFUSED')
  }
}

// Fetcher that returns different responses per call index
function sequentialFetcher(responses: Array<{ body: unknown; status?: number }>) {
  let idx = 0
  return async (_url: string, _init?: RequestInit): Promise<Response> => {
    const entry = responses[idx++] ?? { body: null, status: 200 }
    return new Response(JSON.stringify(entry.body), {
      status: entry.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// ---------------------------------------------------------------------------
// normalizePath
// ---------------------------------------------------------------------------

describe('normalizePath', () => {
  it('adds leading slash', () => {
    expect(normalizePath('users/alice')).toBe('/users/alice')
  })

  it('removes trailing slash', () => {
    expect(normalizePath('/users/alice/')).toBe('/users/alice')
  })

  it('handles root', () => {
    expect(normalizePath('/')).toBe('/')
    expect(normalizePath('')).toBe('/')
  })

  it('handles nested paths', () => {
    expect(normalizePath('a/b/c')).toBe('/a/b/c')
  })
})

// ---------------------------------------------------------------------------
// getData
// ---------------------------------------------------------------------------

describe('getData', () => {
  it('returns data on success', async () => {
    const res = await getData('localhost', 9000, 'demo', '/users', okFetcher({ alice: { age: 30 } }))
    expect('data' in res).toBe(true)
    if ('data' in res) {
      expect(res.data).toEqual({ alice: { age: 30 } })
    }
  })

  it('returns null data when path is absent', async () => {
    const res = await getData('localhost', 9000, 'demo', '/missing', okFetcher(null))
    expect('data' in res).toBe(true)
    if ('data' in res) expect(res.data).toBeNull()
  })

  it('returns RULE_DENIED on 401', async () => {
    const res = await getData('localhost', 9000, 'demo', '/secret', ruleDeniedFetcher())
    expect('error' in res).toBe(true)
    if ('error' in res) expect(res.error.code).toBe('RULE_DENIED')
  })

  it('returns RULE_DENIED on 403', async () => {
    const res = await getData('localhost', 9000, 'demo', '/secret', okFetcher({ error: 'Forbidden' }, 403))
    expect('error' in res).toBe(true)
    if ('error' in res) expect(res.error.code).toBe('RULE_DENIED')
  })

  it('returns EMULATOR_NOT_RUNNING on network error', async () => {
    const res = await getData('localhost', 9000, 'demo', '/path', networkErrorFetcher())
    expect('error' in res).toBe(true)
    if ('error' in res) expect(res.error.code).toBe('EMULATOR_NOT_RUNNING')
  })

  it('calls the correct URL with ns param', async () => {
    let captured = ''
    const fetcher = async (url: string): Promise<Response> => {
      captured = url
      return new Response(JSON.stringify(null), { status: 200 })
    }
    await getData('localhost', 9000, 'my-project', '/users/alice', fetcher)
    expect(captured).toContain('/users/alice.json')
    expect(captured).toContain('ns=my-project')
  })
})

// ---------------------------------------------------------------------------
// setData
// ---------------------------------------------------------------------------

describe('setData', () => {
  it('returns written data on success', async () => {
    const payload = { name: 'Alice', age: 30 }
    const res = await setData('localhost', 9000, 'demo', '/users/alice', payload, okFetcher(payload))
    expect('data' in res).toBe(true)
  })

  it('sends PUT request', async () => {
    let method = ''
    const fetcher = async (_url: string, init?: RequestInit): Promise<Response> => {
      method = init?.method ?? ''
      return new Response(JSON.stringify({}), { status: 200 })
    }
    await setData('localhost', 9000, 'demo', '/path', { key: 'val' }, fetcher)
    expect(method).toBe('PUT')
  })

  it('returns EMULATOR_NOT_RUNNING on network error', async () => {
    const res = await setData('localhost', 9000, 'demo', '/path', {}, networkErrorFetcher())
    expect('error' in res).toBe(true)
    if ('error' in res) expect(res.error.code).toBe('EMULATOR_NOT_RUNNING')
  })

  it('returns INVALID_INPUT on HTTP 400', async () => {
    const res = await setData('localhost', 9000, 'demo', '/path', {}, errorFetcher('Bad request'))
    expect('error' in res).toBe(true)
    if ('error' in res) expect(res.error.code).toBe('INVALID_INPUT')
  })
})

// ---------------------------------------------------------------------------
// updateData
// ---------------------------------------------------------------------------

describe('updateData', () => {
  it('sends PATCH request', async () => {
    let method = ''
    const fetcher = async (_url: string, init?: RequestInit): Promise<Response> => {
      method = init?.method ?? ''
      return new Response(JSON.stringify({ name: 'Updated' }), { status: 200 })
    }
    await updateData('localhost', 9000, 'demo', '/users/alice', { name: 'Updated' }, fetcher)
    expect(method).toBe('PATCH')
  })

  it('returns updated data on success', async () => {
    const res = await updateData(
      'localhost',
      9000,
      'demo',
      '/users/alice',
      { active: true },
      okFetcher({ name: 'Alice', active: true }),
    )
    expect('data' in res).toBe(true)
    if ('data' in res) expect(res.data).toEqual({ name: 'Alice', active: true })
  })

  it('returns EMULATOR_NOT_RUNNING on network error', async () => {
    const res = await updateData('localhost', 9000, 'demo', '/p', {}, networkErrorFetcher())
    if ('error' in res) expect(res.error.code).toBe('EMULATOR_NOT_RUNNING')
  })
})

// ---------------------------------------------------------------------------
// pushData
// ---------------------------------------------------------------------------

describe('pushData', () => {
  it('sends POST request and returns generated key', async () => {
    let method = ''
    const fetcher = async (_url: string, init?: RequestInit): Promise<Response> => {
      method = init?.method ?? ''
      return new Response(JSON.stringify({ name: '-NxAutoKey123' }), { status: 200 })
    }
    const res = await pushData('localhost', 9000, 'demo', '/messages', { text: 'hello' }, fetcher)
    expect(method).toBe('POST')
    expect('data' in res).toBe(true)
    if ('data' in res) expect(res.data.name).toBe('-NxAutoKey123')
  })

  it('returns EMULATOR_NOT_RUNNING on network error', async () => {
    const res = await pushData('localhost', 9000, 'demo', '/messages', {}, networkErrorFetcher())
    if ('error' in res) expect(res.error.code).toBe('EMULATOR_NOT_RUNNING')
  })
})

// ---------------------------------------------------------------------------
// deleteData
// ---------------------------------------------------------------------------

describe('deleteData', () => {
  it('sends DELETE request and returns deleted:true', async () => {
    let method = ''
    const fetcher = async (_url: string, init?: RequestInit): Promise<Response> => {
      method = init?.method ?? ''
      return new Response(JSON.stringify(null), { status: 200 })
    }
    const res = await deleteData('localhost', 9000, 'demo', '/users/alice', fetcher)
    expect(method).toBe('DELETE')
    expect('data' in res).toBe(true)
    if ('data' in res) {
      expect(res.data.deleted).toBe(true)
      expect(res.data.path).toBe('/users/alice')
    }
  })

  it('returns RULE_DENIED on 401', async () => {
    const res = await deleteData('localhost', 9000, 'demo', '/path', ruleDeniedFetcher())
    if ('error' in res) expect(res.error.code).toBe('RULE_DENIED')
  })

  it('returns EMULATOR_NOT_RUNNING on network error', async () => {
    const res = await deleteData('localhost', 9000, 'demo', '/path', networkErrorFetcher())
    if ('error' in res) expect(res.error.code).toBe('EMULATOR_NOT_RUNNING')
  })
})

// ---------------------------------------------------------------------------
// queryData
// ---------------------------------------------------------------------------

describe('queryData', () => {
  it('sends GET request with query params', async () => {
    let capturedUrl = ''
    const fetcher = async (url: string): Promise<Response> => {
      capturedUrl = url
      return new Response(JSON.stringify({ alice: { age: 30 } }), { status: 200 })
    }
    await queryData('localhost', 9000, 'demo', '/users', { orderBy: 'age', equalTo: 30 }, fetcher)
    expect(capturedUrl).toContain('orderBy=%22age%22')
    expect(capturedUrl).toContain('equalTo=30')
  })

  it('includes limitToFirst param', async () => {
    let capturedUrl = ''
    const fetcher = async (url: string): Promise<Response> => {
      capturedUrl = url
      return new Response(JSON.stringify({}), { status: 200 })
    }
    await queryData('localhost', 9000, 'demo', '/items', { limitToFirst: 5 }, fetcher)
    expect(capturedUrl).toContain('limitToFirst=5')
  })

  it('returns EMULATOR_NOT_RUNNING on network error', async () => {
    const res = await queryData('localhost', 9000, 'demo', '/path', {}, networkErrorFetcher())
    if ('error' in res) expect(res.error.code).toBe('EMULATOR_NOT_RUNNING')
  })
})

// ---------------------------------------------------------------------------
// seedData
// ---------------------------------------------------------------------------

describe('seedData', () => {
  it('reports "created" when path is absent (null)', async () => {
    // First GET → null, then PUT → success
    const fetcher = sequentialFetcher([
      { body: null },
      { body: { users: { alice: { age: 30 } } } },
    ])
    const res = await seedData(
      'localhost',
      9000,
      'demo',
      '/users',
      { alice: { age: 30 } },
      fetcher,
    )
    expect('data' in res).toBe(true)
    if ('data' in res) {
      expect(res.data.effect).toBe('created')
      expect(res.data.written).toBe(true)
    }
  })

  it('reports "overwritten" when path has existing object data', async () => {
    const fetcher = sequentialFetcher([
      { body: { old: 'value' } },
      { body: { new: 'value' } },
    ])
    const res = await seedData('localhost', 9000, 'demo', '/config', { new: 'value' }, fetcher)
    expect('data' in res).toBe(true)
    if ('data' in res) expect(res.data.effect).toBe('overwritten')
  })

  it('returns EMULATOR_NOT_RUNNING when PUT fails with network error', async () => {
    // First GET succeeds, PUT fails
    let callCount = 0
    const fetcher = async (_url: string, init?: RequestInit): Promise<Response> => {
      callCount++
      if (callCount === 1 && init?.method !== 'PUT') {
        return new Response(JSON.stringify(null), { status: 200 })
      }
      throw new Error('ECONNREFUSED')
    }
    const res = await seedData('localhost', 9000, 'demo', '/path', {}, fetcher)
    if ('error' in res) expect(res.error.code).toBe('EMULATOR_NOT_RUNNING')
  })

  it('returns error when initial GET returns RULE_DENIED', async () => {
    const res = await seedData('localhost', 9000, 'demo', '/secret', {}, ruleDeniedFetcher())
    expect('error' in res).toBe(true)
    if ('error' in res) expect(res.error.code).toBe('RULE_DENIED')
  })
})

// ---------------------------------------------------------------------------
// exportData
// ---------------------------------------------------------------------------

describe('exportData', () => {
  it('returns path and data on success', async () => {
    const res = await exportData(
      'localhost',
      9000,
      'demo',
      '/users',
      okFetcher({ alice: { age: 30 } }),
    )
    expect('data' in res).toBe(true)
    if ('data' in res) {
      expect(res.data.path).toBe('/users')
      expect(res.data.data).toEqual({ alice: { age: 30 } })
    }
  })

  it('returns null data when path is absent', async () => {
    const res = await exportData('localhost', 9000, 'demo', '/empty', okFetcher(null))
    expect('data' in res).toBe(true)
    if ('data' in res) expect(res.data.data).toBeNull()
  })

  it('returns EMULATOR_NOT_RUNNING on network error', async () => {
    const res = await exportData('localhost', 9000, 'demo', '/path', networkErrorFetcher())
    if ('error' in res) expect(res.error.code).toBe('EMULATOR_NOT_RUNNING')
  })
})

// ---------------------------------------------------------------------------
// Admin credentials
// ---------------------------------------------------------------------------

describe('admin credentials', () => {
  /** Captures the headers a single adapter call sends. */
  function headerCapturingFetcher(sink: { headers?: Headers }) {
    return async (_url: string, init?: RequestInit): Promise<Response> => {
      sink.headers = new Headers(init?.headers)
      return new Response(JSON.stringify({ name: 'generated-key' }), { status: 200 })
    }
  }

  type TestFetcher = (url: string, init?: RequestInit) => Promise<Response>

  const operations: Array<{ name: string; run: (f: TestFetcher) => Promise<unknown> }> = [
    { name: 'getData', run: (f) => getData('localhost', 9000, 'demo', '/a', f) },
    { name: 'setData', run: (f) => setData('localhost', 9000, 'demo', '/a', { x: 1 }, f) },
    { name: 'updateData', run: (f) => updateData('localhost', 9000, 'demo', '/a', { x: 1 }, f) },
    { name: 'pushData', run: (f) => pushData('localhost', 9000, 'demo', '/a', { x: 1 }, f) },
    { name: 'deleteData', run: (f) => deleteData('localhost', 9000, 'demo', '/a', f) },
    { name: 'queryData', run: (f) => queryData('localhost', 9000, 'demo', '/a', {}, f) },
    { name: 'seedData', run: (f) => seedData('localhost', 9000, 'demo', '/a', { x: 1 }, f) },
    { name: 'exportData', run: (f) => exportData('localhost', 9000, 'demo', '/a', f) },
  ]

  for (const op of operations) {
    it(`${op.name} sends the emulator admin credential`, async () => {
      const sink: { headers?: Headers } = {}
      await op.run(headerCapturingFetcher(sink))
      expect(sink.headers?.get('Authorization')).toBe('Bearer owner')
    })
  }

  it('does not put the credential in the URL, which the emulator rejects', async () => {
    let captured = ''
    const fetcher = async (url: string): Promise<Response> => {
      captured = url
      return new Response(JSON.stringify(null), { status: 200 })
    }
    await getData('localhost', 9000, 'demo', '/a', fetcher)
    expect(captured).not.toContain('auth=')
  })
})
