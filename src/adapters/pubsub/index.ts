import type { TFiretoolError } from '../../shared/types.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PubSubPublishResult = {
  topic: string
  messageIds: string[]
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

function pubsubBase(host: string, port: number): string {
  return `http://${host}:${port}`
}

/** Base64-encode a value as JSON for a Pub/Sub message payload. */
export function encodeMessageData(data: unknown): string {
  const json = JSON.stringify(data)
  return Buffer.from(json, 'utf8').toString('base64')
}

// ---------------------------------------------------------------------------
// Publish message
// ---------------------------------------------------------------------------

/**
 * Publish a message to a Pub/Sub topic on the local emulator.
 *
 * Message data is JSON-serialised and base64-encoded per the Pub/Sub REST API spec.
 */
export async function publishMessage(
  host: string,
  port: number,
  projectId: string,
  topic: string,
  data: unknown,
  attributes?: Record<string, string>,
  fetcher: Fetcher = fetch,
): Promise<{ data: PubSubPublishResult } | { error: TFiretoolError }> {
  const base = pubsubBase(host, port)
  const url = `${base}/v1/projects/${encodeURIComponent(projectId)}/topics/${encodeURIComponent(topic)}:publish`

  const message: Record<string, unknown> = { data: encodeMessageData(data) }
  if (attributes && Object.keys(attributes).length > 0) {
    message.attributes = attributes
  }

  try {
    const res = await fetcher(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [message] }),
    })

    if (res.status === 401 || res.status === 403) {
      return {
        error: {
          code: 'RULE_DENIED',
          message: `Pub/Sub Emulator denied the publish to topic "${topic}" (HTTP ${res.status}).`,
          hint: 'Check your Pub/Sub emulator configuration or IAM settings.',
        },
      }
    }

    if (res.status === 404) {
      return {
        error: {
          code: 'INVALID_INPUT',
          message: `Topic "${topic}" not found in project "${projectId}".`,
          hint: 'Create the topic first or check the topic name and project ID.',
        },
      }
    }

    if (!res.ok) {
      const errBody = await safeJson(res)
      const errMsg = extractErrorMessage(errBody, res.status)
      return {
        error: {
          code: 'INVALID_INPUT',
          message: `Pub/Sub Emulator returned an error publishing to "${topic}": ${errMsg}`,
          hint: 'Check the topic name, project ID, and message data.',
        },
      }
    }

    const body = (await res.json()) as { messageIds?: string[] }
    return { data: { topic, messageIds: body.messageIds ?? [] } }
  } catch (err) {
    return connectionError(err)
  }
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
  if (body !== null && typeof body === 'object') {
    const b = body as Record<string, unknown>
    if (typeof b['message'] === 'string') return b['message']
    if (b['error'] && typeof b['error'] === 'object') {
      const e = b['error'] as Record<string, unknown>
      if (typeof e['message'] === 'string') return e['message']
    }
  }
  return `HTTP ${status}`
}

function connectionError(err: unknown): { error: TFiretoolError } {
  return {
    error: {
      code: 'EMULATOR_NOT_RUNNING',
      message: `Could not connect to Pub/Sub Emulator: ${err instanceof Error ? err.message : String(err)}`,
      hint: 'Ensure the Pub/Sub Emulator is running locally and retry.',
    },
  }
}
