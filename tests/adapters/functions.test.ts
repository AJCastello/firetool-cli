import { describe, it, expect } from 'bun:test'
import { buildFunctionUrl, callFunction } from '../../src/adapters/functions/index.ts'

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

function textFetcher(body: string, status = 200) {
  return async (_url: string, _init?: RequestInit): Promise<Response> => {
    return new Response(body, { status, headers: { 'Content-Type': 'text/plain' } })
  }
}

function networkErrorFetcher() {
  return async (): Promise<Response> => {
    throw new Error('ECONNREFUSED')
  }
}

// ---------------------------------------------------------------------------
// buildFunctionUrl
// ---------------------------------------------------------------------------

describe('buildFunctionUrl', () => {
  it('builds a URL from host, port, projectId, and function name', () => {
    const url = buildFunctionUrl('localhost', 5001, 'my-project', 'myFunc')
    expect(url).toBe('http://localhost:5001/my-project/us-central1/myFunc')
  })

  it('uses a custom region when specified', () => {
    const url = buildFunctionUrl('localhost', 5001, 'my-project', 'myFunc', 'europe-west1')
    expect(url).toBe('http://localhost:5001/my-project/europe-west1/myFunc')
  })
})

// ---------------------------------------------------------------------------
// callFunction — full URL passthrough
// ---------------------------------------------------------------------------

describe('callFunction — full URL', () => {
  it('uses the URL directly when nameOrUrl starts with http', async () => {
    let capturedUrl = ''
    const fetcher = async (url: string): Promise<Response> => {
      capturedUrl = url
      return new Response(JSON.stringify({ result: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    await callFunction('localhost', 5001, 'proj', 'http://custom.host/fn', undefined, fetcher)
    expect(capturedUrl).toBe('http://custom.host/fn')
  })

  it('sends data as { data: payload } in the POST body', async () => {
    let capturedBody = ''
    const fetcher = async (_url: string, init?: RequestInit): Promise<Response> => {
      capturedBody = init?.body as string
      return new Response(JSON.stringify({ result: 'done' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    await callFunction('localhost', 5001, 'proj', 'http://fn.local/fn', { key: 'val' }, fetcher)
    expect(JSON.parse(capturedBody)).toEqual({ data: { key: 'val' } })
  })
})

// ---------------------------------------------------------------------------
// callFunction — name resolution
// ---------------------------------------------------------------------------

describe('callFunction — name resolution', () => {
  it('returns CONTEXT_NOT_FOUND when projectId is missing and nameOrUrl is a name', async () => {
    const result = await callFunction('localhost', 5001, undefined, 'myFunc')
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error.code).toBe('CONTEXT_NOT_FOUND')
    }
  })

  it('builds the correct URL from project and function name', async () => {
    let capturedUrl = ''
    const fetcher = async (url: string): Promise<Response> => {
      capturedUrl = url
      return new Response(JSON.stringify({ result: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    await callFunction('localhost', 5001, 'my-project', 'myFunc', undefined, fetcher)
    expect(capturedUrl).toBe('http://localhost:5001/my-project/us-central1/myFunc')
  })
})

// ---------------------------------------------------------------------------
// callFunction — response handling
// ---------------------------------------------------------------------------

describe('callFunction — response handling', () => {
  it('returns ok:true with result on 200', async () => {
    const result = await callFunction(
      'localhost', 5001, 'proj', 'http://fn.local/fn',
      undefined, okFetcher({ result: 'hello' }),
    )
    expect('data' in result).toBe(true)
    if ('data' in result) {
      expect(result.data.status).toBe(200)
      expect(result.data.result).toEqual({ result: 'hello' })
    }
  })

  it('returns text result when response is not JSON', async () => {
    const result = await callFunction(
      'localhost', 5001, 'proj', 'http://fn.local/fn',
      undefined, textFetcher('plain text response'),
    )
    expect('data' in result).toBe(true)
    if ('data' in result) {
      expect(result.data.result).toBe('plain text response')
    }
  })

  it('returns RULE_DENIED on 403', async () => {
    const result = await callFunction(
      'localhost', 5001, 'proj', 'http://fn.local/fn',
      undefined, okFetcher({ error: 'forbidden' }, 403),
    )
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error.code).toBe('RULE_DENIED')
    }
  })

  it('returns RULE_DENIED on 401', async () => {
    const result = await callFunction(
      'localhost', 5001, 'proj', 'http://fn.local/fn',
      undefined, okFetcher({ error: 'unauthorized' }, 401),
    )
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error.code).toBe('RULE_DENIED')
    }
  })

  it('returns INVALID_INPUT on 400', async () => {
    const result = await callFunction(
      'localhost', 5001, 'proj', 'http://fn.local/fn',
      undefined, okFetcher({ error: 'bad request' }, 400),
    )
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error.code).toBe('INVALID_INPUT')
    }
  })

  it('returns EMULATOR_NOT_RUNNING on network error', async () => {
    const result = await callFunction(
      'localhost', 5001, 'proj', 'http://fn.local/fn',
      undefined, networkErrorFetcher(),
    )
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error.code).toBe('EMULATOR_NOT_RUNNING')
    }
  })
})
