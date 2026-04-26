import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import type { TEmulatorStatus, TCommandTarget } from '../../src/shared/types.ts'
import {
  isRemoteHost,
  assertContextFound,
  assertEmulatorRunning,
  assertUnambiguousTarget,
  assertConfirmed,
  guardSensitiveOperation,
} from '../../src/policy/local-only.ts'

const ALLOWLIST_ENV = 'FIRETOOL_ALLOWED_EMULATOR_HOSTS'

// Helpers to build emulator status fixtures
function makeStatus(
  service: TEmulatorStatus['service'],
  overrides: Partial<TEmulatorStatus> = {},
): TEmulatorStatus {
  return {
    service,
    configured: true,
    running: true,
    host: 'localhost',
    port: 8080,
    source: 'firebase.json',
    ...overrides,
  }
}

describe('isRemoteHost', () => {
  it('returns false for localhost', () => {
    expect(isRemoteHost('localhost')).toBe(false)
  })

  it('returns false for 127.x.x.x addresses', () => {
    expect(isRemoteHost('127.0.0.1')).toBe(false)
    expect(isRemoteHost('127.1.2.3')).toBe(false)
  })

  it('returns false for 0.0.0.0 because Firebase emulators commonly bind to all interfaces locally', () => {
    expect(isRemoteHost('0.0.0.0')).toBe(false)
  })

  it('returns false for ::1', () => {
    expect(isRemoteHost('::1')).toBe(false)
  })

  it('returns true for external hostnames', () => {
    expect(isRemoteHost('example.com')).toBe(true)
    expect(isRemoteHost('firebase-project.firebaseio.com')).toBe(true)
    expect(isRemoteHost('192.168.1.1')).toBe(true)
  })
})

describe('assertContextFound', () => {
  it('returns null when at least one service has non-inferred source', () => {
    const statuses = [makeStatus('auth', { source: 'firebase.json' })]
    expect(assertContextFound(statuses)).toBeNull()
  })

  it('returns CONTEXT_NOT_FOUND when all sources are inferred', () => {
    const statuses = [makeStatus('auth', { source: 'inferred', configured: false })]
    const err = assertContextFound(statuses)
    expect(err).not.toBeNull()
    expect(err!.code).toBe('CONTEXT_NOT_FOUND')
  })
})

describe('assertEmulatorRunning', () => {
  it('returns null when service is configured and running locally', () => {
    const statuses = [makeStatus('firestore')]
    expect(assertEmulatorRunning('firestore', statuses)).toBeNull()
  })

  it('returns SERVICE_NOT_CONFIGURED when service is not configured', () => {
    const statuses = [makeStatus('firestore', { configured: false })]
    const err = assertEmulatorRunning('firestore', statuses)
    expect(err).not.toBeNull()
    expect(err!.code).toBe('SERVICE_NOT_CONFIGURED')
  })

  it('returns EMULATOR_NOT_RUNNING when configured but not running', () => {
    const statuses = [makeStatus('firestore', { running: false })]
    const err = assertEmulatorRunning('firestore', statuses)
    expect(err).not.toBeNull()
    expect(err!.code).toBe('EMULATOR_NOT_RUNNING')
  })

  it('returns EMULATOR_NOT_RUNNING when host is remote', () => {
    const statuses = [makeStatus('firestore', { host: 'firestore.googleapis.com' })]
    const err = assertEmulatorRunning('firestore', statuses)
    expect(err).not.toBeNull()
    expect(err!.code).toBe('EMULATOR_NOT_RUNNING')
    expect(err!.message).toContain('not a local address')
  })

  it('returns SERVICE_NOT_CONFIGURED when service is not found in statuses', () => {
    const err = assertEmulatorRunning('auth', [])
    expect(err!.code).toBe('SERVICE_NOT_CONFIGURED')
  })
})

describe('assertUnambiguousTarget', () => {
  it('returns null when target carries explicit projectId', () => {
    const target: TCommandTarget = { service: 'firestore', projectId: 'my-project' }
    expect(assertUnambiguousTarget(target, undefined, ['default', 'staging'])).toBeNull()
  })

  it('returns null when context has no projectId (single-project root)', () => {
    const target: TCommandTarget = { service: 'firestore' }
    expect(assertUnambiguousTarget(target, undefined)).toBeNull()
  })

  it('returns null when projectId is resolvable from context and only one alias', () => {
    const target: TCommandTarget = { service: 'firestore' }
    expect(assertUnambiguousTarget(target, 'my-project', ['default'])).toBeNull()
  })

  it('returns AMBIGUOUS_TARGET when multiple project aliases exist and no explicit target projectId', () => {
    const target: TCommandTarget = { service: 'firestore' }
    const err = assertUnambiguousTarget(target, 'project-a', ['default', 'staging'])
    expect(err).not.toBeNull()
    expect(err!.code).toBe('AMBIGUOUS_TARGET')
    expect(err!.message).toContain('default')
    expect(err!.message).toContain('staging')
    expect(typeof err!.hint).toBe('string')
  })

  it('explicit target projectId bypasses multi-alias check', () => {
    const target: TCommandTarget = { service: 'firestore', projectId: 'project-a' }
    const err = assertUnambiguousTarget(target, 'project-a', ['default', 'staging'])
    expect(err).toBeNull()
  })
})

describe('assertConfirmed', () => {
  const target: TCommandTarget = { service: 'firestore', resourcePath: 'users' }

  it('returns null when force is true', () => {
    expect(assertConfirmed('clear', target, true, false)).toBeNull()
  })

  it('returns null when confirmed is true', () => {
    expect(assertConfirmed('clear', target, false, true)).toBeNull()
  })

  it('returns CONFIRMATION_REQUIRED when neither force nor confirmed', () => {
    const err = assertConfirmed('clear', target, false, false)
    expect(err).not.toBeNull()
    expect(err!.code).toBe('CONFIRMATION_REQUIRED')
  })
})

describe('guardSensitiveOperation', () => {
  const target: TCommandTarget = { service: 'firestore' }

  it('blocks when context is missing', () => {
    const statuses = [makeStatus('firestore', { source: 'inferred', configured: false })]
    const err = guardSensitiveOperation('firestore', target, statuses, undefined)
    expect(err!.code).toBe('CONTEXT_NOT_FOUND')
  })

  it('blocks when emulator is not configured', () => {
    const statuses = [
      makeStatus('auth', { source: 'firebase.json' }), // context present
      makeStatus('firestore', { configured: false }),
    ]
    const err = guardSensitiveOperation('firestore', target, statuses, undefined)
    expect(err!.code).toBe('SERVICE_NOT_CONFIGURED')
  })

  it('blocks when emulator is configured but not running', () => {
    const statuses = [makeStatus('firestore', { running: false })]
    const err = guardSensitiveOperation('firestore', target, statuses, undefined)
    expect(err!.code).toBe('EMULATOR_NOT_RUNNING')
  })

  it('blocks when host is remote (even if running=true in the fixture)', () => {
    const statuses = [
      makeStatus('firestore', { host: 'remote.example.com', running: true }),
    ]
    const err = guardSensitiveOperation('firestore', target, statuses, undefined)
    expect(err!.code).toBe('EMULATOR_NOT_RUNNING')
    expect(err!.message).toContain('not a local address')
  })

  it('returns null when everything is clear with a single project alias', () => {
    const statuses = [makeStatus('firestore')]
    const err = guardSensitiveOperation('firestore', target, statuses, 'my-project', ['default'])
    expect(err).toBeNull()
  })

  it('blocks with AMBIGUOUS_TARGET when multiple project aliases exist and no explicit target', () => {
    const statuses = [makeStatus('firestore')]
    const err = guardSensitiveOperation('firestore', target, statuses, 'project-a', ['default', 'staging'])
    expect(err!.code).toBe('AMBIGUOUS_TARGET')
  })

  it('passes ambiguity check when target carries explicit projectId even with multiple aliases', () => {
    const explicitTarget: TCommandTarget = { service: 'firestore', projectId: 'project-a' }
    const statuses = [makeStatus('firestore')]
    const err = guardSensitiveOperation('firestore', explicitTarget, statuses, 'project-a', ['default', 'staging'])
    expect(err).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Edge-case: extended isRemoteHost coverage
// ---------------------------------------------------------------------------

describe('isRemoteHost — edge cases', () => {
  describe('normalizable local hosts', () => {
    it('returns false for localhost. (trailing dot)', () => {
      expect(isRemoteHost('localhost.')).toBe(false)
    })

    it('returns false for [::1] (bracketed IPv6)', () => {
      expect(isRemoteHost('[::1]')).toBe(false)
    })

    it('returns false for [::1]:9099 (bracketed IPv6 with port)', () => {
      expect(isRemoteHost('[::1]:9099')).toBe(false)
    })

    it('returns false for 0:0:0:0:0:0:0:1 (expanded IPv6 loopback)', () => {
      expect(isRemoteHost('0:0:0:0:0:0:0:1')).toBe(false)
    })

    it('returns false for ::ffff:127.0.0.1 (IPv4-mapped loopback)', () => {
      expect(isRemoteHost('::ffff:127.0.0.1')).toBe(false)
    })

    it('returns false for :: (bind-all IPv6)', () => {
      expect(isRemoteHost('::')).toBe(false)
    })

    it('returns false for 127.0.0.1:9099 (loopback with port)', () => {
      expect(isRemoteHost('127.0.0.1:9099')).toBe(false)
    })

    it('returns false for http://localhost (accidental protocol prefix)', () => {
      expect(isRemoteHost('http://localhost')).toBe(false)
    })
  })

  describe('public Firebase/Google hosts remain blocked', () => {
    it('blocks firebaseio.com', () => {
      expect(isRemoteHost('firebaseio.com')).toBe(true)
    })

    it('blocks project.firebaseio.com', () => {
      expect(isRemoteHost('my-project.firebaseio.com')).toBe(true)
    })

    it('blocks firebaseapp.com', () => {
      expect(isRemoteHost('my-project.firebaseapp.com')).toBe(true)
    })

    it('blocks googleapis.com', () => {
      expect(isRemoteHost('firebase.googleapis.com')).toBe(true)
    })

    it('blocks identitytoolkit.googleapis.com', () => {
      expect(isRemoteHost('identitytoolkit.googleapis.com')).toBe(true)
    })
  })

  describe('private LAN IPs remain blocked by default', () => {
    it('blocks 10.0.0.1', () => {
      expect(isRemoteHost('10.0.0.1')).toBe(true)
    })

    it('blocks 172.16.0.1', () => {
      expect(isRemoteHost('172.16.0.1')).toBe(true)
    })

    it('blocks 192.168.1.100', () => {
      expect(isRemoteHost('192.168.1.100')).toBe(true)
    })
  })

  describe('allowlisted hosts via FIRETOOL_ALLOWED_EMULATOR_HOSTS', () => {
    let original: string | undefined

    beforeAll(() => {
      original = process.env[ALLOWLIST_ENV]
    })

    afterAll(() => {
      if (original === undefined) {
        delete process.env[ALLOWLIST_ENV]
      } else {
        process.env[ALLOWLIST_ENV] = original
      }
    })

    it('returns false for host.docker.internal when allowlisted', () => {
      process.env[ALLOWLIST_ENV] = 'host.docker.internal'
      expect(isRemoteHost('host.docker.internal')).toBe(false)
    })

    it('returns true for host.docker.internal when NOT allowlisted (defaults blocked)', () => {
      delete process.env[ALLOWLIST_ENV]
      expect(isRemoteHost('host.docker.internal')).toBe(true)
    })

    it('returns false for a docker-compose service name when allowlisted', () => {
      process.env[ALLOWLIST_ENV] = 'firebase-emulator'
      expect(isRemoteHost('firebase-emulator')).toBe(false)
    })

    it('returns false for a WSL host alias when allowlisted', () => {
      process.env[ALLOWLIST_ENV] = 'wsl-host'
      expect(isRemoteHost('wsl-host')).toBe(false)
    })

    it('does not accept non-listed custom hostnames even when other hosts are allowlisted', () => {
      process.env[ALLOWLIST_ENV] = 'host.docker.internal'
      expect(isRemoteHost('other-docker-host')).toBe(true)
    })

    it('allowlisting a private LAN IP permits it (explicit opt-in)', () => {
      process.env[ALLOWLIST_ENV] = '192.168.1.100'
      expect(isRemoteHost('192.168.1.100')).toBe(false)
    })

    it('allowlist match is exact — partial hostname is not accepted', () => {
      process.env[ALLOWLIST_ENV] = 'docker.internal'
      expect(isRemoteHost('host.docker.internal')).toBe(true)
    })
  })
})

// ---------------------------------------------------------------------------
// Edge-case: assertEmulatorRunning with allowlisted hosts
// ---------------------------------------------------------------------------

describe('assertEmulatorRunning — allowlist integration', () => {
  let original: string | undefined

  beforeAll(() => {
    original = process.env[ALLOWLIST_ENV]
  })

  afterAll(() => {
    if (original === undefined) {
      delete process.env[ALLOWLIST_ENV]
    } else {
      process.env[ALLOWLIST_ENV] = original
    }
  })

  it('allows host.docker.internal when allowlisted', () => {
    process.env[ALLOWLIST_ENV] = 'host.docker.internal'
    const statuses = [makeStatus('firestore', { host: 'host.docker.internal' })]
    expect(assertEmulatorRunning('firestore', statuses)).toBeNull()
  })

  it('blocks host.docker.internal when NOT allowlisted', () => {
    delete process.env[ALLOWLIST_ENV]
    const statuses = [makeStatus('firestore', { host: 'host.docker.internal' })]
    const err = assertEmulatorRunning('firestore', statuses)
    expect(err).not.toBeNull()
    expect(err!.code).toBe('EMULATOR_NOT_RUNNING')
    expect(err!.message).toContain('not a local address')
  })

  it('hint mentions FIRETOOL_ALLOWED_EMULATOR_HOSTS for non-local host errors', () => {
    delete process.env[ALLOWLIST_ENV]
    const statuses = [makeStatus('firestore', { host: 'host.docker.internal' })]
    const err = assertEmulatorRunning('firestore', statuses)
    expect(err!.hint).toContain('FIRETOOL_ALLOWED_EMULATOR_HOSTS')
  })

  it('allows a private LAN IP when explicitly allowlisted', () => {
    process.env[ALLOWLIST_ENV] = '192.168.1.100'
    const statuses = [makeStatus('firestore', { host: '192.168.1.100' })]
    expect(assertEmulatorRunning('firestore', statuses)).toBeNull()
  })

  it('blocks a private LAN IP when NOT allowlisted', () => {
    delete process.env[ALLOWLIST_ENV]
    const statuses = [makeStatus('firestore', { host: '192.168.1.100' })]
    const err = assertEmulatorRunning('firestore', statuses)
    expect(err).not.toBeNull()
    expect(err!.code).toBe('EMULATOR_NOT_RUNNING')
  })

  it('allows multiple allowlisted hosts (comma-separated)', () => {
    process.env[ALLOWLIST_ENV] = 'host.docker.internal,firebase-emulator'
    const firestoreStatuses = [makeStatus('firestore', { host: 'host.docker.internal' })]
    const authStatuses = [makeStatus('auth', { host: 'firebase-emulator' })]
    expect(assertEmulatorRunning('firestore', firestoreStatuses)).toBeNull()
    expect(assertEmulatorRunning('auth', authStatuses)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Edge-case: guardSensitiveOperation with allowlisted hosts
// ---------------------------------------------------------------------------

describe('guardSensitiveOperation — allowlist integration', () => {
  const target: TCommandTarget = { service: 'firestore' }
  let original: string | undefined

  beforeAll(() => {
    original = process.env[ALLOWLIST_ENV]
  })

  afterAll(() => {
    if (original === undefined) {
      delete process.env[ALLOWLIST_ENV]
    } else {
      process.env[ALLOWLIST_ENV] = original
    }
  })

  it('clears guard when docker host is allowlisted', () => {
    process.env[ALLOWLIST_ENV] = 'host.docker.internal'
    const statuses = [makeStatus('firestore', { host: 'host.docker.internal' })]
    expect(guardSensitiveOperation('firestore', target, statuses, undefined)).toBeNull()
  })

  it('blocks guard when docker host is NOT allowlisted', () => {
    delete process.env[ALLOWLIST_ENV]
    const statuses = [makeStatus('firestore', { host: 'host.docker.internal' })]
    const err = guardSensitiveOperation('firestore', target, statuses, undefined)
    expect(err!.code).toBe('EMULATOR_NOT_RUNNING')
  })

  it('does not weaken defaults: public Google host is still blocked even when allowlist is set', () => {
    process.env[ALLOWLIST_ENV] = 'host.docker.internal'
    const statuses = [makeStatus('firestore', { host: 'firestore.googleapis.com' })]
    const err = guardSensitiveOperation('firestore', target, statuses, undefined)
    expect(err!.code).toBe('EMULATOR_NOT_RUNNING')
  })
})
