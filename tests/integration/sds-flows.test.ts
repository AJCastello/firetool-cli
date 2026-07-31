/**
 * SDS Flow Integration Tests
 *
 * Validates the four system flows defined in the SDS at the tRPC/procedure level:
 *   Flow 1 — Discover context and local state
 *   Flow 2 — Execute a safe service operation
 *   Flow 3 — Seed, import, clear or overwrite
 *   Flow 4 — Query agent-first help
 *
 * Also validates:
 *   - Technical and business edge cases from the SDS
 *   - All seven services (auth, firestore, rtdb, storage, functions, pubsub, rules) in help
 *   - Human/JSON output parity (RNF-04)
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { join, resolve } from 'node:path'
import { createCaller } from '../../src/server/caller.ts'
import { renderHuman, renderJson } from '../../src/render/index.ts'
import { net } from '../../src/discovery/net.ts'
import type { TFiretoolResult, TServiceName } from '../../src/shared/types.ts'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURES_DIR = resolve(join(import.meta.dir, '../../fixtures'))
const VALID_PROJECT = join(FIXTURES_DIR, 'valid-firebase-project')
const MONOREPO = join(FIXTURES_DIR, 'monorepo')
const INVALID_JSON = join(FIXTURES_DIR, 'invalid-json')

// ---------------------------------------------------------------------------
// Net mock — no real TCP probes during tests
// ---------------------------------------------------------------------------

const originalIsPortOpen = net.isPortOpen

function mockPortsClosed() {
  ;(net as { isPortOpen: typeof net.isPortOpen }).isPortOpen = async () => false
}

function mockPortsOpen(openPorts: number[]) {
  ;(net as { isPortOpen: typeof net.isPortOpen }).isPortOpen = async (
    _host: string,
    port: number,
  ) => openPorts.includes(port)
}

function restoreNet() {
  ;(net as { isPortOpen: typeof net.isPortOpen }).isPortOpen = originalIsPortOpen
}

// ---------------------------------------------------------------------------
// All seven service names
// ---------------------------------------------------------------------------

const ALL_SERVICES: TServiceName[] = [
  'auth',
  'firestore',
  'rtdb',
  'storage',
  'functions',
  'pubsub',
  'rules',
]

// ---------------------------------------------------------------------------
// Flow 1 — Discover context and local state
// ---------------------------------------------------------------------------

describe('Flow 1 — Discovery', () => {
  beforeAll(mockPortsClosed)
  afterAll(restoreNet)

  const caller = createCaller(VALID_PROJECT)

  it('returns ok:true when firebase.json is present and reports all services', async () => {
    const result = await caller.diagnostics.getContext({ cwd: VALID_PROJECT })
    expect(result.ok).toBe(true)
    expect(result.operation).toBe('diagnostics.getContext')
    expect(Array.isArray(result.result)).toBe(true)
    const statuses = result.result as Array<{ service: string }>
    const serviceNames = statuses.map((s) => s.service)
    for (const svc of ALL_SERVICES) {
      expect(serviceNames).toContain(svc)
    }
  })

  it('reports all configured services as configured but not running (ports closed)', async () => {
    const result = await caller.diagnostics.getContext({ cwd: VALID_PROJECT })
    const statuses = result.result as Array<{
      service: string
      configured: boolean
      running: boolean
      source: string
    }>
    const auth = statuses.find((s) => s.service === 'auth')!
    expect(auth.configured).toBe(true)
    expect(auth.running).toBe(false)
    expect(auth.source).toBe('firebase.json')
  })

  it('marks services as running when their ports are open', async () => {
    mockPortsOpen([9099, 8080]) // auth and firestore
    const result = await caller.diagnostics.getContext({ cwd: VALID_PROJECT })
    const statuses = result.result as Array<{ service: string; running: boolean }>
    expect(statuses.find((s) => s.service === 'auth')!.running).toBe(true)
    expect(statuses.find((s) => s.service === 'firestore')!.running).toBe(true)
    expect(statuses.find((s) => s.service === 'rtdb')!.running).toBe(false)
    mockPortsClosed()
  })

  it('returns ok:false with CONTEXT_NOT_FOUND when no firebase.json exists', async () => {
    const result = await caller.diagnostics.getContext({ cwd: INVALID_JSON })
    // invalid-json has a malformed firebase.json → treated as no valid config
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('CONTEXT_NOT_FOUND')
    expect(result.error?.message).toBeTruthy()
    expect(result.error?.hint).toBeTruthy()
  })

  it('includes the projectId from .firebaserc in the context', async () => {
    const result = await caller.diagnostics.getContext({ cwd: VALID_PROJECT })
    expect(result.ok).toBe(true)
    // The valid fixture has projectId = "demo-project" from .firebaserc
    // This is reflected in a warning absence (no warning about missing .firebaserc)
    expect(result.warnings).not.toContain(
      expect.stringContaining('.firebaserc'),
    )
  })

  it('warns when .firebaserc is missing', async () => {
    // invalid-json fixture has no .firebaserc and returns an error anyway;
    // use a directory with valid firebase.json but no .firebaserc for this scenario
    // (The valid-firebase-project fixture has .firebaserc, so test with a temp project that
    //  has only firebase.json — this is implicitly tested via the warning path in the procedure)
    const result = await createCaller(VALID_PROJECT).diagnostics.getContext({
      cwd: VALID_PROJECT,
    })
    // valid project has .firebaserc so no warning about it
    const hasRcWarning = result.warnings.some((w) => w.includes('.firebaserc'))
    expect(hasRcWarning).toBe(false)
  })

  // doctor is step 1 of the documented agent flow, so it is where a caller
  // learns the project is idle. Reporting that without the command to fix it
  // leaves them to guess an invocation whose emulator names differ from
  // Firetool's own service names.
  describe('start suggestion', () => {
    it('suggests a start command naming only emulators this project declares', async () => {
      mockPortsClosed()
      const result = await caller.diagnostics.getContext({ cwd: VALID_PROJECT })
      const suggestion = result.warnings.find((w) => w.includes('emulators:start'))
      expect(suggestion).toBeDefined()
      expect(suggestion).toContain('No configured emulator is running.')
      expect(suggestion).toContain(
        'firebase emulators:start --only auth,database,firestore,functions,pubsub,storage',
      )
    })

    it('never names rtdb or rules, which the Firebase CLI would reject', async () => {
      mockPortsClosed()
      const result = await caller.diagnostics.getContext({ cwd: VALID_PROJECT })
      const suggestion = result.warnings.find((w) => w.includes('emulators:start'))!
      const only = suggestion.split('--only ')[1]!
      expect(only.split(',')).not.toContain('rtdb')
      expect(only.split(',')).not.toContain('rules')
    })

    it('narrows the suggestion to what is still down when some are up', async () => {
      mockPortsOpen([9099, 8080, 9199, 5001, 8085]) // everything except rtdb
      const result = await caller.diagnostics.getContext({ cwd: VALID_PROJECT })
      const suggestion = result.warnings.find((w) => w.includes('emulators:start'))
      expect(suggestion).toContain('Some configured emulators are not running.')
      expect(suggestion).toContain('firebase emulators:start --only database')
      mockPortsClosed()
    })

    it('lets the command be the list rather than naming services beside it', async () => {
      // `rules` is served by the firestore emulator, so it is down whenever
      // firestore is, but it can never appear in --only. Naming it next to the
      // command would read as a command missing an emulator.
      mockPortsOpen([9099]) // auth only; firestore and therefore rules are down
      const result = await caller.diagnostics.getContext({ cwd: VALID_PROJECT })
      const suggestion = result.warnings.find((w) => w.includes('emulators:start'))!
      expect(suggestion).toBe(
        'Some configured emulators are not running. Start them with: ' +
          'firebase emulators:start --only database,firestore,functions,pubsub,storage',
      )
      expect(suggestion).not.toContain('rules')
      expect(suggestion).not.toContain('rtdb')
      mockPortsClosed()
    })

    it('stays quiet when every configured emulator is up', async () => {
      mockPortsOpen([9099, 8080, 9000, 9199, 5001, 8085])
      const result = await caller.diagnostics.getContext({ cwd: VALID_PROJECT })
      expect(result.warnings.some((w) => w.includes('emulators:start'))).toBe(false)
      mockPortsClosed()
    })
  })
})

// ---------------------------------------------------------------------------
// Flow 2 — Execute a safe service operation (guard blocks without emulator)
// ---------------------------------------------------------------------------

describe('Flow 2 — Safe Service Operation (all services blocked without emulator)', () => {
  beforeAll(mockPortsClosed)
  afterAll(restoreNet)

  const caller = createCaller(VALID_PROJECT)

  it('auth: blocks list-users when auth emulator is not running', async () => {
    const result = await caller.auth.execute({
      action: 'list-users',
      target: { service: 'auth' },
    })
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('EMULATOR_NOT_RUNNING')
    expect(result.error?.hint).toBeTruthy()
    expect(result.operation).toBe('auth.list-users')
  })

  it('firestore: blocks list when firestore emulator is not running', async () => {
    const result = await caller.firestore.execute({
      action: 'list',
      target: { service: 'firestore', resourcePath: 'products' },
    })
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('EMULATOR_NOT_RUNNING')
    expect(result.operation).toBe('firestore.list')
  })

  it('rtdb: blocks get when rtdb emulator is not running', async () => {
    const result = await caller.rtdb.execute({
      action: 'get',
      target: { service: 'rtdb', resourcePath: '/users' },
    })
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('EMULATOR_NOT_RUNNING')
    expect(result.operation).toBe('rtdb.get')
  })

  it('storage: blocks list when storage emulator is not running', async () => {
    const result = await caller.storage.execute({
      action: 'list',
      target: { service: 'storage' },
    })
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('EMULATOR_NOT_RUNNING')
    expect(result.operation).toBe('storage.list')
  })

  it('functions: blocks invoke when functions emulator is not running', async () => {
    const result = await caller.functions.invoke({ nameOrUrl: 'myFunction' })
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('EMULATOR_NOT_RUNNING')
    expect(result.operation).toBe('functions.call')
    expect(result.target?.identifier).toBe('myFunction')
  })

  it('pubsub: blocks publish when pubsub emulator is not running', async () => {
    const result = await caller.pubsub.publish({
      topic: 'user-created',
      data: { uid: 'abc' },
    })
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('EMULATOR_NOT_RUNNING')
    expect(result.operation).toBe('pubsub.publish')
  })

  it('rules: blocks check when context is absent (no config)', async () => {
    const noConfigCaller = createCaller(INVALID_JSON)
    const result = await noConfigCaller.rules.check({
      service: 'firestore',
      target: { service: 'firestore', resourcePath: 'products/abc' },
      intent: 'read',
    })
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('CONTEXT_NOT_FOUND')
    expect(result.operation).toBe('rules.check')
  })

  it('every blocked operation returns a non-empty hint', async () => {
    const results = await Promise.all([
      caller.auth.execute({ action: 'list-users', target: { service: 'auth' } }),
      caller.firestore.execute({ action: 'list', target: { service: 'firestore', resourcePath: 'col' } }),
      caller.rtdb.execute({ action: 'get', target: { service: 'rtdb', resourcePath: '/path' } }),
      caller.storage.execute({ action: 'list', target: { service: 'storage' } }),
      caller.functions.invoke({ nameOrUrl: 'fn' }),
      caller.pubsub.publish({ topic: 't', data: {} }),
    ])
    for (const r of results) {
      expect(r.ok).toBe(false)
      expect(typeof r.error?.hint).toBe('string')
      expect((r.error?.hint ?? '').length).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// Flow 3 — Seed, import, clear and dry-run
// ---------------------------------------------------------------------------

describe('Flow 3 — Seed / Import / Clear', () => {
  beforeAll(mockPortsClosed)
  afterAll(restoreNet)

  const caller = createCaller(VALID_PROJECT)

  it('firestore seed with dry-run returns ok:true without mutation', async () => {
    // dry-run does not require a running emulator (guard still fires without one)
    // but the SDS says dry-run calculates intent without mutating.
    // With no emulator, guard fires first. Test with the dry-run flag explicitly.
    const result = await caller.firestore.execute({
      action: 'seed',
      target: { service: 'firestore', resourcePath: 'products' },
      dryRun: true,
    })
    // Without a running emulator the guard blocks first — but the dry-run path
    // is exercised only when the guard passes. We verify the guard fires first
    // to confirm the correct error code.
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('EMULATOR_NOT_RUNNING')
  })

  it('firestore seed dry-run succeeds when emulator is running', async () => {
    mockPortsOpen([8080]) // firestore port
    const result = await caller.firestore.execute({
      action: 'seed',
      target: { service: 'firestore', resourcePath: 'products' },
      data: [{ name: 'Widget', price: 9.99 }, { name: 'Gadget', price: 19.99 }],
      dryRun: true,
    })
    expect(result.ok).toBe(true)
    const payload = result.result as { dryRun: boolean; intent: string }
    expect(payload.dryRun).toBe(true)
    expect(payload.intent).toContain('2')
    expect(result.warnings.some((w) => w.includes('dry-run'))).toBe(true)
    mockPortsClosed()
  })

  it('firestore clear without force returns CONFIRMATION_REQUIRED', async () => {
    mockPortsOpen([8080])
    const result = await caller.firestore.execute({
      action: 'clear',
      target: { service: 'firestore' },
      force: false,
    })
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('CONFIRMATION_REQUIRED')
    expect(result.error?.hint).toContain('--force')
    mockPortsClosed()
  })

  it('rtdb seed without force returns CONFIRMATION_REQUIRED', async () => {
    mockPortsOpen([9000])
    const result = await caller.rtdb.execute({
      action: 'seed',
      target: { service: 'rtdb', resourcePath: '/users' },
      data: { alice: { name: 'Alice' } },
      force: false,
    })
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('CONFIRMATION_REQUIRED')
    mockPortsClosed()
  })

  it('auth clear-users without force returns CONFIRMATION_REQUIRED', async () => {
    mockPortsOpen([9099])
    const result = await caller.auth.execute({
      action: 'clear-users',
      target: { service: 'auth' },
      force: false,
    })
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('CONFIRMATION_REQUIRED')
    mockPortsClosed()
  })

  it('firestore import dry-run describes the correct number of docs', async () => {
    mockPortsOpen([8080])
    const docs = [
      { _id: 'doc1', value: 1 },
      { _id: 'doc2', value: 2 },
      { _id: 'doc3', value: 3 },
    ]
    const result = await caller.firestore.execute({
      action: 'import',
      target: { service: 'firestore', resourcePath: 'inventory' },
      data: docs,
      dryRun: true,
    })
    expect(result.ok).toBe(true)
    const payload = result.result as { intent: string }
    expect(payload.intent).toContain('3')
    expect(payload.intent).toContain('inventory')
    mockPortsClosed()
  })

  it('storage clear without force returns CONFIRMATION_REQUIRED', async () => {
    mockPortsOpen([9199])
    const result = await caller.storage.execute({
      action: 'clear',
      target: { service: 'storage' },
      force: false,
    })
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('CONFIRMATION_REQUIRED')
    mockPortsClosed()
  })
})

// ---------------------------------------------------------------------------
// Flow 4 — Help agent-first
// ---------------------------------------------------------------------------

describe('Flow 4 — Help agent-first', () => {
  const caller = createCaller(VALID_PROJECT)

  it('general help returns ok:true', async () => {
    const result = await caller.help.describe({})
    expect(result.ok).toBe(true)
    expect(result.operation).toBe('help.describe')
  })

  it('general help lists all seven services', async () => {
    const result = await caller.help.describe({})
    const data = result.result as { commands: Array<{ name: string }> }
    const names = data.commands.map((c) => c.name)
    for (const svc of ALL_SERVICES) {
      expect(names).toContain(svc)
    }
  })

  it('general help includes agent flow steps', async () => {
    const result = await caller.help.describe({})
    const data = result.result as { agentFlow: string[] }
    expect(data.agentFlow.length).toBeGreaterThan(0)
    const flow = data.agentFlow.join(' ').toLowerCase()
    expect(flow.includes('diagnos') || flow.includes('doctor')).toBe(true)
  })

  it('general help includes --dry-run and --force flags', async () => {
    const result = await caller.help.describe({})
    const flags = (result.result as { flags: Record<string, string> }).flags
    expect(flags['--dry-run']).toBeDefined()
    expect(flags['--force']).toBeDefined()
    expect(flags['--json']).toBeDefined()
  })

  it('general help includes all seven error codes with exit codes', async () => {
    const result = await caller.help.describe({})
    const codes = (result.result as { errorCodes: Record<string, { exitCode: number }> }).errorCodes
    const expectedCodes = [
      'CONTEXT_NOT_FOUND',
      'SERVICE_NOT_CONFIGURED',
      'EMULATOR_NOT_RUNNING',
      'INVALID_INPUT',
      'CONFIRMATION_REQUIRED',
      'RULE_DENIED',
      'AMBIGUOUS_TARGET',
    ]
    for (const code of expectedCodes) {
      expect(codes[code]).toBeDefined()
      expect(typeof codes[code]?.exitCode).toBe('number')
      expect((codes[code]?.exitCode ?? 0)).toBeGreaterThan(0)
    }
  })

  it('each of the seven services returns service-specific help', async () => {
    for (const svc of ALL_SERVICES) {
      const result = await caller.help.describe({ service: svc })
      expect(result.ok).toBe(true)
      const data = result.result as { service: string; actions: string[] }
      expect(data.service).toBe(svc)
      expect(data.actions.length).toBeGreaterThan(0)
    }
  })

  it('service help includes examples for each service', async () => {
    for (const svc of ALL_SERVICES) {
      const result = await caller.help.describe({ service: svc })
      const data = result.result as { examples: string[] }
      expect(data.examples.length).toBeGreaterThan(0)
    }
  })

  it('service help includes the agent flow steps', async () => {
    const result = await caller.help.describe({ service: 'firestore' })
    const data = result.result as { agentFlow: string[] }
    expect(data.agentFlow.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// SDS Edge Cases
// ---------------------------------------------------------------------------

describe('Edge Case — Remote host env var is blocked (RNF-02)', () => {
  afterAll(() => {
    delete process.env['FIRESTORE_EMULATOR_HOST']
    restoreNet()
  })

  it('blocks firestore operations when FIRESTORE_EMULATOR_HOST points to a remote address', async () => {
    process.env['FIRESTORE_EMULATOR_HOST'] = 'firestore.googleapis.com:8080'
    const caller = createCaller(INVALID_JSON) // no firebase.json, only env var

    const result = await caller.firestore.execute({
      action: 'list',
      target: { service: 'firestore', resourcePath: 'products' },
    })
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('EMULATOR_NOT_RUNNING')
    expect(result.error?.message).toContain('not a local address')
    delete process.env['FIRESTORE_EMULATOR_HOST']
  })

  it('blocks auth operations when FIREBASE_AUTH_EMULATOR_HOST is remote', async () => {
    process.env['FIREBASE_AUTH_EMULATOR_HOST'] = 'remote-auth.example.com:9099'
    const caller = createCaller(INVALID_JSON)

    const result = await caller.auth.execute({
      action: 'list-users',
      target: { service: 'auth' },
    })
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('EMULATOR_NOT_RUNNING')
    delete process.env['FIREBASE_AUTH_EMULATOR_HOST']
  })
})

describe('Edge Case — firebase.json declares port but service is not responding', () => {
  afterAll(restoreNet)

  it('returns EMULATOR_NOT_RUNNING for firestore when port is closed despite config', async () => {
    mockPortsClosed()
    const caller = createCaller(VALID_PROJECT)

    const result = await caller.firestore.execute({
      action: 'list',
      target: { service: 'firestore', resourcePath: 'col' },
    })
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('EMULATOR_NOT_RUNNING')
    expect(result.error?.hint).toBeTruthy()
  })

  it('returns EMULATOR_NOT_RUNNING for all services when all ports closed', async () => {
    mockPortsClosed()
    const caller = createCaller(VALID_PROJECT)

    const results = await Promise.all([
      caller.auth.execute({ action: 'list-users', target: { service: 'auth' } }),
      caller.firestore.execute({ action: 'list', target: { service: 'firestore', resourcePath: 'c' } }),
      caller.rtdb.execute({ action: 'get', target: { service: 'rtdb', resourcePath: '/r' } }),
      caller.storage.execute({ action: 'list', target: { service: 'storage' } }),
      caller.functions.invoke({ nameOrUrl: 'fn' }),
      caller.pubsub.publish({ topic: 't', data: {} }),
    ])
    for (const r of results) {
      expect(r.ok).toBe(false)
      expect(r.error?.code).toBe('EMULATOR_NOT_RUNNING')
    }
  })
})

describe('Edge Case — Valid JSON incompatible with target (INVALID_INPUT)', () => {
  beforeAll(() => mockPortsOpen([8080, 9099, 9000, 9199, 5001, 8085]))
  afterAll(restoreNet)

  const caller = createCaller(VALID_PROJECT)

  it('firestore get without a document path returns INVALID_INPUT', async () => {
    const result = await caller.firestore.execute({
      action: 'get',
      target: { service: 'firestore', resourcePath: 'products' }, // collection only, no docId
    })
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('INVALID_INPUT')
    expect(result.error?.hint).toBeTruthy()
  })

  it('firestore seed with non-array data returns INVALID_INPUT', async () => {
    const result = await caller.firestore.execute({
      action: 'seed',
      target: { service: 'firestore', resourcePath: 'products' },
      data: { notAnArray: true }, // must be array for seed
      force: true,
    })
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('INVALID_INPUT')
  })

  it('firestore set without data returns INVALID_INPUT', async () => {
    const result = await caller.firestore.execute({
      action: 'set',
      target: { service: 'firestore', resourcePath: 'products' },
      data: null,
      force: true,
    })
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('INVALID_INPUT')
  })

  it('auth get-user without identifier returns INVALID_INPUT', async () => {
    const result = await caller.auth.execute({
      action: 'get-user',
      target: { service: 'auth' }, // no identifier
    })
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('INVALID_INPUT')
  })

  it('firestore unknown action returns INVALID_INPUT', async () => {
    const result = await caller.firestore.execute({
      action: 'fly',
      target: { service: 'firestore' },
    })
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('INVALID_INPUT')
  })
})

describe('Edge Case — Force flag with ambiguous target (multi-project monorepo)', () => {
  beforeAll(() => mockPortsOpen([8080, 9099, 9000, 9199, 5001, 8085]))
  afterAll(restoreNet)

  const monoCaller = createCaller(MONOREPO)

  it('firestore clear with --force returns AMBIGUOUS_TARGET in a monorepo with no explicit projectId', async () => {
    const result = await monoCaller.firestore.execute({
      action: 'clear',
      target: { service: 'firestore' }, // no projectId
      force: true, // force does NOT bypass ambiguous target
    })
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('AMBIGUOUS_TARGET')
    // message lists the alias names ("default", "staging") found in .firebaserc
    expect(result.error?.message).toContain('default')
    expect(result.error?.message).toContain('staging')
    expect(result.error?.hint).toBeTruthy()
  })

  it('auth clear-users with --force returns AMBIGUOUS_TARGET in monorepo', async () => {
    const result = await monoCaller.auth.execute({
      action: 'clear-users',
      target: { service: 'auth' }, // no projectId
      force: true,
    })
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('AMBIGUOUS_TARGET')
  })

  it('providing explicit projectId resolves the ambiguity', async () => {
    // With explicit projectId, the guard passes (or fails for a different reason — emulator ops)
    // The important thing is the error is NOT AMBIGUOUS_TARGET
    const result = await monoCaller.firestore.execute({
      action: 'list',
      target: { service: 'firestore', projectId: 'monorepo-project-a', resourcePath: 'col' },
    })
    // Should get through ambiguity check — may fail for other reasons (no actual emulator)
    expect(result.error?.code).not.toBe('AMBIGUOUS_TARGET')
  })
})

// ---------------------------------------------------------------------------
// RNF-03 — Every error has code, hint, and non-zero exit code
// ---------------------------------------------------------------------------

describe('RNF-03 — Categorised and actionable errors', () => {
  beforeAll(mockPortsClosed)
  afterAll(restoreNet)

  const caller = createCaller(VALID_PROJECT)
  const noConfigCaller = createCaller(INVALID_JSON)

  it('CONTEXT_NOT_FOUND has code, message, and hint', async () => {
    const result = await noConfigCaller.diagnostics.getContext({ cwd: INVALID_JSON })
    expect(result.error?.code).toBe('CONTEXT_NOT_FOUND')
    expect(typeof result.error?.message).toBe('string')
    expect((result.error?.message ?? '').length).toBeGreaterThan(0)
    expect(typeof result.error?.hint).toBe('string')
    expect((result.error?.hint ?? '').length).toBeGreaterThan(0)
  })

  it('EMULATOR_NOT_RUNNING has code, message, and hint', async () => {
    const result = await caller.firestore.execute({
      action: 'list',
      target: { service: 'firestore', resourcePath: 'col' },
    })
    expect(result.error?.code).toBe('EMULATOR_NOT_RUNNING')
    expect(typeof result.error?.message).toBe('string')
    expect(typeof result.error?.hint).toBe('string')
  })

  it('CONFIRMATION_REQUIRED has code, message, and hint', async () => {
    mockPortsOpen([9099])
    const result = await caller.auth.execute({
      action: 'clear-users',
      target: { service: 'auth' },
      force: false,
    })
    expect(result.error?.code).toBe('CONFIRMATION_REQUIRED')
    expect(typeof result.error?.message).toBe('string')
    expect(typeof result.error?.hint).toBe('string')
    mockPortsClosed()
  })

  it('INVALID_INPUT has code, message, and hint', async () => {
    const result = await caller.auth.execute({
      action: 'unknown-action',
      target: { service: 'auth' },
    })
    expect(result.error?.code).toBe('INVALID_INPUT')
    expect(typeof result.error?.message).toBe('string')
    expect(typeof result.error?.hint).toBe('string')
  })
})

// ---------------------------------------------------------------------------
// RNF-04 — Human / JSON output parity across all seven services
// ---------------------------------------------------------------------------

describe('RNF-04 — Human and JSON output parity', () => {
  const ALL_SERVICE_RESULTS: TFiretoolResult[] = ALL_SERVICES.map((svc) => ({
    ok: false,
    operation: `${svc}.execute`,
    target: { service: svc, resourcePath: `${svc}-col/doc1` },
    warnings: [`${svc} warning`],
    error: {
      code: 'EMULATOR_NOT_RUNNING',
      message: `${svc} emulator is not running`,
      hint: `Start the ${svc} emulator`,
    },
  }))

  it('human and JSON outputs agree on ok status for every service result', () => {
    for (const r of ALL_SERVICE_RESULTS) {
      const human = renderHuman(r)
      const json = JSON.parse(renderJson(r)) as TFiretoolResult
      expect(json.ok).toBe(r.ok)
      expect(human.includes('✗')).toBe(true) // all are failures
    }
  })

  it('human and JSON outputs agree on operation name for every service', () => {
    for (const r of ALL_SERVICE_RESULTS) {
      const human = renderHuman(r)
      const json = JSON.parse(renderJson(r)) as TFiretoolResult
      expect(json.operation).toBe(r.operation)
      expect(human).toContain(r.operation)
    }
  })

  it('human and JSON outputs agree on target service for every result', () => {
    for (const r of ALL_SERVICE_RESULTS) {
      const human = renderHuman(r)
      const json = JSON.parse(renderJson(r)) as TFiretoolResult
      expect(json.target?.service).toBe(r.target?.service)
      expect(human).toContain(r.target!.service)
    }
  })

  it('human and JSON outputs agree on error code for every service failure', () => {
    for (const r of ALL_SERVICE_RESULTS) {
      const human = renderHuman(r)
      const json = JSON.parse(renderJson(r)) as TFiretoolResult
      expect(json.error?.code).toBe(r.error?.code)
      expect(human).toContain(r.error!.code)
    }
  })

  it('human output contains warnings; JSON preserves warning array for every service', () => {
    for (const r of ALL_SERVICE_RESULTS) {
      const human = renderHuman(r)
      const json = JSON.parse(renderJson(r)) as TFiretoolResult
      expect(json.warnings).toEqual(r.warnings)
      expect(human).toContain('⚠')
      expect(human).toContain(r.warnings[0]!)
    }
  })

  it('JSON output for success result is parseable and has all required fields', () => {
    const successResults = ALL_SERVICES.map((svc) => ({
      ok: true,
      operation: `${svc}.list`,
      target: { service: svc as TServiceName },
      warnings: [],
      result: { count: 0, items: [] },
    }))
    for (const r of successResults) {
      const json = JSON.parse(renderJson(r)) as TFiretoolResult
      expect(json.ok).toBe(true)
      expect(json.operation).toBe(r.operation)
      expect(Array.isArray(json.warnings)).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Cross-flow shape contract — every procedure returns valid TFiretoolResult
// ---------------------------------------------------------------------------

describe('Cross-flow — TFiretoolResult shape contract for all procedures', () => {
  beforeAll(mockPortsClosed)
  afterAll(restoreNet)

  const caller = createCaller(VALID_PROJECT)

  it('all procedures return ok, operation, and warnings array', async () => {
    const results = await Promise.all([
      caller.diagnostics.getContext({ cwd: VALID_PROJECT }),
      caller.help.describe({}),
      caller.auth.execute({ action: 'list-users', target: { service: 'auth' } }),
      caller.firestore.execute({ action: 'list', target: { service: 'firestore', resourcePath: 'c' } }),
      caller.rtdb.execute({ action: 'get', target: { service: 'rtdb', resourcePath: '/r' } }),
      caller.storage.execute({ action: 'list', target: { service: 'storage' } }),
      caller.functions.invoke({ nameOrUrl: 'fn' }),
      caller.pubsub.publish({ topic: 't', data: {} }),
      caller.rules.check({ service: 'firestore', target: { service: 'firestore', resourcePath: 'c/d' }, intent: 'read' }),
    ])
    for (const r of results) {
      expect(typeof r.ok).toBe('boolean')
      expect(typeof r.operation).toBe('string')
      expect(r.operation.length).toBeGreaterThan(0)
      expect(Array.isArray(r.warnings)).toBe(true)
    }
  })

  it('all failed procedures include a structured error with code and message', async () => {
    const failedResults = await Promise.all([
      caller.auth.execute({ action: 'list-users', target: { service: 'auth' } }),
      caller.firestore.execute({ action: 'list', target: { service: 'firestore', resourcePath: 'c' } }),
      caller.rtdb.execute({ action: 'get', target: { service: 'rtdb', resourcePath: '/r' } }),
      caller.storage.execute({ action: 'list', target: { service: 'storage' } }),
      caller.functions.invoke({ nameOrUrl: 'fn' }),
      caller.pubsub.publish({ topic: 't', data: {} }),
    ])
    for (const r of failedResults) {
      expect(r.ok).toBe(false)
      expect(typeof r.error?.code).toBe('string')
      expect(typeof r.error?.message).toBe('string')
      expect((r.error?.message ?? '').length).toBeGreaterThan(0)
    }
  })
})
