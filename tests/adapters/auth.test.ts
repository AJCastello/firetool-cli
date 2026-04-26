import { describe, it, expect } from 'bun:test'
import {
  listUsers,
  createUser,
  getUser,
  updateUser,
  deleteUser,
  clearUsers,
} from '../../src/adapters/auth/index.ts'

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
// listUsers
// ---------------------------------------------------------------------------

describe('listUsers', () => {
  it('returns empty array when no users exist', async () => {
    const res = await listUsers('localhost', 9099, 'demo-project', okFetcher({}))
    expect('data' in res).toBe(true)
    if ('data' in res) expect(res.data).toEqual([])
  })

  it('returns mapped users from response', async () => {
    const users = [
      { localId: 'uid1', email: 'a@example.com' },
      { localId: 'uid2', email: 'b@example.com' },
    ]
    const res = await listUsers('localhost', 9099, 'demo-project', okFetcher({ users }))
    expect('data' in res).toBe(true)
    if ('data' in res) {
      expect(res.data).toHaveLength(2)
      expect(res.data[0]!.localId).toBe('uid1')
    }
  })

  it('returns EMULATOR_NOT_RUNNING on network error', async () => {
    const res = await listUsers('localhost', 9099, 'demo-project', networkErrorFetcher())
    expect('error' in res).toBe(true)
    if ('error' in res) expect(res.error.code).toBe('EMULATOR_NOT_RUNNING')
  })

  it('returns INVALID_INPUT on HTTP error response', async () => {
    const res = await listUsers('localhost', 9099, 'demo-project', errorFetcher('Not found', 404))
    expect('error' in res).toBe(true)
    if ('error' in res) {
      expect(res.error.code).toBe('INVALID_INPUT')
      expect(res.error.message).toBe('Not found')
    }
  })

  it('builds the correct URL with projectId', async () => {
    let capturedUrl = ''
    const fetcher = async (url: string): Promise<Response> => {
      capturedUrl = url
      return new Response(JSON.stringify({ users: [] }), { status: 200 })
    }
    await listUsers('localhost', 9099, 'my-project', fetcher)
    expect(capturedUrl).toContain('/projects/my-project/accounts:batchGet')
    expect(capturedUrl).toContain('key=owner')
  })
})

// ---------------------------------------------------------------------------
// createUser
// ---------------------------------------------------------------------------

describe('createUser', () => {
  it('returns the created user', async () => {
    const user = { localId: 'new-uid', email: 'new@example.com', displayName: 'Test User' }
    const res = await createUser('localhost', 9099, 'demo-project', { email: 'new@example.com' }, okFetcher(user))
    expect('data' in res).toBe(true)
    if ('data' in res) {
      expect(res.data.localId).toBe('new-uid')
      expect(res.data.email).toBe('new@example.com')
    }
  })

  it('returns INVALID_INPUT when emulator rejects the data', async () => {
    const res = await createUser(
      'localhost',
      9099,
      'demo-project',
      { email: 'bad' },
      errorFetcher('INVALID_EMAIL', 400),
    )
    expect('error' in res).toBe(true)
    if ('error' in res) expect(res.error.code).toBe('INVALID_INPUT')
  })

  it('returns EMULATOR_NOT_RUNNING on network error', async () => {
    const res = await createUser('localhost', 9099, 'demo-project', {}, networkErrorFetcher())
    expect('error' in res).toBe(true)
    if ('error' in res) expect(res.error.code).toBe('EMULATOR_NOT_RUNNING')
  })

  it('sends POST to the accounts endpoint', async () => {
    let method = ''
    let url = ''
    const fetcher = async (u: string, init?: RequestInit): Promise<Response> => {
      url = u
      method = init?.method ?? 'GET'
      return new Response(JSON.stringify({ localId: 'x' }), { status: 200 })
    }
    await createUser('localhost', 9099, 'demo-project', { email: 'x@example.com' }, fetcher)
    expect(method).toBe('POST')
    expect(url).toContain('/projects/demo-project/accounts')
    expect(url).toContain('key=owner')
    expect(url).not.toContain(':lookup')
  })
})

// ---------------------------------------------------------------------------
// getUser
// ---------------------------------------------------------------------------

describe('getUser', () => {
  it('returns user when found by uid', async () => {
    const user = { localId: 'uid1', email: 'a@example.com' }
    const res = await getUser('localhost', 9099, 'demo-project', 'uid1', okFetcher({ users: [user] }))
    expect('data' in res).toBe(true)
    if ('data' in res) expect(res.data.localId).toBe('uid1')
  })

  it('returns user when found by email', async () => {
    const user = { localId: 'uid2', email: 'a@example.com' }
    const res = await getUser('localhost', 9099, 'demo-project', 'a@example.com', okFetcher({ users: [user] }))
    expect('data' in res).toBe(true)
    if ('data' in res) expect(res.data.email).toBe('a@example.com')
  })

  it('returns INVALID_INPUT when no user found', async () => {
    const res = await getUser('localhost', 9099, 'demo-project', 'missing-uid', okFetcher({ users: [] }))
    expect('error' in res).toBe(true)
    if ('error' in res) {
      expect(res.error.code).toBe('INVALID_INPUT')
      expect(res.error.message).toContain('uid')
      expect(res.error.message).toContain('missing-uid')
    }
  })

  it('includes "email" in message when identifier contains @', async () => {
    const res = await getUser('localhost', 9099, 'demo-project', 'nope@example.com', okFetcher({ users: [] }))
    if ('error' in res) expect(res.error.message).toContain('email')
  })

  it('returns EMULATOR_NOT_RUNNING on network error', async () => {
    const res = await getUser('localhost', 9099, 'demo-project', 'uid1', networkErrorFetcher())
    if ('error' in res) expect(res.error.code).toBe('EMULATOR_NOT_RUNNING')
  })
})

// ---------------------------------------------------------------------------
// updateUser
// ---------------------------------------------------------------------------

describe('updateUser', () => {
  it('returns the updated user', async () => {
    const user = { localId: 'uid1', email: 'updated@example.com', displayName: 'Updated' }
    const res = await updateUser('localhost', 9099, 'demo-project', 'uid1', { displayName: 'Updated' }, okFetcher(user))
    expect('data' in res).toBe(true)
    if ('data' in res) {
      expect(res.data.localId).toBe('uid1')
      expect(res.data.displayName).toBe('Updated')
    }
  })

  it('sends PATCH to the accounts/{localId} endpoint', async () => {
    let method = ''
    let url = ''
    const fetcher = async (u: string, init?: RequestInit): Promise<Response> => {
      url = u
      method = init?.method ?? ''
      return new Response(JSON.stringify({ localId: 'uid1' }), { status: 200 })
    }
    await updateUser('localhost', 9099, 'demo-project', 'uid1', { disabled: true }, fetcher)
    expect(method).toBe('PATCH')
    expect(url).toContain('/accounts/uid1')
  })

  it('returns INVALID_INPUT on HTTP error', async () => {
    const res = await updateUser('localhost', 9099, 'demo-project', 'uid1', {}, errorFetcher('USER_NOT_FOUND', 404))
    if ('error' in res) expect(res.error.code).toBe('INVALID_INPUT')
  })
})

// ---------------------------------------------------------------------------
// deleteUser
// ---------------------------------------------------------------------------

describe('deleteUser', () => {
  it('returns the deleted localId on success', async () => {
    const res = await deleteUser('localhost', 9099, 'demo-project', 'uid1', okFetcher({}))
    expect('data' in res).toBe(true)
    if ('data' in res) expect(res.data.localId).toBe('uid1')
  })

  it('sends DELETE to the accounts/{localId} endpoint', async () => {
    let method = ''
    let url = ''
    const fetcher = async (u: string, init?: RequestInit): Promise<Response> => {
      url = u
      method = init?.method ?? ''
      return new Response(JSON.stringify({}), { status: 200 })
    }
    await deleteUser('localhost', 9099, 'demo-project', 'uid1', fetcher)
    expect(method).toBe('DELETE')
    expect(url).toContain('/accounts/uid1')
  })

  it('returns INVALID_INPUT on HTTP error', async () => {
    const res = await deleteUser('localhost', 9099, 'demo-project', 'uid1', errorFetcher('USER_NOT_FOUND', 404))
    if ('error' in res) expect(res.error.code).toBe('INVALID_INPUT')
  })

  it('returns EMULATOR_NOT_RUNNING on network error', async () => {
    const res = await deleteUser('localhost', 9099, 'demo-project', 'uid1', networkErrorFetcher())
    if ('error' in res) expect(res.error.code).toBe('EMULATOR_NOT_RUNNING')
  })
})

// ---------------------------------------------------------------------------
// clearUsers
// ---------------------------------------------------------------------------

describe('clearUsers', () => {
  it('returns cleared:true on success', async () => {
    const res = await clearUsers('localhost', 9099, 'demo-project', okFetcher({}))
    expect('data' in res).toBe(true)
    if ('data' in res) expect(res.data.cleared).toBe(true)
  })

  it('sends DELETE to the emulator management endpoint', async () => {
    let method = ''
    let url = ''
    const fetcher = async (u: string, init?: RequestInit): Promise<Response> => {
      url = u
      method = init?.method ?? ''
      return new Response(JSON.stringify({}), { status: 200 })
    }
    await clearUsers('localhost', 9099, 'demo-project', fetcher)
    expect(method).toBe('DELETE')
    expect(url).toContain('/emulator/v1/projects/demo-project/accounts')
  })

  it('returns EMULATOR_NOT_RUNNING on network error', async () => {
    const res = await clearUsers('localhost', 9099, 'demo-project', networkErrorFetcher())
    if ('error' in res) expect(res.error.code).toBe('EMULATOR_NOT_RUNNING')
  })
})
