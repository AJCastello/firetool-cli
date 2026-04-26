import { describe, it, expect } from 'bun:test'
import {
  ServiceNameSchema,
  CommandTargetSchema,
  FiretoolErrorCodeSchema,
  FiretoolErrorSchema,
  FiretoolResultSchema,
  GetContextInputSchema,
  DescribeInputSchema,
  ServiceExecuteInputSchema,
  AuthExecuteInputSchema,
  FunctionsCallInputSchema,
  PubSubPublishInputSchema,
  RulesCheckInputSchema,
} from '../../src/shared/schemas.ts'

describe('ServiceNameSchema', () => {
  it('accepts all valid service names', () => {
    const names = ['auth', 'firestore', 'rtdb', 'storage', 'functions', 'pubsub', 'rules'] as const
    for (const name of names) {
      expect(ServiceNameSchema.parse(name)).toBe(name)
    }
  })

  it('rejects unknown service names', () => {
    expect(() => ServiceNameSchema.parse('analytics')).toThrow()
    expect(() => ServiceNameSchema.parse('')).toThrow()
    expect(() => ServiceNameSchema.parse(42)).toThrow()
  })
})

describe('CommandTargetSchema', () => {
  it('validates a minimal target with only service', () => {
    const target = CommandTargetSchema.parse({ service: 'firestore' })
    expect(target.service).toBe('firestore')
    expect(target.projectId).toBeUndefined()
  })

  it('validates a complete target', () => {
    const target = CommandTargetSchema.parse({
      service: 'firestore',
      projectId: 'my-project',
      resourcePath: 'users/123',
      identifier: 'user-doc',
    })
    expect(target.service).toBe('firestore')
    expect(target.projectId).toBe('my-project')
    expect(target.resourcePath).toBe('users/123')
    expect(target.identifier).toBe('user-doc')
  })

  it('rejects missing service', () => {
    expect(() => CommandTargetSchema.parse({})).toThrow()
  })
})

describe('FiretoolErrorCodeSchema', () => {
  const codes = [
    'CONTEXT_NOT_FOUND',
    'SERVICE_NOT_CONFIGURED',
    'EMULATOR_NOT_RUNNING',
    'INVALID_INPUT',
    'CONFIRMATION_REQUIRED',
    'RULE_DENIED',
    'AMBIGUOUS_TARGET',
  ] as const

  it('accepts all defined error codes', () => {
    for (const code of codes) {
      expect(FiretoolErrorCodeSchema.parse(code)).toBe(code)
    }
  })

  it('rejects unknown error codes', () => {
    expect(() => FiretoolErrorCodeSchema.parse('UNKNOWN_ERROR')).toThrow()
  })
})

describe('FiretoolErrorSchema', () => {
  it('validates an error with required fields', () => {
    const err = FiretoolErrorSchema.parse({
      code: 'EMULATOR_NOT_RUNNING',
      message: 'Emulator is not running',
    })
    expect(err.code).toBe('EMULATOR_NOT_RUNNING')
    expect(err.message).toBe('Emulator is not running')
    expect(err.hint).toBeUndefined()
  })

  it('validates an error with optional hint', () => {
    const err = FiretoolErrorSchema.parse({
      code: 'EMULATOR_NOT_RUNNING',
      message: 'Emulator is not running',
      hint: 'Run firebase emulators:start',
    })
    expect(err.hint).toBe('Run firebase emulators:start')
  })
})

describe('FiretoolResultSchema', () => {
  it('validates a success result with minimal fields', () => {
    const result = FiretoolResultSchema.parse({
      ok: true,
      operation: 'firestore.seed',
      warnings: [],
    })
    expect(result.ok).toBe(true)
    expect(result.operation).toBe('firestore.seed')
    expect(result.warnings).toEqual([])
  })

  it('validates a success result with target and result data', () => {
    const result = FiretoolResultSchema.parse({
      ok: true,
      operation: 'firestore.seed',
      target: { service: 'firestore', resourcePath: 'products' },
      result: { written: 3, source: 'products.seed.json' },
      warnings: [],
    })
    expect(result.target?.service).toBe('firestore')
    expect(result.result).toEqual({ written: 3, source: 'products.seed.json' })
  })

  it('validates an error result', () => {
    const result = FiretoolResultSchema.parse({
      ok: false,
      operation: 'diagnostics.getContext',
      warnings: [],
      error: {
        code: 'EMULATOR_NOT_RUNNING',
        message: 'Firestore emulator is not running',
        hint: 'Start the Firestore emulator and run the command again.',
      },
    })
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('EMULATOR_NOT_RUNNING')
    expect(result.error?.hint).toBeDefined()
  })

  it('validates a result with warnings', () => {
    const result = FiretoolResultSchema.parse({
      ok: true,
      operation: 'test',
      warnings: ['partial data', 'some limitation'],
    })
    expect(result.warnings).toHaveLength(2)
  })
})

describe('GetContextInputSchema', () => {
  it('validates with a cwd string', () => {
    const input = GetContextInputSchema.parse({ cwd: '/home/user/project' })
    expect(input.cwd).toBe('/home/user/project')
  })

  it('rejects missing cwd', () => {
    expect(() => GetContextInputSchema.parse({})).toThrow()
  })
})

describe('DescribeInputSchema', () => {
  it('validates with no service (general help)', () => {
    const input = DescribeInputSchema.parse({})
    expect(input.service).toBeUndefined()
  })

  it('validates with a specific service', () => {
    const input = DescribeInputSchema.parse({ service: 'auth' })
    expect(input.service).toBe('auth')
  })
})

describe('ServiceExecuteInputSchema', () => {
  it('validates a minimal execute input', () => {
    const input = ServiceExecuteInputSchema.parse({
      action: 'seed',
      target: { service: 'firestore' },
    })
    expect(input.action).toBe('seed')
    expect(input.dryRun).toBeUndefined()
  })

  it('validates with optional fields', () => {
    const input = ServiceExecuteInputSchema.parse({
      action: 'clear',
      target: { service: 'firestore', resourcePath: 'users' },
      dryRun: true,
      force: false,
      data: { key: 'value' },
    })
    expect(input.dryRun).toBe(true)
    expect(input.force).toBe(false)
  })
})

describe('AuthExecuteInputSchema', () => {
  it('validates without dryRun (auth does not support it)', () => {
    const input = AuthExecuteInputSchema.parse({
      action: 'create-user',
      target: { service: 'auth' },
      data: { email: 'user@test.com' },
    })
    expect(input.action).toBe('create-user')
  })
})

describe('FunctionsCallInputSchema', () => {
  it('validates with a function name', () => {
    const input = FunctionsCallInputSchema.parse({ nameOrUrl: 'createUserProfile' })
    expect(input.nameOrUrl).toBe('createUserProfile')
    expect(input.data).toBeUndefined()
  })

  it('validates with data', () => {
    const input = FunctionsCallInputSchema.parse({
      nameOrUrl: 'onUserCreate',
      data: { uid: 'abc123' },
    })
    expect(input.data).toEqual({ uid: 'abc123' })
  })
})

describe('PubSubPublishInputSchema', () => {
  it('validates with topic and data', () => {
    const input = PubSubPublishInputSchema.parse({
      topic: 'user-created',
      data: { uid: 'abc' },
    })
    expect(input.topic).toBe('user-created')
    expect(input.attributes).toBeUndefined()
  })

  it('validates with attributes', () => {
    const input = PubSubPublishInputSchema.parse({
      topic: 'events',
      data: {},
      attributes: { source: 'test', env: 'local' },
    })
    expect(input.attributes).toEqual({ source: 'test', env: 'local' })
  })
})

describe('RulesCheckInputSchema', () => {
  it('validates a firestore rules check', () => {
    const input = RulesCheckInputSchema.parse({
      service: 'firestore',
      target: { service: 'firestore', resourcePath: 'products/abc' },
      intent: 'read',
    })
    expect(input.service).toBe('firestore')
    expect(input.intent).toBe('read')
  })

  it('validates a storage rules check with auth', () => {
    const input = RulesCheckInputSchema.parse({
      service: 'storage',
      target: { service: 'storage', resourcePath: 'files/test.png' },
      intent: 'write',
      auth: { uid: 'user_123' },
    })
    expect(input.auth).toEqual({ uid: 'user_123' })
  })

  it('rejects invalid service (only firestore and storage)', () => {
    expect(() =>
      RulesCheckInputSchema.parse({
        service: 'auth',
        target: { service: 'auth' },
        intent: 'read',
      }),
    ).toThrow()
  })
})
