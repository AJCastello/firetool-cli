import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { net } from './net.ts'
import type { TServiceName, TEmulatorStatus } from '../shared/types.ts'
import { FIREBASE_EMULATOR_NAME } from '../shared/emulators.ts'

/** Services that can run as emulators */
const ALL_SERVICES: TServiceName[] = [
  'auth',
  'firestore',
  'rtdb',
  'storage',
  'functions',
  'pubsub',
  'rules',
]

/** Default emulator ports per service (Firebase defaults) */
const DEFAULT_PORTS: Record<TServiceName, number> = {
  auth: 9099,
  firestore: 8080,
  rtdb: 9000,
  storage: 9199,
  functions: 5001,
  pubsub: 8085,
  rules: 8080,
}

/**
 * firebase.json emulators key names per service.
 *
 * Shared with the command builder so a suggested `firebase emulators:start`
 * cannot name an emulator that discovery would not have looked for.
 */
const SERVICE_EMULATOR_KEY = FIREBASE_EMULATOR_NAME

/** Environment variable names per service (host and port) */
const ENV_VARS: Record<TServiceName, { host: string; port: string } | null> = {
  auth: { host: 'FIREBASE_AUTH_EMULATOR_HOST', port: 'FIREBASE_AUTH_EMULATOR_PORT' },
  firestore: { host: 'FIRESTORE_EMULATOR_HOST', port: 'FIRESTORE_EMULATOR_PORT' },
  rtdb: { host: 'FIREBASE_DATABASE_EMULATOR_HOST', port: 'FIREBASE_DATABASE_EMULATOR_PORT' },
  storage: { host: 'FIREBASE_STORAGE_EMULATOR_HOST', port: 'FIREBASE_STORAGE_EMULATOR_PORT' },
  functions: { host: 'FIREBASE_FUNCTIONS_EMULATOR_HOST', port: 'FIREBASE_FUNCTIONS_EMULATOR_PORT' },
  pubsub: { host: 'PUBSUB_EMULATOR_HOST', port: 'PUBSUB_EMULATOR_PORT' },
  rules: null,
}

export type FirebaseJsonEmulators = Record<string, { host?: string; port?: number }>

export type DiscoveredContext = {
  cwd: string
  projectId: string | undefined
  /** All project aliases found in .firebaserc — length > 1 indicates a multi-project setup. */
  allProjectAliases: string[]
  firebaseJsonFound: boolean
  firebaseRcFound: boolean
  emulators: FirebaseJsonEmulators
}

/** Resolve firebase.json and .firebaserc from cwd upward */
function findFirebaseConfig(cwd: string): {
  firebaseJsonPath: string | null
  firebaseRcPath: string | null
  firebaseJson: { emulators?: FirebaseJsonEmulators } | null
  projectId: string | undefined
  allProjectAliases: string[]
} {
  const resolvedCwd = resolve(cwd)

  // Walk upward until root
  let dir = resolvedCwd
  let firebaseJsonPath: string | null = null
  let firebaseRcPath: string | null = null

  while (true) {
    const jsonPath = join(dir, 'firebase.json')
    const rcPath = join(dir, '.firebaserc')

    if (!firebaseJsonPath && existsSync(jsonPath)) {
      firebaseJsonPath = jsonPath
    }
    if (!firebaseRcPath && existsSync(rcPath)) {
      firebaseRcPath = rcPath
    }

    if (firebaseJsonPath && firebaseRcPath) break

    const parent = resolve(dir, '..')
    if (parent === dir) break // filesystem root
    dir = parent
  }

  let firebaseJson: { emulators?: FirebaseJsonEmulators } | null = null
  if (firebaseJsonPath) {
    try {
      firebaseJson = JSON.parse(readFileSync(firebaseJsonPath, 'utf8'))
    } catch {
      firebaseJson = null
    }
  }

  let projectId: string | undefined
  let allProjectAliases: string[] = []
  if (firebaseRcPath) {
    try {
      const rc = JSON.parse(readFileSync(firebaseRcPath, 'utf8')) as {
        projects?: Record<string, string>
      }
      const projects = rc.projects ?? {}
      allProjectAliases = Object.keys(projects)
      projectId = projects['default'] ?? Object.values(projects)[0]
    } catch {
      // ignore
    }
  }

  return { firebaseJsonPath, firebaseRcPath, firebaseJson, projectId, allProjectAliases }
}

/** Parse host from a combined "host:port" env var value (Firebase format) */
function parseHostPort(
  combined: string | undefined,
  portEnvName: string | undefined,
): { host: string | undefined; port: number | undefined } {
  if (!combined) return { host: undefined, port: undefined }

  // Firebase uses "host:port" in a single env var (e.g. FIRESTORE_EMULATOR_HOST=localhost:8080)
  if (combined.includes(':')) {
    const idx = combined.lastIndexOf(':')
    const host = combined.slice(0, idx)
    const port = parseInt(combined.slice(idx + 1), 10)
    return { host: host || undefined, port: isNaN(port) ? undefined : port }
  }

  // Some env vars are just the host; port is separate
  const portStr = portEnvName ? process.env[portEnvName] : undefined
  const port = portStr ? parseInt(portStr, 10) : undefined
  return { host: combined, port: isNaN(port ?? NaN) ? undefined : port }
}

/**
 * Discover the local Firebase emulator context from `cwd`.
 * Returns structured context used by policy and diagnostics.
 */
export async function discoverContext(cwd: string): Promise<{
  context: DiscoveredContext
  statuses: TEmulatorStatus[]
}> {
  const { firebaseJsonPath, firebaseRcPath, firebaseJson, projectId, allProjectAliases } =
    findFirebaseConfig(cwd)

  const emulators: FirebaseJsonEmulators = firebaseJson?.emulators ?? {}

  const context: DiscoveredContext = {
    cwd,
    projectId,
    allProjectAliases,
    firebaseJsonFound: firebaseJsonPath !== null,
    firebaseRcFound: firebaseRcPath !== null,
    emulators,
  }

  const statuses: TEmulatorStatus[] = await Promise.all(
    ALL_SERVICES.map((service) => resolveServiceStatus(service, context)),
  )

  return { context, statuses }
}

async function resolveServiceStatus(
  service: TServiceName,
  context: DiscoveredContext,
): Promise<TEmulatorStatus> {
  const emulatorKey = SERVICE_EMULATOR_KEY[service]
  const jsonEntry = context.emulators[emulatorKey] as
    | { host?: string; port?: number }
    | undefined

  // --- 1. Source: firebase.json ---
  if (jsonEntry !== undefined) {
    const host = jsonEntry.host ?? 'localhost'
    const port = jsonEntry.port ?? DEFAULT_PORTS[service]
    const running = await net.isPortOpen(host, port)
    return { service, configured: true, running, host, port, source: 'firebase.json' }
  }

  // --- 2. Source: environment variables ---
  const envSpec = ENV_VARS[service]
  if (envSpec) {
    const raw = process.env[envSpec.host]
    if (raw) {
      const { host: envHost, port: envPort } = parseHostPort(raw, envSpec.port)
      const host = envHost ?? 'localhost'
      const port = envPort ?? DEFAULT_PORTS[service]
      const running = await net.isPortOpen(host, port)
      return { service, configured: true, running, host, port, source: 'env' }
    }
  }

  // --- 3. Source: inferred (default port probe) ---
  const defaultPort = DEFAULT_PORTS[service]
  const running = await net.isPortOpen('localhost', defaultPort)
  if (running) {
    return {
      service,
      configured: false,
      running: true,
      host: 'localhost',
      port: defaultPort,
      source: 'inferred',
    }
  }

  // Not found in any source
  return { service, configured: false, running: false, source: 'inferred' }
}
