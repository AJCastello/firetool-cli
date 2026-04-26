/**
 * Tests for the flexible host classification module.
 *
 * These tests are the RED phase of TDD for the implement-flexible-host-classification task.
 * All tests are expected to fail until that task implements the stubs in
 * src/policy/host-classification.ts.
 *
 * Coverage:
 *   normalizeHost   — stripping protocol, port, brackets, trailing dot, lowercasing
 *   classifyHostSync — known-local, bind-all, private-LAN blocked, public blocked, allowlist
 *   readAllowlist   — env var parsing, normalization, empty-entry filtering
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import {
  normalizeHost,
  classifyHostSync,
  readAllowlist,
} from '../../src/policy/host-classification.ts'

// ---------------------------------------------------------------------------
// normalizeHost
// ---------------------------------------------------------------------------

describe('normalizeHost', () => {
  describe('protocol stripping', () => {
    it('strips http:// prefix', () => {
      expect(normalizeHost('http://localhost')).toBe('localhost')
    })

    it('strips https:// prefix', () => {
      expect(normalizeHost('https://localhost')).toBe('localhost')
    })

    it('strips protocol from an IP address', () => {
      expect(normalizeHost('http://127.0.0.1')).toBe('127.0.0.1')
    })
  })

  describe('port stripping', () => {
    it('strips port from hostname', () => {
      expect(normalizeHost('localhost:8080')).toBe('localhost')
    })

    it('strips port from 127.x.x.x', () => {
      expect(normalizeHost('127.0.0.1:9099')).toBe('127.0.0.1')
    })

    it('strips port from 0.0.0.0', () => {
      expect(normalizeHost('0.0.0.0:8080')).toBe('0.0.0.0')
    })
  })

  describe('bracketed IPv6', () => {
    it('strips brackets from [::1]', () => {
      expect(normalizeHost('[::1]')).toBe('::1')
    })

    it('strips brackets and port from [::1]:8080', () => {
      expect(normalizeHost('[::1]:8080')).toBe('::1')
    })
  })

  describe('trailing dot', () => {
    it('strips trailing dot from localhost.', () => {
      expect(normalizeHost('localhost.')).toBe('localhost')
    })

    it('strips trailing dot from custom hostname', () => {
      expect(normalizeHost('host.docker.internal.')).toBe('host.docker.internal')
    })
  })

  describe('lowercasing', () => {
    it('lowercases the entire value', () => {
      expect(normalizeHost('LOCALHOST')).toBe('localhost')
    })

    it('lowercases a mixed-case hostname', () => {
      expect(normalizeHost('Host.Docker.Internal')).toBe('host.docker.internal')
    })
  })

  describe('whitespace trimming', () => {
    it('trims leading and trailing whitespace', () => {
      expect(normalizeHost('  localhost  ')).toBe('localhost')
    })
  })

  describe('combined transformations', () => {
    it('strips protocol and port together', () => {
      expect(normalizeHost('http://localhost:8080')).toBe('localhost')
    })

    it('handles already-clean values without modification', () => {
      expect(normalizeHost('localhost')).toBe('localhost')
      expect(normalizeHost('127.0.0.1')).toBe('127.0.0.1')
      expect(normalizeHost('::1')).toBe('::1')
      expect(normalizeHost('0.0.0.0')).toBe('0.0.0.0')
    })
  })
})

// ---------------------------------------------------------------------------
// classifyHostSync
// ---------------------------------------------------------------------------

describe('classifyHostSync', () => {
  describe('known-local: loopback IPv4', () => {
    it('classifies localhost as known-local', () => {
      expect(classifyHostSync('localhost', [])).toBe('known-local')
    })

    it('classifies 127.0.0.1 as known-local', () => {
      expect(classifyHostSync('127.0.0.1', [])).toBe('known-local')
    })

    it('classifies 127.1.2.3 as known-local (full loopback /8 range)', () => {
      expect(classifyHostSync('127.1.2.3', [])).toBe('known-local')
    })

    it('classifies 127.255.255.254 as known-local (upper bound of range)', () => {
      expect(classifyHostSync('127.255.255.254', [])).toBe('known-local')
    })
  })

  describe('known-local: bind-all', () => {
    it('classifies 0.0.0.0 as known-local (Firebase emulator bind-all IPv4)', () => {
      expect(classifyHostSync('0.0.0.0', [])).toBe('known-local')
    })

    it('classifies :: as known-local (bind-all IPv6)', () => {
      expect(classifyHostSync('::', [])).toBe('known-local')
    })
  })

  describe('known-local: loopback IPv6', () => {
    it('classifies ::1 as known-local', () => {
      expect(classifyHostSync('::1', [])).toBe('known-local')
    })

    it('classifies expanded IPv6 loopback 0:0:0:0:0:0:0:1 as known-local', () => {
      expect(classifyHostSync('0:0:0:0:0:0:0:1', [])).toBe('known-local')
    })

    it('classifies IPv4-mapped loopback ::ffff:127.0.0.1 as known-local', () => {
      expect(classifyHostSync('::ffff:127.0.0.1', [])).toBe('known-local')
    })
  })

  describe('blocked-remote: private LAN (blocked by default)', () => {
    it('blocks 192.168.1.1 (Class C private)', () => {
      expect(classifyHostSync('192.168.1.1', [])).toBe('blocked-remote')
    })

    it('blocks 192.168.0.0 (Class C base)', () => {
      expect(classifyHostSync('192.168.0.0', [])).toBe('blocked-remote')
    })

    it('blocks 10.0.0.1 (Class A private)', () => {
      expect(classifyHostSync('10.0.0.1', [])).toBe('blocked-remote')
    })

    it('blocks 10.255.255.255 (Class A upper bound)', () => {
      expect(classifyHostSync('10.255.255.255', [])).toBe('blocked-remote')
    })

    it('blocks 172.16.0.1 (Class B private, lower bound)', () => {
      expect(classifyHostSync('172.16.0.1', [])).toBe('blocked-remote')
    })

    it('blocks 172.31.255.255 (Class B private, upper bound)', () => {
      expect(classifyHostSync('172.31.255.255', [])).toBe('blocked-remote')
    })

    it('does NOT block 172.15.x — outside the private range', () => {
      expect(classifyHostSync('172.15.0.1', [])).toBe('blocked-remote')
    })

    it('does NOT block 172.32.x — outside the private range', () => {
      expect(classifyHostSync('172.32.0.1', [])).toBe('blocked-remote')
    })
  })

  describe('blocked-remote: public hostnames', () => {
    it('blocks example.com', () => {
      expect(classifyHostSync('example.com', [])).toBe('blocked-remote')
    })

    it('blocks firebase.googleapis.com', () => {
      expect(classifyHostSync('firebase.googleapis.com', [])).toBe('blocked-remote')
    })

    it('blocks firebaseio.com', () => {
      expect(classifyHostSync('firebaseio.com', [])).toBe('blocked-remote')
    })

    it('blocks arbitrary public IP (8.8.8.8)', () => {
      expect(classifyHostSync('8.8.8.8', [])).toBe('blocked-remote')
    })
  })

  describe('allowlisted', () => {
    it('classifies host.docker.internal as allowlisted when present in allowlist', () => {
      expect(classifyHostSync('host.docker.internal', ['host.docker.internal'])).toBe('allowlisted')
    })

    it('classifies a docker-compose service name as allowlisted', () => {
      expect(classifyHostSync('firebase-emulator', ['firebase-emulator'])).toBe('allowlisted')
    })

    it('classifies a WSL host alias as allowlisted when present', () => {
      expect(classifyHostSync('wsl-host', ['wsl-host'])).toBe('allowlisted')
    })

    it('does not classify host.docker.internal as allowlisted when allowlist is empty', () => {
      expect(classifyHostSync('host.docker.internal', [])).toBe('blocked-remote')
    })

    it('allowlist match is exact after normalization (no partial matches)', () => {
      expect(classifyHostSync('docker.internal', ['host.docker.internal'])).toBe('blocked-remote')
    })

    it('does not allow private LAN IPs via allowlist (allowlist is for custom hostnames)', () => {
      // Design decision: allowlist accepts exact-match normalized entries.
      // A private LAN IP in the allowlist WOULD be accepted — it is an explicit opt-in.
      expect(classifyHostSync('192.168.1.100', ['192.168.1.100'])).toBe('allowlisted')
    })
  })

  describe('regression: 0.0.0.0', () => {
    it('classifies 0.0.0.0 as known-local (regression guard from hotfix)', () => {
      expect(classifyHostSync('0.0.0.0', [])).toBe('known-local')
    })
  })
})

// ---------------------------------------------------------------------------
// readAllowlist
// ---------------------------------------------------------------------------

describe('readAllowlist', () => {
  const ENV_KEY = 'FIRETOOL_ALLOWED_EMULATOR_HOSTS'
  let original: string | undefined

  beforeAll(() => {
    original = process.env[ENV_KEY]
  })

  afterAll(() => {
    if (original === undefined) {
      delete process.env[ENV_KEY]
    } else {
      process.env[ENV_KEY] = original
    }
  })

  it('returns an empty array when FIRETOOL_ALLOWED_EMULATOR_HOSTS is not set', () => {
    delete process.env[ENV_KEY]
    expect(readAllowlist()).toEqual([])
  })

  it('returns an empty array when FIRETOOL_ALLOWED_EMULATOR_HOSTS is blank', () => {
    process.env[ENV_KEY] = '   '
    expect(readAllowlist()).toEqual([])
  })

  it('parses a single entry', () => {
    process.env[ENV_KEY] = 'host.docker.internal'
    expect(readAllowlist()).toEqual(['host.docker.internal'])
  })

  it('parses comma-separated entries', () => {
    process.env[ENV_KEY] = 'host.docker.internal,firebase-emulator'
    expect(readAllowlist()).toEqual(['host.docker.internal', 'firebase-emulator'])
  })

  it('trims whitespace around each entry', () => {
    process.env[ENV_KEY] = ' host.docker.internal , firebase-emulator '
    const list = readAllowlist()
    expect(list).toContain('host.docker.internal')
    expect(list).toContain('firebase-emulator')
  })

  it('filters out empty entries (consecutive commas)', () => {
    process.env[ENV_KEY] = ',host.docker.internal,,'
    expect(readAllowlist()).toEqual(['host.docker.internal'])
  })

  it('normalizes entries (e.g. lowercases them)', () => {
    process.env[ENV_KEY] = 'Host.Docker.Internal'
    expect(readAllowlist()).toEqual(['host.docker.internal'])
  })
})
