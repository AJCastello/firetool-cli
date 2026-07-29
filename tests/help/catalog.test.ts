import { describe, it, expect } from 'bun:test'
import {
  SERVICE_CATALOG,
  AGENT_FLOW,
  buildGeneralHelp,
  buildServiceHelp,
} from '../../src/help/catalog.ts'
import type { TServiceName } from '../../src/shared/types.ts'
import { SERVICE_ACTIONS } from '../../src/shared/actions.ts'

const ALL_SERVICES: TServiceName[] = ['auth', 'firestore', 'rtdb', 'storage', 'functions', 'pubsub', 'rules']

/** Extract the `<service> <action>` pair an example command invokes. */
function parseExample(example: string): { service: string; action: string } | null {
  const parts = example.split(/\s+/)
  if (parts[0] !== 'firetool' || parts.length < 3) return null
  return { service: parts[1]!, action: parts[2]! }
}

describe('SERVICE_CATALOG', () => {
  it('covers all seven supported services', () => {
    for (const service of ALL_SERVICES) {
      expect(SERVICE_CATALOG[service]).toBeDefined()
    }
  })

  it('every entry has name, description, destructive flag, actions and examples', () => {
    for (const [, info] of Object.entries(SERVICE_CATALOG)) {
      expect(typeof info.name).toBe('string')
      expect(typeof info.description).toBe('string')
      expect(typeof info.destructive).toBe('boolean')
      expect(Array.isArray(info.actions)).toBe(true)
      expect(Array.isArray(info.examples)).toBe(true)
      expect((info.actions ?? []).length).toBeGreaterThan(0)
      expect((info.examples ?? []).length).toBeGreaterThan(0)
    }
  })

  it('marks auth, firestore, rtdb, and storage as destructive', () => {
    expect(SERVICE_CATALOG['auth'].destructive).toBe(true)
    expect(SERVICE_CATALOG['firestore'].destructive).toBe(true)
    expect(SERVICE_CATALOG['rtdb'].destructive).toBe(true)
    expect(SERVICE_CATALOG['storage'].destructive).toBe(true)
  })

  it('marks functions, pubsub, and rules as non-destructive', () => {
    expect(SERVICE_CATALOG['functions'].destructive).toBe(false)
    expect(SERVICE_CATALOG['pubsub'].destructive).toBe(false)
    expect(SERVICE_CATALOG['rules'].destructive).toBe(false)
  })
})

describe('SERVICE_CATALOG parity with the implemented actions', () => {
  it('advertises exactly the actions each service implements', () => {
    for (const service of ALL_SERVICES) {
      expect([...SERVICE_CATALOG[service].actions]).toEqual([...SERVICE_ACTIONS[service]])
    }
  })

  it('never advertises an example that invokes a non-existent action', () => {
    for (const service of ALL_SERVICES) {
      for (const example of SERVICE_CATALOG[service].examples) {
        const parsed = parseExample(example)
        expect(parsed).not.toBeNull()
        expect(parsed!.service).toBe(service)
        expect(SERVICE_ACTIONS[service]).toContain(parsed!.action)
      }
    }
  })

  it('mentions every implemented action in the service description', () => {
    for (const service of ALL_SERVICES) {
      const description = SERVICE_CATALOG[service].description
      for (const action of SERVICE_ACTIONS[service]) {
        expect(description).toContain(action)
      }
    }
  })
})

describe('AGENT_FLOW', () => {
  it('is a non-empty array of strings', () => {
    expect(Array.isArray(AGENT_FLOW)).toBe(true)
    expect(AGENT_FLOW.length).toBeGreaterThan(0)
  })

  it('mentions doctor/diagnostics as the first step', () => {
    const step = (AGENT_FLOW[0] ?? '').toLowerCase()
    expect(step.includes('diagnos') || step.includes('doctor')).toBe(true)
  })

  it('covers dry-run guidance', () => {
    const combined = AGENT_FLOW.join(' ').toLowerCase()
    expect(combined.includes('dry-run') || combined.includes('dry run')).toBe(true)
  })

  it('covers force flag guidance', () => {
    const combined = AGENT_FLOW.join(' ').toLowerCase()
    expect(combined.includes('force') || combined.includes('--force')).toBe(true)
  })
})

describe('buildGeneralHelp', () => {
  const data = buildGeneralHelp()

  it('includes the agent flow', () => {
    expect(Array.isArray(data.agentFlow)).toBe(true)
    expect(data.agentFlow.length).toBeGreaterThan(0)
  })

  it('lists all seven services in commands', () => {
    const names = (data.commands as Array<{ name: string }>).map((c) => c.name)
    for (const service of ALL_SERVICES) {
      expect(names).toContain(service)
    }
  })

  it('includes the doctor command', () => {
    const names = (data.commands as Array<{ name: string }>).map((c) => c.name)
    expect(names).toContain('doctor')
  })

  it('includes the --json, --dry-run, and --force flags', () => {
    const flags = data.flags as Record<string, string>
    expect(flags['--json']).toBeDefined()
    expect(flags['--dry-run']).toBeDefined()
    expect(flags['--force']).toBeDefined()
  })

  it('includes the error codes catalog with all seven codes', () => {
    const codes = data.errorCodes as Record<string, unknown>
    expect(codes['CONTEXT_NOT_FOUND']).toBeDefined()
    expect(codes['SERVICE_NOT_CONFIGURED']).toBeDefined()
    expect(codes['EMULATOR_NOT_RUNNING']).toBeDefined()
    expect(codes['INVALID_INPUT']).toBeDefined()
    expect(codes['CONFIRMATION_REQUIRED']).toBeDefined()
    expect(codes['RULE_DENIED']).toBeDefined()
    expect(codes['AMBIGUOUS_TARGET']).toBeDefined()
  })

  it('includes exit codes for each error code', () => {
    const codes = data.errorCodes as Record<string, { exitCode: number; description: string } | undefined>
    expect(codes['CONTEXT_NOT_FOUND']?.exitCode).toBe(2)
    expect(codes['EMULATOR_NOT_RUNNING']?.exitCode).toBe(4)
    expect(codes['CONFIRMATION_REQUIRED']?.exitCode).toBe(6)
  })

  it('includes the recommended agent workflow section', () => {
    expect(typeof data.description).toBe('string')
    expect(data.description.length).toBeGreaterThan(0)
  })
})

describe('buildServiceHelp', () => {
  it('returns service-specific info for each supported service', () => {
    for (const service of ALL_SERVICES) {
      const data = buildServiceHelp(service)
      expect(data.service).toBe(service)
      expect(Array.isArray(data.actions)).toBe(true)
      expect(Array.isArray(data.examples)).toBe(true)
      expect(Array.isArray(data.agentFlow)).toBe(true)
    }
  })

  it('marks destructive flag correctly per service', () => {
    expect(buildServiceHelp('auth').destructive).toBe(true)
    expect(buildServiceHelp('rules').destructive).toBe(false)
  })

  it('includes the agent flow in service help', () => {
    const data = buildServiceHelp('firestore')
    expect((data.agentFlow as string[]).length).toBeGreaterThan(0)
  })
})
