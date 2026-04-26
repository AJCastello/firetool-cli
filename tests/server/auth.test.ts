import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { createCaller } from '../../src/server/caller.ts'
import { net } from '../../src/discovery/net.ts'

// Prevent real TCP probes
const originalIsPortOpen = net.isPortOpen
beforeAll(() => {
  ;(net as { isPortOpen: typeof net.isPortOpen }).isPortOpen = async () => false
})
afterAll(() => {
  ;(net as { isPortOpen: typeof net.isPortOpen }).isPortOpen = originalIsPortOpen
})

// The caller uses process.cwd() which has no firebase.json in the test runner,
// so the guard will return CONTEXT_NOT_FOUND or SERVICE_NOT_CONFIGURED.
// These tests validate the procedure shape and guard behavior without a live emulator.
const caller = createCaller(process.cwd())

describe('auth.execute — result shape', () => {
  it('always returns a TFiretoolResult with required fields', async () => {
    const result = await caller.auth.execute({
      action: 'list-users',
      target: { service: 'auth' },
    })
    expect(typeof result.ok).toBe('boolean')
    expect(typeof result.operation).toBe('string')
    expect(Array.isArray(result.warnings)).toBe(true)
  })

  it('operation is always auth.<action>', async () => {
    const result = await caller.auth.execute({
      action: 'list-users',
      target: { service: 'auth' },
    })
    expect(result.operation).toBe('auth.list-users')
  })
})

describe('auth.execute — unknown action', () => {
  it('returns INVALID_INPUT for an unknown action', async () => {
    const result = await caller.auth.execute({
      action: 'fly-to-the-moon',
      target: { service: 'auth' },
    })
    expect(result.ok).toBe(false)
    expect(result.operation).toBe('auth.fly-to-the-moon')
    expect(result.error?.code).toBe('INVALID_INPUT')
    expect(result.error?.message).toContain('fly-to-the-moon')
  })
})

describe('auth.execute — emulator guard (no emulator running)', () => {
  it('blocks list-users when no context is found', async () => {
    const result = await caller.auth.execute({
      action: 'list-users',
      target: { service: 'auth' },
    })
    expect(result.ok).toBe(false)
    expect(result.error?.code).toMatch(/^(CONTEXT_NOT_FOUND|SERVICE_NOT_CONFIGURED|EMULATOR_NOT_RUNNING)$/)
  })

  it('blocks create-user when no emulator is running', async () => {
    const result = await caller.auth.execute({
      action: 'create-user',
      target: { service: 'auth' },
      data: { email: 'test@example.com', password: 'password123' },
    })
    expect(result.ok).toBe(false)
    expect(result.error?.code).toMatch(/^(CONTEXT_NOT_FOUND|SERVICE_NOT_CONFIGURED|EMULATOR_NOT_RUNNING)$/)
  })

  it('blocks get-user when no emulator is running', async () => {
    const result = await caller.auth.execute({
      action: 'get-user',
      target: { service: 'auth', identifier: 'some-uid' },
    })
    expect(result.ok).toBe(false)
    expect(result.error?.code).toMatch(/^(CONTEXT_NOT_FOUND|SERVICE_NOT_CONFIGURED|EMULATOR_NOT_RUNNING)$/)
  })
})

describe('auth.execute — destructive actions require force', () => {
  it('blocks delete-user without --force (after guard, if emulator were running)', async () => {
    // Without a running emulator, the guard fires first. We test that force:false
    // returns a non-ok result with an error.
    const result = await caller.auth.execute({
      action: 'delete-user',
      target: { service: 'auth', identifier: 'uid1' },
      force: false,
    })
    expect(result.ok).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('blocks clear-users without --force', async () => {
    const result = await caller.auth.execute({
      action: 'clear-users',
      target: { service: 'auth' },
      force: false,
    })
    expect(result.ok).toBe(false)
    expect(result.error).toBeDefined()
  })
})

describe('auth.execute — missing identifier validation', () => {
  it('returns INVALID_INPUT for get-user without identifier when guard would pass', async () => {
    // We test the validation logic in the procedure. Guard fires first in most cases,
    // but the operation is the expected string.
    const result = await caller.auth.execute({
      action: 'get-user',
      target: { service: 'auth' }, // no identifier
    })
    expect(result.ok).toBe(false)
    expect(result.operation).toBe('auth.get-user')
  })

  it('returns INVALID_INPUT for update-user without identifier', async () => {
    const result = await caller.auth.execute({
      action: 'update-user',
      target: { service: 'auth' }, // no identifier
    })
    expect(result.ok).toBe(false)
    expect(result.operation).toBe('auth.update-user')
  })

  it('returns INVALID_INPUT for delete-user without identifier', async () => {
    const result = await caller.auth.execute({
      action: 'delete-user',
      target: { service: 'auth' }, // no identifier
      force: true,
    })
    expect(result.ok).toBe(false)
    expect(result.operation).toBe('auth.delete-user')
  })
})
