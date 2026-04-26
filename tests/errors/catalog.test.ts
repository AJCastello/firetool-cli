import { describe, it, expect } from 'bun:test'
import {
  EXIT_CODES,
  DEFAULT_MESSAGES,
  DEFAULT_HINTS,
  exitCodeForErrorCode,
} from '../../src/errors/catalog.ts'
import type { TFiretoolErrorCode } from '../../src/shared/types.ts'

const ALL_CODES: TFiretoolErrorCode[] = [
  'CONTEXT_NOT_FOUND',
  'SERVICE_NOT_CONFIGURED',
  'EMULATOR_NOT_RUNNING',
  'INVALID_INPUT',
  'CONFIRMATION_REQUIRED',
  'RULE_DENIED',
  'AMBIGUOUS_TARGET',
]

describe('EXIT_CODES', () => {
  it('defines a non-zero exit code for every error code', () => {
    for (const code of ALL_CODES) {
      expect(EXIT_CODES[code]).toBeGreaterThan(0)
    }
  })

  it('uses distinct exit codes so error categories are distinguishable', () => {
    const values = Object.values(EXIT_CODES)
    const unique = new Set(values)
    expect(unique.size).toBe(values.length)
  })

  it('uses exit code 2 for CONTEXT_NOT_FOUND', () => {
    expect(EXIT_CODES['CONTEXT_NOT_FOUND']).toBe(2)
  })

  it('uses exit code 3 for SERVICE_NOT_CONFIGURED', () => {
    expect(EXIT_CODES['SERVICE_NOT_CONFIGURED']).toBe(3)
  })

  it('uses exit code 4 for EMULATOR_NOT_RUNNING', () => {
    expect(EXIT_CODES['EMULATOR_NOT_RUNNING']).toBe(4)
  })

  it('uses exit code 5 for INVALID_INPUT', () => {
    expect(EXIT_CODES['INVALID_INPUT']).toBe(5)
  })

  it('uses exit code 6 for CONFIRMATION_REQUIRED', () => {
    expect(EXIT_CODES['CONFIRMATION_REQUIRED']).toBe(6)
  })

  it('uses exit code 7 for RULE_DENIED', () => {
    expect(EXIT_CODES['RULE_DENIED']).toBe(7)
  })

  it('uses exit code 8 for AMBIGUOUS_TARGET', () => {
    expect(EXIT_CODES['AMBIGUOUS_TARGET']).toBe(8)
  })
})

describe('DEFAULT_MESSAGES', () => {
  it('provides a non-empty message for every error code', () => {
    for (const code of ALL_CODES) {
      expect(typeof DEFAULT_MESSAGES[code]).toBe('string')
      expect(DEFAULT_MESSAGES[code].length).toBeGreaterThan(0)
    }
  })
})

describe('DEFAULT_HINTS', () => {
  it('provides a non-empty hint for every error code', () => {
    for (const code of ALL_CODES) {
      expect(typeof DEFAULT_HINTS[code]).toBe('string')
      expect(DEFAULT_HINTS[code].length).toBeGreaterThan(0)
    }
  })
})

describe('exitCodeForErrorCode', () => {
  it('returns the mapped exit code for a known error code', () => {
    expect(exitCodeForErrorCode('CONTEXT_NOT_FOUND')).toBe(2)
    expect(exitCodeForErrorCode('EMULATOR_NOT_RUNNING')).toBe(4)
    expect(exitCodeForErrorCode('CONFIRMATION_REQUIRED')).toBe(6)
  })

  it('returns 1 for an unknown or undefined code', () => {
    expect(exitCodeForErrorCode(undefined)).toBe(1)
  })
})
