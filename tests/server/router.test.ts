import { describe, it, expect } from 'bun:test'
import { createCaller } from '../../src/server/caller.ts'
import type { TFiretoolResult } from '../../src/shared/types.ts'

describe('appRouter — shape contract', () => {
  const caller = createCaller(process.cwd())

  describe('diagnostics.getContext', () => {
    it('returns a TFiretoolResult with required fields', async () => {
      const result = await caller.diagnostics.getContext({ cwd: process.cwd() })
      expect(typeof result.ok).toBe('boolean')
      expect(typeof result.operation).toBe('string')
      expect(result.operation).toBe('diagnostics.getContext')
      expect(Array.isArray(result.warnings)).toBe(true)
    })

    it('returns ok:false with structured error before discovery is implemented', async () => {
      const result = await caller.diagnostics.getContext({ cwd: '/tmp' })
      expect(result.ok).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error?.code).toBeDefined()
      expect(result.error?.message).toBeDefined()
    })
  })

  describe('help.describe', () => {
    it('returns a successful result for general help', async () => {
      const result = await caller.help.describe({})
      expect(result.ok).toBe(true)
      expect(result.operation).toBe('help.describe')
      expect(result.result).toBeDefined()
    })

    it('returns result data including agent flow', async () => {
      const result = await caller.help.describe({})
      const data = result.result as { agentFlow?: string[]; commands?: unknown[] }
      expect(Array.isArray(data.agentFlow)).toBe(true)
      expect((data.agentFlow ?? []).length).toBeGreaterThan(0)
      expect(Array.isArray(data.commands)).toBe(true)
    })

    it('returns service-specific help when service is provided', async () => {
      const services = ['auth', 'firestore', 'rtdb', 'storage', 'functions', 'pubsub', 'rules'] as const
      for (const service of services) {
        const result = await caller.help.describe({ service })
        expect(result.ok).toBe(true)
        const data = result.result as { service?: string; actions?: unknown[] }
        expect(data.service).toBe(service)
        expect(Array.isArray(data.actions)).toBe(true)
      }
    })

    it('includes error codes catalog in general help', async () => {
      const result = await caller.help.describe({})
      const data = result.result as { errorCodes?: Record<string, { exitCode: number; description: string }> }
      expect(typeof data.errorCodes).toBe('object')
      expect(data.errorCodes?.['EMULATOR_NOT_RUNNING']).toBeDefined()
      expect(data.errorCodes?.['CONTEXT_NOT_FOUND']).toBeDefined()
      expect(data.errorCodes?.['EMULATOR_NOT_RUNNING']?.exitCode).toBe(4)
      expect(data.errorCodes?.['CONTEXT_NOT_FOUND']?.exitCode).toBe(2)
    })
  })

  describe('auth.execute', () => {
    it('returns a TFiretoolResult with the correct operation', async () => {
      const result = await caller.auth.execute({
        action: 'list-users',
        target: { service: 'auth' },
      })
      expect(typeof result.ok).toBe('boolean')
      expect(result.operation).toBe('auth.list-users')
      expect(Array.isArray(result.warnings)).toBe(true)
    })
  })

  describe('firestore.execute', () => {
    it('returns a TFiretoolResult with correct operation and target', async () => {
      const result = await caller.firestore.execute({
        action: 'seed',
        target: { service: 'firestore', resourcePath: 'products' },
        dryRun: true,
      })
      expect(result.operation).toBe('firestore.seed')
      expect(result.target?.service).toBe('firestore')
    })
  })

  describe('rtdb.execute', () => {
    it('returns a TFiretoolResult', async () => {
      const result = await caller.rtdb.execute({
        action: 'get',
        target: { service: 'rtdb', resourcePath: '/users' },
      })
      expect(typeof result.ok).toBe('boolean')
      expect(result.operation).toBe('rtdb.get')
    })
  })

  describe('storage.execute', () => {
    it('returns a TFiretoolResult', async () => {
      const result = await caller.storage.execute({
        action: 'list',
        target: { service: 'storage' },
      })
      expect(typeof result.ok).toBe('boolean')
      expect(result.operation).toBe('storage.list')
    })
  })

  describe('functions.call', () => {
    it('returns a TFiretoolResult with function identifier', async () => {
      const result = await caller.functions.invoke({ nameOrUrl: 'createUserProfile' })
      expect(typeof result.ok).toBe('boolean')
      expect(result.operation).toBe('functions.call')
      expect(result.target?.identifier).toBe('createUserProfile')
    })
  })

  describe('pubsub.publish', () => {
    it('returns a TFiretoolResult with topic identifier', async () => {
      const result = await caller.pubsub.publish({
        topic: 'user-created',
        data: { uid: 'abc' },
      })
      expect(typeof result.ok).toBe('boolean')
      expect(result.operation).toBe('pubsub.publish')
      expect(result.target?.identifier).toBe('user-created')
    })
  })

  describe('rules.check', () => {
    it('returns a TFiretoolResult', async () => {
      const result = await caller.rules.check({
        service: 'firestore',
        target: { service: 'firestore', resourcePath: 'products/abc' },
        intent: 'read',
      })
      expect(typeof result.ok).toBe('boolean')
      expect(result.operation).toBe('rules.check')
    })
  })
})

describe('appRouter — result shape consistency', () => {
  const caller = createCaller(process.cwd())

  it('every stub procedure returns a result with warnings array', async () => {
    const results: TFiretoolResult[] = await Promise.all([
      caller.diagnostics.getContext({ cwd: '/tmp' }),
      caller.help.describe({}),
      caller.auth.execute({ action: 'list', target: { service: 'auth' } }),
      caller.firestore.execute({ action: 'get', target: { service: 'firestore' } }),
      caller.rtdb.execute({ action: 'get', target: { service: 'rtdb' } }),
      caller.storage.execute({ action: 'list', target: { service: 'storage' } }),
      caller.functions.invoke({ nameOrUrl: 'test' }),
      caller.pubsub.publish({ topic: 't', data: {} }),
      caller.rules.check({ service: 'firestore', target: { service: 'firestore' }, intent: 'read' }),
    ])

    for (const result of results) {
      expect(Array.isArray(result.warnings)).toBe(true)
      expect(typeof result.ok).toBe('boolean')
      expect(typeof result.operation).toBe('string')
    }
  })
})
