import { describe, it, expect } from 'bun:test'
import { checkRules, intentToMethod, resolveAuthHeader } from '../../src/adapters/rules/index.ts'

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

function networkErrorFetcher() {
  return async (): Promise<Response> => {
    throw new Error('ECONNREFUSED')
  }
}

// ---------------------------------------------------------------------------
// intentToMethod
// ---------------------------------------------------------------------------

describe('intentToMethod', () => {
  it('maps read/get/list to GET', () => {
    expect(intentToMethod('read')).toBe('GET')
    expect(intentToMethod('get')).toBe('GET')
    expect(intentToMethod('list')).toBe('GET')
    expect(intentToMethod('READ')).toBe('GET')
  })

  it('maps delete to DELETE', () => {
    expect(intentToMethod('delete')).toBe('DELETE')
    expect(intentToMethod('DELETE')).toBe('DELETE')
  })

  it('maps update to PATCH', () => {
    expect(intentToMethod('update')).toBe('PATCH')
  })

  it('maps write/create and unknown intents to POST', () => {
    expect(intentToMethod('write')).toBe('POST')
    expect(intentToMethod('create')).toBe('POST')
    expect(intentToMethod('custom')).toBe('POST')
  })
})

// ---------------------------------------------------------------------------
// resolveAuthHeader
// ---------------------------------------------------------------------------

describe('resolveAuthHeader', () => {
  it('returns undefined when auth is null or undefined', () => {
    expect(resolveAuthHeader(null, 'proj')).toBeUndefined()
    expect(resolveAuthHeader(undefined, 'proj')).toBeUndefined()
  })

  it('returns Bearer token when auth has token property', () => {
    const header = resolveAuthHeader({ token: 'my-token' }, 'proj')
    expect(header).toBe('Bearer my-token')
  })

  it('builds an unsigned JWT when auth has uid property', () => {
    const header = resolveAuthHeader({ uid: 'user-123' }, 'my-project')
    expect(header).toBeDefined()
    expect(header!.startsWith('Bearer ')).toBe(true)
    // Decode payload from the JWT
    const parts = header!.slice('Bearer '.length).split('.')
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'))
    expect(payload.uid).toBe('user-123')
    expect(payload.sub).toBe('user-123')
    expect(payload.aud).toBe('my-project')
  })

  it('includes email in the JWT payload when provided', () => {
    const header = resolveAuthHeader({ uid: 'user-123', email: 'user@example.com' }, 'proj')
    const parts = header!.slice('Bearer '.length).split('.')
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'))
    expect(payload.email).toBe('user@example.com')
    expect(payload.email_verified).toBe(true)
  })

  it('returns undefined for non-object auth', () => {
    expect(resolveAuthHeader('string', 'proj')).toBeUndefined()
    expect(resolveAuthHeader(42, 'proj')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// checkRules — input validation
// ---------------------------------------------------------------------------

describe('checkRules — input validation', () => {
  it('returns INVALID_INPUT when resourcePath is empty', async () => {
    const result = await checkRules('localhost', 8080, 'proj', 'firestore', '', 'read', undefined, undefined)
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error.code).toBe('INVALID_INPUT')
    }
  })
})

// ---------------------------------------------------------------------------
// checkRules — Firestore
// ---------------------------------------------------------------------------

describe('checkRules — Firestore allowed', () => {
  it('returns allowed:true when emulator responds 200', async () => {
    const result = await checkRules(
      'localhost', 8080, 'proj', 'firestore',
      'users/abc', 'read', undefined, undefined,
      okFetcher({ name: 'users/abc', fields: {} }),
    )
    expect('data' in result).toBe(true)
    if ('data' in result) {
      expect(result.data.allowed).toBe(true)
      expect(result.data.notFound).toBeUndefined()
    }
  })

  it('returns allowed:true with notFound:true on 404 for read', async () => {
    const result = await checkRules(
      'localhost', 8080, 'proj', 'firestore',
      'users/abc', 'read', undefined, undefined,
      okFetcher({ error: { code: 404, message: 'Not Found' } }, 404),
    )
    expect('data' in result).toBe(true)
    if ('data' in result) {
      expect(result.data.allowed).toBe(true)
      expect(result.data.notFound).toBe(true)
    }
  })
})

describe('checkRules — Firestore denied', () => {
  it('returns RULE_DENIED on 403', async () => {
    const result = await checkRules(
      'localhost', 8080, 'proj', 'firestore',
      'users/abc', 'read', undefined, undefined,
      okFetcher({ error: { code: 403, message: 'Permission denied' } }, 403),
    )
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error.code).toBe('RULE_DENIED')
    }
  })

  it('returns RULE_DENIED on 401', async () => {
    const result = await checkRules(
      'localhost', 8080, 'proj', 'firestore',
      'users/abc', 'write', undefined, undefined,
      okFetcher({ error: { code: 401, message: 'Unauthorized' } }, 401),
    )
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error.code).toBe('RULE_DENIED')
    }
  })

  it('returns INVALID_INPUT on 400', async () => {
    const result = await checkRules(
      'localhost', 8080, 'proj', 'firestore',
      'bad path!!', 'read', undefined, undefined,
      okFetcher({ error: { code: 400, message: 'Bad request' } }, 400),
    )
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error.code).toBe('INVALID_INPUT')
    }
  })

  it('returns EMULATOR_NOT_RUNNING on network error', async () => {
    const result = await checkRules(
      'localhost', 8080, 'proj', 'firestore',
      'users/abc', 'read', undefined, undefined,
      networkErrorFetcher(),
    )
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error.code).toBe('EMULATOR_NOT_RUNNING')
    }
  })
})

// ---------------------------------------------------------------------------
// checkRules — Storage
// ---------------------------------------------------------------------------

describe('checkRules — Storage allowed', () => {
  it('returns allowed:true when emulator responds 200', async () => {
    const result = await checkRules(
      'localhost', 9199, 'proj', 'storage',
      'images/photo.jpg', 'read', 'my-bucket', undefined,
      okFetcher(new Uint8Array([1, 2, 3])),
    )
    expect('data' in result).toBe(true)
    if ('data' in result) {
      expect(result.data.allowed).toBe(true)
      expect(result.data.service).toBe('storage')
    }
  })

  it('uses default bucket ({projectId}.appspot.com) when bucket is undefined', async () => {
    let capturedUrl = ''
    const fetcher = async (url: string): Promise<Response> => {
      capturedUrl = url
      return new Response('', { status: 200 })
    }
    await checkRules(
      'localhost', 9199, 'my-project', 'storage',
      'file.txt', 'read', undefined, undefined,
      fetcher,
    )
    expect(capturedUrl).toContain('my-project.appspot.com')
  })

  it('returns allowed:true with notFound:true on 404 for read', async () => {
    const result = await checkRules(
      'localhost', 9199, 'proj', 'storage',
      'missing.txt', 'read', 'bucket', undefined,
      okFetcher({ error: 'Not found' }, 404),
    )
    expect('data' in result).toBe(true)
    if ('data' in result) {
      expect(result.data.allowed).toBe(true)
      expect(result.data.notFound).toBe(true)
    }
  })
})

describe('checkRules — Storage denied', () => {
  it('returns RULE_DENIED on 403', async () => {
    const result = await checkRules(
      'localhost', 9199, 'proj', 'storage',
      'private.jpg', 'read', 'bucket', undefined,
      okFetcher({ error: 'Permission denied' }, 403),
    )
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error.code).toBe('RULE_DENIED')
    }
  })

  it('returns EMULATOR_NOT_RUNNING on network error', async () => {
    const result = await checkRules(
      'localhost', 9199, 'proj', 'storage',
      'file.txt', 'read', 'bucket', undefined,
      networkErrorFetcher(),
    )
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error.code).toBe('EMULATOR_NOT_RUNNING')
    }
  })
})
