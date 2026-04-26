import { describe, it, expect } from 'bun:test'
import { renderHuman, renderJson, exitCodeFor } from '../../src/render/index.ts'
import type { TFiretoolResult } from '../../src/shared/types.ts'

const makeResult = (overrides: Partial<TFiretoolResult> = {}): TFiretoolResult => ({
  ok: true,
  operation: 'test.op',
  warnings: [],
  ...overrides,
})

describe('renderJson', () => {
  it('serialises all TFiretoolResult fields to valid JSON', () => {
    const result = makeResult({
      ok: false,
      operation: 'auth.list-users',
      target: { service: 'auth' },
      warnings: ['rate limited'],
      error: { code: 'EMULATOR_NOT_RUNNING', message: 'Not running', hint: 'Start it' },
    })
    const json = renderJson(result)
    const parsed = JSON.parse(json) as TFiretoolResult
    expect(parsed.ok).toBe(false)
    expect(parsed.operation).toBe('auth.list-users')
    expect(parsed.warnings).toEqual(['rate limited'])
    expect(parsed.error?.code).toBe('EMULATOR_NOT_RUNNING')
    expect(parsed.error?.hint).toBe('Start it')
  })

  it('includes the target when present', () => {
    const result = makeResult({ target: { service: 'firestore', resourcePath: 'users/123' } })
    const parsed = JSON.parse(renderJson(result)) as TFiretoolResult
    expect(parsed.target?.service).toBe('firestore')
    expect(parsed.target?.resourcePath).toBe('users/123')
  })

  it('includes result payload when present', () => {
    const result = makeResult({ result: { count: 5 } })
    const parsed = JSON.parse(renderJson(result)) as TFiretoolResult & { result: { count: number } }
    expect(parsed.result.count).toBe(5)
  })
})

describe('renderHuman', () => {
  it('shows a checkmark and operation for success', () => {
    const output = renderHuman(makeResult({ ok: true }))
    expect(output).toContain('✓')
    expect(output).toContain('test.op')
  })

  it('shows a cross and operation for failure', () => {
    const output = renderHuman(makeResult({ ok: false }))
    expect(output).toContain('✗')
    expect(output).toContain('test.op')
  })

  it('shows target service and resourcePath when present', () => {
    const output = renderHuman(makeResult({ target: { service: 'firestore', resourcePath: 'col/doc' } }))
    expect(output).toContain('firestore')
    expect(output).toContain('col/doc')
  })

  it('shows target identifier when resourcePath is absent', () => {
    const output = renderHuman(makeResult({ target: { service: 'pubsub', identifier: 'my-topic' } }))
    expect(output).toContain('pubsub')
    expect(output).toContain('my-topic')
  })

  it('shows error code, message, and hint for failures', () => {
    const output = renderHuman(makeResult({
      ok: false,
      error: { code: 'CONTEXT_NOT_FOUND', message: 'No project', hint: 'Run from project dir' },
    }))
    expect(output).toContain('CONTEXT_NOT_FOUND')
    expect(output).toContain('No project')
    expect(output).toContain('Run from project dir')
  })

  it('does not show hint line when hint is absent', () => {
    const output = renderHuman(makeResult({
      ok: false,
      error: { code: 'INVALID_INPUT', message: 'Bad JSON' },
    }))
    expect(output).toContain('INVALID_INPUT')
    expect(output).not.toContain('Hint:')
  })

  it('shows warnings with a warning symbol', () => {
    const output = renderHuman(makeResult({ warnings: ['low disk', 'partial result'] }))
    expect(output).toContain('⚠')
    expect(output).toContain('low disk')
    expect(output).toContain('partial result')
  })

  it('shows inline result data for success', () => {
    const output = renderHuman(makeResult({ result: { written: 3 } }))
    expect(output).toContain('written')
  })

  it('does not crash when result payload is undefined', () => {
    expect(() => renderHuman(makeResult({ result: undefined }))).not.toThrow()
  })

  it('human and JSON outputs preserve the same operation, target, and status', () => {
    const result = makeResult({
      ok: false,
      operation: 'firestore.seed',
      target: { service: 'firestore', resourcePath: 'products' },
      error: { code: 'EMULATOR_NOT_RUNNING', message: 'Not running' },
    })
    const humanOut = renderHuman(result)
    const jsonParsed = JSON.parse(renderJson(result)) as TFiretoolResult
    expect(humanOut).toContain('firestore.seed')
    expect(jsonParsed.operation).toBe('firestore.seed')
    expect(humanOut).toContain('firestore')
    expect(jsonParsed.target?.service).toBe('firestore')
    expect(humanOut).toContain('✗')
    expect(jsonParsed.ok).toBe(false)
  })
})

describe('exitCodeFor', () => {
  it('returns 0 for a successful result', () => {
    expect(exitCodeFor(makeResult({ ok: true }))).toBe(0)
  })

  it('returns 1 for a failure with no error code', () => {
    expect(exitCodeFor(makeResult({ ok: false }))).toBe(1)
  })

  it('returns 2 for CONTEXT_NOT_FOUND', () => {
    const result = makeResult({ ok: false, error: { code: 'CONTEXT_NOT_FOUND', message: '' } })
    expect(exitCodeFor(result)).toBe(2)
  })

  it('returns 3 for SERVICE_NOT_CONFIGURED', () => {
    const result = makeResult({ ok: false, error: { code: 'SERVICE_NOT_CONFIGURED', message: '' } })
    expect(exitCodeFor(result)).toBe(3)
  })

  it('returns 4 for EMULATOR_NOT_RUNNING', () => {
    const result = makeResult({ ok: false, error: { code: 'EMULATOR_NOT_RUNNING', message: '' } })
    expect(exitCodeFor(result)).toBe(4)
  })

  it('returns 5 for INVALID_INPUT', () => {
    const result = makeResult({ ok: false, error: { code: 'INVALID_INPUT', message: '' } })
    expect(exitCodeFor(result)).toBe(5)
  })

  it('returns 6 for CONFIRMATION_REQUIRED', () => {
    const result = makeResult({ ok: false, error: { code: 'CONFIRMATION_REQUIRED', message: '' } })
    expect(exitCodeFor(result)).toBe(6)
  })

  it('returns 7 for RULE_DENIED', () => {
    const result = makeResult({ ok: false, error: { code: 'RULE_DENIED', message: '' } })
    expect(exitCodeFor(result)).toBe(7)
  })

  it('returns 8 for AMBIGUOUS_TARGET', () => {
    const result = makeResult({ ok: false, error: { code: 'AMBIGUOUS_TARGET', message: '' } })
    expect(exitCodeFor(result)).toBe(8)
  })
})
