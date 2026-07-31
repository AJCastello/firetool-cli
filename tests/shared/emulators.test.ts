import { describe, it, expect } from 'bun:test'
import {
  FIREBASE_EMULATOR_NAMES,
  FIREBASE_EMULATOR_NAME,
  emulatorNameFor,
  startCommandForEmulatorNames,
  buildEmulatorStartCommand,
} from '../../src/shared/emulators.ts'
import type { TServiceName } from '../../src/shared/types.ts'

const ALL_SERVICES: TServiceName[] = [
  'auth',
  'firestore',
  'rtdb',
  'storage',
  'functions',
  'pubsub',
  'rules',
]

describe('FIREBASE_EMULATOR_NAME', () => {
  it('maps every Firetool service to an emulator the Firebase CLI accepts', () => {
    // The guarantee that matters: nothing this map emits can be rejected by
    // `firebase emulators:start --only`. A new service with an invented name
    // fails here rather than in a user's terminal.
    for (const service of ALL_SERVICES) {
      expect(FIREBASE_EMULATOR_NAMES).toContain(FIREBASE_EMULATOR_NAME[service])
    }
  })

  it('covers every service without gaps', () => {
    expect(Object.keys(FIREBASE_EMULATOR_NAME).sort()).toEqual([...ALL_SERVICES].sort())
  })

  it('translates rtdb to database, which is what the Firebase CLI calls it', () => {
    expect(FIREBASE_EMULATOR_NAME.rtdb).toBe('database')
  })

  it('routes rules to firestore because there is no standalone rules emulator', () => {
    expect(FIREBASE_EMULATOR_NAME.rules).toBe('firestore')
  })

  it('never emits a Firetool-only name as an emulator name', () => {
    const emitted = Object.values(FIREBASE_EMULATOR_NAME)
    expect(emitted).not.toContain('rtdb')
    expect(emitted).not.toContain('rules')
  })
})

describe('emulatorNameFor', () => {
  it('translates known service names', () => {
    expect(emulatorNameFor('rtdb')).toBe('database')
    expect(emulatorNameFor('rules')).toBe('firestore')
    expect(emulatorNameFor('auth')).toBe('auth')
  })

  it('falls back to the given name for an unknown service', () => {
    expect(emulatorNameFor('hosting')).toBe('hosting')
    expect(emulatorNameFor('not-a-service')).toBe('not-a-service')
  })
})

describe('startCommandForEmulatorNames', () => {
  it('returns the bare command when no emulator is named', () => {
    expect(startCommandForEmulatorNames([])).toBe('firebase emulators:start')
  })

  it('joins names into a single --only list', () => {
    expect(startCommandForEmulatorNames(['auth', 'firestore'])).toBe(
      'firebase emulators:start --only auth,firestore',
    )
  })

  it('deduplicates and orders so the same set always yields the same command', () => {
    expect(startCommandForEmulatorNames(['firestore', 'auth', 'firestore'])).toBe(
      startCommandForEmulatorNames(['auth', 'firestore']),
    )
  })
})

describe('buildEmulatorStartCommand', () => {
  it('produces a runnable command for rtdb rather than the Firetool name', () => {
    expect(buildEmulatorStartCommand(['rtdb'])).toBe(
      'firebase emulators:start --only database',
    )
  })

  it('collapses rules and firestore into one emulator', () => {
    expect(buildEmulatorStartCommand(['rules', 'firestore'])).toBe(
      'firebase emulators:start --only firestore',
    )
  })

  it('builds a multi-service command with translated names', () => {
    expect(buildEmulatorStartCommand(['auth', 'rtdb', 'storage'])).toBe(
      'firebase emulators:start --only auth,database,storage',
    )
  })

  it('emits only names the Firebase CLI accepts, for every service', () => {
    const command = buildEmulatorStartCommand(ALL_SERVICES)
    const names = command.replace('firebase emulators:start --only ', '').split(',')
    for (const name of names) {
      expect(FIREBASE_EMULATOR_NAMES).toContain(name as (typeof FIREBASE_EMULATOR_NAMES)[number])
    }
  })
})
