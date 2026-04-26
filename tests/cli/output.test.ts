import { describe, it, expect } from 'bun:test'
import { formatResult } from '../../src/cli/output.ts'
import type { TFiretoolResult } from '../../src/shared/types.ts'

const makeResult = (overrides: Partial<TFiretoolResult> = {}): TFiretoolResult => ({
  ok: true,
  operation: 'test.op',
  warnings: [],
  ...overrides,
})

describe('formatResult — JSON mode', () => {
  it('outputs valid JSON for a success result', () => {
    const { output, exitCode } = formatResult(makeResult({ ok: true }), true)
    expect(exitCode).toBe(0)
    const parsed = JSON.parse(output) as TFiretoolResult
    expect(parsed.ok).toBe(true)
    expect(parsed.operation).toBe('test.op')
  })

  it('outputs valid JSON for an error result', () => {
    const result = makeResult({
      ok: false,
      operation: 'diagnostics.getContext',
      error: {
        code: 'EMULATOR_NOT_RUNNING',
        message: 'Not running',
        hint: 'Start it',
      },
    })
    const { output, exitCode } = formatResult(result, true)
    expect(exitCode).toBe(4) // EMULATOR_NOT_RUNNING maps to exit code 4
    const parsed = JSON.parse(output) as TFiretoolResult
    expect(parsed.ok).toBe(false)
    expect(parsed.error?.code).toBe('EMULATOR_NOT_RUNNING')
    expect(parsed.error?.hint).toBe('Start it')
  })

  it('includes warnings in JSON output', () => {
    const result = makeResult({ warnings: ['partial result', 'some limitation'] })
    const { output } = formatResult(result, true)
    const parsed = JSON.parse(output) as TFiretoolResult
    expect(parsed.warnings).toEqual(['partial result', 'some limitation'])
  })

  it('includes result data in JSON output', () => {
    const result = makeResult({ result: { count: 5, items: ['a', 'b'] } })
    const { output } = formatResult(result, true)
    const parsed = JSON.parse(output) as TFiretoolResult & { result: { count: number } }
    expect(parsed.result.count).toBe(5)
  })
})

describe('formatResult — Human mode', () => {
  it('shows checkmark and operation for success', () => {
    const { output, exitCode } = formatResult(makeResult({ ok: true }), false)
    expect(exitCode).toBe(0)
    expect(output).toContain('✓')
    expect(output).toContain('test.op')
  })

  it('shows cross mark and operation for error', () => {
    const result = makeResult({ ok: false })
    const { output, exitCode } = formatResult(result, false)
    expect(exitCode).toBe(1)
    expect(output).toContain('✗')
    expect(output).toContain('test.op')
  })

  it('shows error code and message for failed result', () => {
    const result = makeResult({
      ok: false,
      operation: 'diagnostics.getContext',
      error: {
        code: 'CONTEXT_NOT_FOUND',
        message: 'No Firebase project found',
        hint: 'Run from a Firebase project directory',
      },
    })
    const { output } = formatResult(result, false)
    expect(output).toContain('CONTEXT_NOT_FOUND')
    expect(output).toContain('No Firebase project found')
    expect(output).toContain('Run from a Firebase project directory')
  })

  it('shows warnings for both success and error results', () => {
    const successResult = makeResult({ warnings: ['low disk space'] })
    const { output: successOutput } = formatResult(successResult, false)
    expect(successOutput).toContain('⚠')
    expect(successOutput).toContain('low disk space')

    const errorResult = makeResult({ ok: false, warnings: ['partial state'] })
    const { output: errorOutput } = formatResult(errorResult, false)
    expect(errorOutput).toContain('⚠')
    expect(errorOutput).toContain('partial state')
  })

  it('shows target service in output when present', () => {
    const result = makeResult({
      target: { service: 'firestore', resourcePath: 'users/123' },
    })
    const { output } = formatResult(result, false)
    expect(output).toContain('firestore')
    expect(output).toContain('users/123')
  })

  it('does not crash when result data is missing', () => {
    const result = makeResult({ result: undefined })
    expect(() => formatResult(result, false)).not.toThrow()
  })
})

describe('formatResult — exit codes', () => {
  it('returns exitCode 0 for ok results regardless of mode', () => {
    const result = makeResult({ ok: true })
    expect(formatResult(result, true).exitCode).toBe(0)
    expect(formatResult(result, false).exitCode).toBe(0)
  })

  it('returns exitCode 1 for failed results with no error code', () => {
    const result = makeResult({ ok: false })
    expect(formatResult(result, true).exitCode).toBe(1)
    expect(formatResult(result, false).exitCode).toBe(1)
  })

  it('returns distinct exit codes per error category', () => {
    const cases: Array<[import('../../src/shared/types.ts').TFiretoolErrorCode, number]> = [
      ['CONTEXT_NOT_FOUND', 2],
      ['SERVICE_NOT_CONFIGURED', 3],
      ['EMULATOR_NOT_RUNNING', 4],
      ['INVALID_INPUT', 5],
      ['CONFIRMATION_REQUIRED', 6],
      ['RULE_DENIED', 7],
      ['AMBIGUOUS_TARGET', 8],
    ]
    for (const [code, expected] of cases) {
      const result = makeResult({ ok: false, error: { code, message: 'err' } })
      expect(formatResult(result, false).exitCode).toBe(expected)
      expect(formatResult(result, true).exitCode).toBe(expected)
    }
  })
})
