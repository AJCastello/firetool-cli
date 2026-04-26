import { describe, it, expect } from 'bun:test'
import { encodeMessageData, publishMessage } from '../../src/adapters/pubsub/index.ts'

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
// encodeMessageData
// ---------------------------------------------------------------------------

describe('encodeMessageData', () => {
  it('base64-encodes the JSON-serialised data', () => {
    const encoded = encodeMessageData({ hello: 'world' })
    const decoded = Buffer.from(encoded, 'base64').toString('utf8')
    expect(JSON.parse(decoded)).toEqual({ hello: 'world' })
  })

  it('handles primitive values', () => {
    const encoded = encodeMessageData(42)
    const decoded = Buffer.from(encoded, 'base64').toString('utf8')
    expect(JSON.parse(decoded)).toBe(42)
  })
})

// ---------------------------------------------------------------------------
// publishMessage — URL construction
// ---------------------------------------------------------------------------

describe('publishMessage — URL construction', () => {
  it('builds the correct Pub/Sub publish URL', async () => {
    let capturedUrl = ''
    const fetcher = async (url: string): Promise<Response> => {
      capturedUrl = url
      return new Response(JSON.stringify({ messageIds: ['1'] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    await publishMessage('localhost', 8085, 'my-project', 'my-topic', {}, undefined, fetcher)
    expect(capturedUrl).toBe(
      'http://localhost:8085/v1/projects/my-project/topics/my-topic:publish',
    )
  })

  it('URL-encodes the project and topic', async () => {
    let capturedUrl = ''
    const fetcher = async (url: string): Promise<Response> => {
      capturedUrl = url
      return new Response(JSON.stringify({ messageIds: ['1'] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    await publishMessage('localhost', 8085, 'proj/id', 'my/topic', {}, undefined, fetcher)
    expect(capturedUrl).toContain('proj%2Fid')
    expect(capturedUrl).toContain('my%2Ftopic')
  })
})

// ---------------------------------------------------------------------------
// publishMessage — body construction
// ---------------------------------------------------------------------------

describe('publishMessage — body construction', () => {
  it('sends message data as base64-encoded JSON', async () => {
    let capturedBody: unknown
    const fetcher = async (_url: string, init?: RequestInit): Promise<Response> => {
      capturedBody = JSON.parse(init?.body as string)
      return new Response(JSON.stringify({ messageIds: ['1'] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    await publishMessage('localhost', 8085, 'proj', 'topic', { foo: 'bar' }, undefined, fetcher)
    const body = capturedBody as { messages: Array<{ data: string; attributes?: unknown }> }
    const decoded = JSON.parse(Buffer.from(body.messages[0]!.data, 'base64').toString('utf8'))
    expect(decoded).toEqual({ foo: 'bar' })
    expect(body.messages[0]!.attributes).toBeUndefined()
  })

  it('includes attributes when provided', async () => {
    let capturedBody: unknown
    const fetcher = async (_url: string, init?: RequestInit): Promise<Response> => {
      capturedBody = JSON.parse(init?.body as string)
      return new Response(JSON.stringify({ messageIds: ['1'] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    await publishMessage('localhost', 8085, 'proj', 'topic', {}, { env: 'test' }, fetcher)
    const body = capturedBody as { messages: Array<{ attributes: Record<string, string> }> }
    expect(body.messages[0]!.attributes).toEqual({ env: 'test' })
  })

  it('omits attributes key when attributes object is empty', async () => {
    let capturedBody: unknown
    const fetcher = async (_url: string, init?: RequestInit): Promise<Response> => {
      capturedBody = JSON.parse(init?.body as string)
      return new Response(JSON.stringify({ messageIds: ['1'] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    await publishMessage('localhost', 8085, 'proj', 'topic', {}, {}, fetcher)
    const body = capturedBody as { messages: Array<{ attributes?: unknown }> }
    expect(body.messages[0]!.attributes).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// publishMessage — response handling
// ---------------------------------------------------------------------------

describe('publishMessage — response handling', () => {
  it('returns messageIds on success', async () => {
    const result = await publishMessage(
      'localhost', 8085, 'proj', 'topic', {},
      undefined, okFetcher({ messageIds: ['msg-1', 'msg-2'] }),
    )
    expect('data' in result).toBe(true)
    if ('data' in result) {
      expect(result.data.topic).toBe('topic')
      expect(result.data.messageIds).toEqual(['msg-1', 'msg-2'])
    }
  })

  it('returns empty messageIds when response has no messageIds field', async () => {
    const result = await publishMessage(
      'localhost', 8085, 'proj', 'topic', {},
      undefined, okFetcher({}),
    )
    expect('data' in result).toBe(true)
    if ('data' in result) {
      expect(result.data.messageIds).toEqual([])
    }
  })

  it('returns INVALID_INPUT on 404 (topic not found)', async () => {
    const result = await publishMessage(
      'localhost', 8085, 'proj', 'missing-topic', {},
      undefined, okFetcher({ message: 'Topic not found' }, 404),
    )
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error.code).toBe('INVALID_INPUT')
      expect(result.error.message).toContain('missing-topic')
    }
  })

  it('returns RULE_DENIED on 403', async () => {
    const result = await publishMessage(
      'localhost', 8085, 'proj', 'topic', {},
      undefined, okFetcher({ error: 'forbidden' }, 403),
    )
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error.code).toBe('RULE_DENIED')
    }
  })

  it('returns INVALID_INPUT on 500 with message', async () => {
    const result = await publishMessage(
      'localhost', 8085, 'proj', 'topic', {},
      undefined, okFetcher({ message: 'internal error' }, 500),
    )
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error.code).toBe('INVALID_INPUT')
      expect(result.error.message).toContain('internal error')
    }
  })

  it('returns EMULATOR_NOT_RUNNING on network error', async () => {
    const result = await publishMessage(
      'localhost', 8085, 'proj', 'topic', {},
      undefined, networkErrorFetcher(),
    )
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error.code).toBe('EMULATOR_NOT_RUNNING')
    }
  })
})
