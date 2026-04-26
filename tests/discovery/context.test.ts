import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { net } from '../../src/discovery/net.ts'
import { discoverContext } from '../../src/discovery/context.ts'

// Inject a fake net.isPortOpen so tests never open real TCP connections
const originalIsPortOpen = net.isPortOpen
beforeAll(() => {
  ;(net as { isPortOpen: typeof net.isPortOpen }).isPortOpen = async () => false
})
afterAll(() => {
  ;(net as { isPortOpen: typeof net.isPortOpen }).isPortOpen = originalIsPortOpen
})

const TMP = join(import.meta.dir, '__tmp_discovery__')

function setup(files: Record<string, string>): string {
  mkdirSync(TMP, { recursive: true })
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(TMP, name), content, 'utf8')
  }
  return TMP
}

function teardown() {
  rmSync(TMP, { recursive: true, force: true })
}

describe('discoverContext — firebase.json present', () => {
  afterAll(teardown)

  it('parses emulator ports from firebase.json', async () => {
    setup({
      'firebase.json': JSON.stringify({
        emulators: {
          auth: { port: 9099, host: 'localhost' },
          firestore: { port: 8080 },
        },
      }),
      '.firebaserc': JSON.stringify({ projects: { default: 'my-project' } }),
    })

    const { context, statuses } = await discoverContext(TMP)

    expect(context.firebaseJsonFound).toBe(true)
    expect(context.firebaseRcFound).toBe(true)
    expect(context.projectId).toBe('my-project')

    const auth = statuses.find((s) => s.service === 'auth')!
    expect(auth.configured).toBe(true)
    expect(auth.source).toBe('firebase.json')
    expect(auth.port).toBe(9099)
    expect(auth.host).toBe('localhost')

    const firestore = statuses.find((s) => s.service === 'firestore')!
    expect(firestore.configured).toBe(true)
    expect(firestore.source).toBe('firebase.json')
    expect(firestore.port).toBe(8080)
  })

  it('marks unconfigured services as not configured and not running', async () => {
    const { statuses } = await discoverContext(TMP)
    const rtdb = statuses.find((s) => s.service === 'rtdb')!
    expect(rtdb.configured).toBe(false)
    expect(rtdb.running).toBe(false)
  })

  it('marks configured services as not running when port is closed', async () => {
    const { statuses } = await discoverContext(TMP)
    const auth = statuses.find((s) => s.service === 'auth')!
    expect(auth.configured).toBe(true)
    expect(auth.running).toBe(false)
  })
})

describe('discoverContext — no firebase.json', () => {
  afterAll(teardown)

  it('returns all services as inferred+unconfigured when no config exists', async () => {
    setup({})
    const { context, statuses } = await discoverContext(TMP)

    // TMP folder has no config
    expect(context.firebaseJsonFound).toBe(false)
    expect(context.firebaseRcFound).toBe(false)

    for (const status of statuses) {
      expect(status.source).toBe('inferred')
      expect(status.configured).toBe(false)
    }
  })
})

describe('discoverContext — env var source', () => {
  afterAll(() => {
    delete process.env['FIRESTORE_EMULATOR_HOST']
    teardown()
  })

  it('uses FIRESTORE_EMULATOR_HOST env var when firebase.json is absent', async () => {
    setup({})
    process.env['FIRESTORE_EMULATOR_HOST'] = 'localhost:8080'

    const { statuses } = await discoverContext(TMP)
    const fs = statuses.find((s) => s.service === 'firestore')!
    expect(fs.configured).toBe(true)
    expect(fs.source).toBe('env')
    expect(fs.host).toBe('localhost')
    expect(fs.port).toBe(8080)

    delete process.env['FIRESTORE_EMULATOR_HOST']
  })
})

describe('discoverContext — running detection', () => {
  afterAll(teardown)

  it('marks service as running when net probe returns true', async () => {
    setup({
      'firebase.json': JSON.stringify({ emulators: { auth: { port: 9099 } } }),
    })

    // Temporarily make auth port open
    ;(net as { isPortOpen: typeof net.isPortOpen }).isPortOpen = async (
      _host: string,
      port: number,
    ) => port === 9099

    const { statuses } = await discoverContext(TMP)
    const auth = statuses.find((s) => s.service === 'auth')!
    expect(auth.running).toBe(true)

    // Restore fake
    ;(net as { isPortOpen: typeof net.isPortOpen }).isPortOpen = async () => false
  })
})
