import type { TFiretoolError } from '../../shared/types.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FunctionCallResult = {
  url: string
  status: number
  result: unknown
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

function isHttpUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://')
}

/** Build the Functions emulator URL for a named function. */
export function buildFunctionUrl(
  host: string,
  port: number,
  projectId: string,
  functionName: string,
  region = 'us-central1',
): string {
  return `http://${host}:${port}/${projectId}/${region}/${functionName}`
}

// ---------------------------------------------------------------------------
// Call function
// ---------------------------------------------------------------------------

/**
 * Invoke a Firebase Function on the local emulator.
 *
 * - If `nameOrUrl` starts with "http", it is used verbatim as the endpoint.
 * - Otherwise the URL is built from the emulator host/port, projectId, and function name.
 */
export async function callFunction(
  host: string,
  port: number,
  projectId: string | undefined,
  nameOrUrl: string,
  data?: unknown,
  fetcher: Fetcher = fetch,
): Promise<{ data: FunctionCallResult } | { error: TFiretoolError }> {
  let url: string

  if (isHttpUrl(nameOrUrl)) {
    url = nameOrUrl
  } else {
    if (!projectId) {
      return {
        error: {
          code: 'CONTEXT_NOT_FOUND',
          message: 'Cannot resolve function URL: no Firebase project ID found.',
          hint: 'Add a .firebaserc with a default project or pass the full function URL directly.',
        },
      }
    }
    url = buildFunctionUrl(host, port, projectId, nameOrUrl)
  }

  try {
    const res = await fetcher(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: data ?? null }),
    })

    const contentType = res.headers.get('content-type') ?? ''
    let result: unknown
    if (contentType.includes('application/json')) {
      result = await res.json()
    } else {
      result = await res.text()
    }

    if (res.status === 401 || res.status === 403) {
      return {
        error: {
          code: 'RULE_DENIED',
          message: `Functions Emulator denied the request to "${url}" (HTTP ${res.status}).`,
          hint: 'Check the function authorization middleware or auth context.',
        },
      }
    }

    if (!res.ok) {
      return {
        error: {
          code: 'INVALID_INPUT',
          message: `Functions Emulator returned HTTP ${res.status} for "${url}".`,
          hint: 'Check the function name, URL, and payload.',
        },
      }
    }

    return { data: { url, status: res.status, result } }
  } catch (err) {
    return connectionError(err)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function connectionError(err: unknown): { error: TFiretoolError } {
  return {
    error: {
      code: 'EMULATOR_NOT_RUNNING',
      message: `Could not connect to Functions Emulator: ${err instanceof Error ? err.message : String(err)}`,
      hint: 'Ensure the Functions Emulator is running locally and retry.',
    },
  }
}
