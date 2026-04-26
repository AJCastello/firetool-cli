import { describe, it, expect } from 'bun:test'
import {
  listObjects,
  uploadObject,
  downloadObject,
  removeObject,
  clearBucket,
  normalizeObjectPath,
  encodeObjectPath,
} from '../../src/adapters/storage/index.ts'

// ---------------------------------------------------------------------------
// Fake fetcher helpers
// ---------------------------------------------------------------------------

function okFetcher(body: unknown, status = 200) {
  return async (_url: string, _init?: RequestInit): Promise<Response> => {
    const isBuffer = body instanceof Uint8Array
    return new Response(isBuffer ? body : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': isBuffer ? 'application/octet-stream' : 'application/json' },
    })
  }
}

function ruleDeniedFetcher(status = 401) {
  return okFetcher({ error: 'Permission denied' }, status)
}

function notFoundFetcher() {
  return okFetcher({ error: { message: 'Not Found' } }, 404)
}

function networkErrorFetcher() {
  return async (): Promise<Response> => {
    throw new Error('ECONNREFUSED')
  }
}

/** Returns different responses per call index. */
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
// normalizeObjectPath
// ---------------------------------------------------------------------------

describe('normalizeObjectPath', () => {
  it('strips leading slashes', () => {
    expect(normalizeObjectPath('/images/photo.jpg')).toBe('images/photo.jpg')
  })

  it('leaves path without leading slash unchanged', () => {
    expect(normalizeObjectPath('images/photo.jpg')).toBe('images/photo.jpg')
  })

  it('handles empty string', () => {
    expect(normalizeObjectPath('')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// encodeObjectPath
// ---------------------------------------------------------------------------

describe('encodeObjectPath', () => {
  it('encodes path segments with %2F as separator', () => {
    const encoded = encodeObjectPath('folder/sub/file.txt')
    expect(encoded).toBe('folder%2Fsub%2Ffile.txt')
  })

  it('encodes spaces in segments', () => {
    const encoded = encodeObjectPath('my folder/my file.txt')
    expect(encoded).toBe('my%20folder%2Fmy%20file.txt')
  })

  it('handles single segment', () => {
    expect(encodeObjectPath('file.txt')).toBe('file.txt')
  })
})

// ---------------------------------------------------------------------------
// listObjects
// ---------------------------------------------------------------------------

describe('listObjects', () => {
  it('returns list of objects on success', async () => {
    const items = [
      { name: 'images/photo.jpg', bucket: 'my-bucket', size: '1024' },
      { name: 'docs/readme.txt', bucket: 'my-bucket', size: '512' },
    ]
    const res = await listObjects('localhost', 9199, 'my-bucket', undefined, okFetcher({ items }))
    expect('data' in res).toBe(true)
    if ('data' in res) {
      expect(res.data.count).toBe(2)
      expect(res.data.objects).toHaveLength(2)
      const first = res.data.objects[0]
      expect(first?.name).toBe('images/photo.jpg')
    }
  })

  it('returns empty list when bucket is empty', async () => {
    const res = await listObjects('localhost', 9199, 'empty-bucket', undefined, okFetcher({}))
    expect('data' in res).toBe(true)
    if ('data' in res) {
      expect(res.data.count).toBe(0)
      expect(res.data.objects).toHaveLength(0)
    }
  })

  it('returns RULE_DENIED on 401', async () => {
    const res = await listObjects('localhost', 9199, 'secret', undefined, ruleDeniedFetcher(401))
    expect('error' in res).toBe(true)
    if ('error' in res) expect(res.error.code).toBe('RULE_DENIED')
  })

  it('returns RULE_DENIED on 403', async () => {
    const res = await listObjects('localhost', 9199, 'secret', undefined, ruleDeniedFetcher(403))
    expect('error' in res).toBe(true)
    if ('error' in res) expect(res.error.code).toBe('RULE_DENIED')
  })

  it('returns EMULATOR_NOT_RUNNING on network error', async () => {
    const res = await listObjects('localhost', 9199, 'bucket', undefined, networkErrorFetcher())
    expect('error' in res).toBe(true)
    if ('error' in res) expect(res.error.code).toBe('EMULATOR_NOT_RUNNING')
  })

  it('filters by prefix when provided', async () => {
    let capturedUrl = ''
    const fetcher = async (url: string): Promise<Response> => {
      capturedUrl = url
      return new Response(JSON.stringify({}), { status: 200 })
    }
    await listObjects('localhost', 9199, 'my-bucket', 'images/', fetcher)
    expect(capturedUrl).toContain('prefix=images%2F')
  })

  it('uses correct URL structure', async () => {
    let capturedUrl = ''
    const fetcher = async (url: string): Promise<Response> => {
      capturedUrl = url
      return new Response(JSON.stringify({}), { status: 200 })
    }
    await listObjects('localhost', 9199, 'my-bucket.appspot.com', undefined, fetcher)
    expect(capturedUrl).toContain('/v0/b/')
    expect(capturedUrl).toContain('my-bucket')
  })
})

// ---------------------------------------------------------------------------
// uploadObject
// ---------------------------------------------------------------------------

describe('uploadObject', () => {
  it('returns upload confirmation on success', async () => {
    const content = new Uint8Array([104, 101, 108, 108, 111])
    const res = await uploadObject(
      'localhost',
      9199,
      'my-bucket',
      'path/file.txt',
      content,
      'text/plain',
      okFetcher({ name: 'path/file.txt', bucket: 'my-bucket' }),
    )
    expect('data' in res).toBe(true)
    if ('data' in res) {
      expect(res.data.uploaded).toBe(true)
      expect(res.data.name).toBe('path/file.txt')
      expect(res.data.size).toBe(5)
    }
  })

  it('strips leading slash from object path', async () => {
    let capturedUrl = ''
    const fetcher = async (url: string): Promise<Response> => {
      capturedUrl = url
      return new Response(JSON.stringify({}), { status: 200 })
    }
    await uploadObject('localhost', 9199, 'bucket', '/images/photo.jpg', new Uint8Array([1]), 'image/jpeg', fetcher)
    expect(capturedUrl).toContain('name=images%2Fphoto.jpg')
  })

  it('sends POST request', async () => {
    let method = ''
    const fetcher = async (_url: string, init?: RequestInit): Promise<Response> => {
      method = init?.method ?? ''
      return new Response(JSON.stringify({}), { status: 200 })
    }
    await uploadObject('localhost', 9199, 'bucket', 'file.txt', new Uint8Array([1]), 'text/plain', fetcher)
    expect(method).toBe('POST')
  })

  it('returns RULE_DENIED on 403', async () => {
    const res = await uploadObject(
      'localhost',
      9199,
      'bucket',
      'file.txt',
      new Uint8Array([1]),
      'text/plain',
      ruleDeniedFetcher(403),
    )
    expect('error' in res).toBe(true)
    if ('error' in res) expect(res.error.code).toBe('RULE_DENIED')
  })

  it('returns EMULATOR_NOT_RUNNING on network error', async () => {
    const res = await uploadObject(
      'localhost',
      9199,
      'bucket',
      'file.txt',
      new Uint8Array([1]),
      'text/plain',
      networkErrorFetcher(),
    )
    expect('error' in res).toBe(true)
    if ('error' in res) expect(res.error.code).toBe('EMULATOR_NOT_RUNNING')
  })
})

// ---------------------------------------------------------------------------
// downloadObject
// ---------------------------------------------------------------------------

describe('downloadObject', () => {
  it('returns file content on success', async () => {
    const fileBytes = new Uint8Array([72, 101, 108, 108, 111])
    const res = await downloadObject('localhost', 9199, 'my-bucket', 'path/file.txt', okFetcher(fileBytes))
    expect('data' in res).toBe(true)
    if ('data' in res) {
      expect(res.data.name).toBe('path/file.txt')
      expect(res.data.size).toBe(5)
    }
  })

  it('returns INVALID_INPUT on 404', async () => {
    const res = await downloadObject('localhost', 9199, 'bucket', 'missing.txt', notFoundFetcher())
    expect('error' in res).toBe(true)
    if ('error' in res) expect(res.error.code).toBe('INVALID_INPUT')
  })

  it('returns RULE_DENIED on 401', async () => {
    const res = await downloadObject('localhost', 9199, 'bucket', 'secret.txt', ruleDeniedFetcher(401))
    expect('error' in res).toBe(true)
    if ('error' in res) expect(res.error.code).toBe('RULE_DENIED')
  })

  it('returns EMULATOR_NOT_RUNNING on network error', async () => {
    const res = await downloadObject('localhost', 9199, 'bucket', 'file.txt', networkErrorFetcher())
    expect('error' in res).toBe(true)
    if ('error' in res) expect(res.error.code).toBe('EMULATOR_NOT_RUNNING')
  })

  it('uses ?alt=media in the URL', async () => {
    let capturedUrl = ''
    const fetcher = async (url: string): Promise<Response> => {
      capturedUrl = url
      return new Response(new Uint8Array([1]), { status: 200 })
    }
    await downloadObject('localhost', 9199, 'bucket', 'path/file.txt', fetcher)
    expect(capturedUrl).toContain('alt=media')
  })
})

// ---------------------------------------------------------------------------
// removeObject
// ---------------------------------------------------------------------------

describe('removeObject', () => {
  it('returns removal confirmation on success', async () => {
    const res = await removeObject('localhost', 9199, 'my-bucket', 'path/file.txt', okFetcher('', 204))
    expect('data' in res).toBe(true)
    if ('data' in res) {
      expect(res.data.removed).toBe(true)
      expect(res.data.name).toBe('path/file.txt')
    }
  })

  it('sends DELETE request', async () => {
    let method = ''
    const fetcher = async (_url: string, init?: RequestInit): Promise<Response> => {
      method = init?.method ?? ''
      return new Response('', { status: 204 })
    }
    await removeObject('localhost', 9199, 'bucket', 'file.txt', fetcher)
    expect(method).toBe('DELETE')
  })

  it('returns INVALID_INPUT on 404', async () => {
    const res = await removeObject('localhost', 9199, 'bucket', 'missing.txt', notFoundFetcher())
    expect('error' in res).toBe(true)
    if ('error' in res) expect(res.error.code).toBe('INVALID_INPUT')
  })

  it('returns RULE_DENIED on 403', async () => {
    const res = await removeObject('localhost', 9199, 'bucket', 'secret.txt', ruleDeniedFetcher(403))
    expect('error' in res).toBe(true)
    if ('error' in res) expect(res.error.code).toBe('RULE_DENIED')
  })

  it('returns EMULATOR_NOT_RUNNING on network error', async () => {
    const res = await removeObject('localhost', 9199, 'bucket', 'file.txt', networkErrorFetcher())
    expect('error' in res).toBe(true)
    if ('error' in res) expect(res.error.code).toBe('EMULATOR_NOT_RUNNING')
  })
})

// ---------------------------------------------------------------------------
// clearBucket
// ---------------------------------------------------------------------------

describe('clearBucket', () => {
  it('deletes all listed objects and returns count', async () => {
    const items = [
      { name: 'a.txt', bucket: 'bucket', size: '1' },
      { name: 'b.txt', bucket: 'bucket', size: '2' },
    ]
    // First call: list → items; subsequent calls: delete each → 204
    const fetcher = sequentialFetcher([
      { body: { items }, status: 200 },
      { body: '', status: 204 },
      { body: '', status: 204 },
    ])
    const res = await clearBucket('localhost', 9199, 'bucket', fetcher)
    expect('data' in res).toBe(true)
    if ('data' in res) {
      expect(res.data.cleared).toBe(true)
      expect(res.data.count).toBe(2)
      expect(res.data.removed).toContain('a.txt')
      expect(res.data.removed).toContain('b.txt')
    }
  })

  it('returns cleared:true with count 0 when bucket is empty', async () => {
    const fetcher = sequentialFetcher([{ body: {}, status: 200 }])
    const res = await clearBucket('localhost', 9199, 'empty-bucket', fetcher)
    expect('data' in res).toBe(true)
    if ('data' in res) {
      expect(res.data.cleared).toBe(true)
      expect(res.data.count).toBe(0)
    }
  })

  it('propagates list error', async () => {
    const res = await clearBucket('localhost', 9199, 'bucket', networkErrorFetcher())
    expect('error' in res).toBe(true)
    if ('error' in res) expect(res.error.code).toBe('EMULATOR_NOT_RUNNING')
  })

  it('propagates delete error on first failing object', async () => {
    const items = [{ name: 'a.txt', bucket: 'bucket', size: '1' }]
    const fetcher = sequentialFetcher([
      { body: { items }, status: 200 },
      { body: { error: 'Permission denied' }, status: 403 },
    ])
    const res = await clearBucket('localhost', 9199, 'bucket', fetcher)
    expect('error' in res).toBe(true)
    if ('error' in res) expect(res.error.code).toBe('RULE_DENIED')
  })
})
