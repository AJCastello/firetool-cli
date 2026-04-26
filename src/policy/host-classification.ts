/**
 * @file host-classification.ts
 * Host classification contract for the flexible local-only emulator policy.
 *
 * Category model
 * ──────────────
 * known-local           loopback IPv4/IPv6 and bind-all addresses used by emulators
 * dns-resolved-loopback custom hostname whose DNS resolves exclusively to loopback addresses
 * allowlisted           exact normalized entry in FIRETOOL_ALLOWED_EMULATOR_HOSTS
 * blocked-remote        everything else (public, private-LAN, unresolvable)
 *
 * Design principles
 * ─────────────────
 * 1. Normalize first: strip accidental protocol, port, trailing dot, and brackets.
 * 2. Classify synchronously using known patterns and the explicit allowlist.
 * 3. Optionally resolve via DNS for unlisted custom hostnames.
 * 4. Block by default: unknown → blocked.
 * 5. Private LAN (10.x, 172.16-31.x, 192.168.x) stays blocked unless allowlisted.
 *
 * Known-local addresses
 * ─────────────────────
 * - localhost, localhost. (trailing dot)
 * - 127.0.0.0/8 (loopback IPv4)
 * - 0.0.0.0 (bind-all IPv4, commonly used by Firebase emulators)
 * - ::1 (loopback IPv6)
 * - [::1] (bracketed form, normalized to ::1)
 * - 0:0:0:0:0:0:0:1 (expanded IPv6 loopback)
 * - ::ffff:127.0.0.1 (IPv4-mapped loopback)
 * - :: (bind-all IPv6)
 *
 * Blocked by default
 * ──────────────────
 * - Any public hostname (example.com, firebaseio.com, …)
 * - Private LAN: 10.x.x.x, 172.16–31.x.x, 192.168.x.x
 * - Any hostname that fails DNS resolution or resolves to non-loopback
 *
 * Allowlist escape hatch
 * ──────────────────────
 * Set FIRETOOL_ALLOWED_EMULATOR_HOSTS to a comma-separated list of hostnames.
 * Each entry is normalized before comparison. Exact match after normalization.
 * Intended for: host.docker.internal, docker-compose service names, WSL aliases.
 *
 * Example:
 *   FIRETOOL_ALLOWED_EMULATOR_HOSTS=host.docker.internal,firebase-emulator
 */

/** The four host classification categories. */
export type HostCategory =
  | 'known-local'
  | 'dns-resolved-loopback'
  | 'allowlisted'
  | 'blocked-remote'

/** Full result returned by classifyHostAsync. */
export type HostClassificationResult = {
  /** The raw value before any transformation. */
  original: string
  /** Host after stripping protocol, port, trailing dot, and brackets; lowercased. */
  normalized: string
  /** Assigned classification category. */
  category: HostCategory
  /** Convenience: true when the category permits local emulator access. */
  isLocal: boolean
}

/**
 * Normalize a raw host value from firebase.json, env vars, or CLI flags.
 *
 * Transformations applied in order:
 *   1. Trim whitespace.
 *   2. Strip protocol prefix (http:// or https://).
 *   3. Strip brackets from IPv6: [::1] → ::1.
 *   4. Strip port suffix: "localhost:8080" → "localhost".
 *      After bracket-stripping, a trailing ":<port>" is removed from remaining value.
 *   5. Strip trailing dot: "localhost." → "localhost".
 *   6. Lowercase.
 *
 * @returns The normalized host string. Returns the original (trimmed, lowercased)
 *          value if parsing produces an empty string, to avoid silent data loss.
 */
export function normalizeHost(raw: string): string {
  let h = raw.trim()

  // Strip protocol prefix
  h = h.replace(/^https?:\/\//i, '')

  // Handle bracketed IPv6: [::1] or [::1]:8080
  const bracketMatch = /^\[([^\]]+)\](?::\d+)?$/.exec(h)
  if (bracketMatch) {
    return (bracketMatch[1] ?? '').toLowerCase()
  }

  // Strip port only when there is exactly one colon and the suffix is digits.
  // Two or more colons means IPv6 — no port stripping.
  const colonCount = (h.match(/:/g) ?? []).length
  if (colonCount === 1) {
    const colonIdx = h.lastIndexOf(':')
    const afterColon = h.slice(colonIdx + 1)
    if (/^\d+$/.test(afterColon)) {
      h = h.slice(0, colonIdx)
    }
  }

  // Strip trailing dot (DNS absolute form)
  if (h.endsWith('.')) {
    h = h.slice(0, -1)
  }

  const result = h.toLowerCase()
  // Guard against empty result
  return result.length > 0 ? result : raw.trim().toLowerCase()
}

/**
 * Synchronously classify a normalized host value.
 *
 * Does NOT perform DNS resolution. Custom hostnames not in the allowlist
 * return 'blocked-remote'; the caller may optionally follow up with
 * classifyHostAsync for DNS-based resolution.
 *
 * @param normalizedHost  Output of normalizeHost().
 * @param allowlist       Normalized entries from readAllowlist().
 */
export function classifyHostSync(normalizedHost: string, allowlist: readonly string[]): HostCategory {
  const host = normalizeHost(normalizedHost)

  // 1. Explicit allowlist wins over all other checks
  if (allowlist.includes(host)) {
    return 'allowlisted'
  }

  // 2. Known-local addresses
  if (isKnownLocal(host)) {
    return 'known-local'
  }

  // 3. Everything else is blocked
  return 'blocked-remote'
}

/** Returns true when `host` (already normalized) is a known-local address. */
function isKnownLocal(host: string): boolean {
  // localhost
  if (host === 'localhost') return true

  // 127.0.0.0/8 loopback range
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true

  // bind-all IPv4 (commonly used by Firebase emulators)
  if (host === '0.0.0.0') return true

  // bind-all IPv6
  if (host === '::') return true

  // loopback IPv6 (compressed form)
  if (host === '::1') return true

  // expanded IPv6 loopback: 0:0:0:0:0:0:0:1
  // Use URL normalization to handle all expanded forms
  const normalized6 = normalizeIPv6Addr(host)
  if (normalized6 === '::1' || normalized6 === '::') return true

  // IPv4-mapped loopback: ::ffff:127.x.x.x
  if (/^::ffff:127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/i.test(host)) return true

  return false
}

/**
 * Attempt to normalize an IPv6 address string using URL parsing.
 * Returns the compressed canonical form (e.g. "::1"), or null on failure.
 */
function normalizeIPv6Addr(host: string): string | null {
  if (!host.includes(':')) return null
  try {
    const url = new URL(`http://[${host}]`)
    const h = url.hostname
    // WHATWG URL keeps brackets: [::1]
    if (h.startsWith('[') && h.endsWith(']')) return h.slice(1, -1)
    return h
  } catch {
    return null
  }
}

/**
 * Full async classification with optional DNS fallback.
 *
 * Algorithm:
 *   1. Normalize the raw host via normalizeHost().
 *   2. Run classifyHostSync() against the allowlist.
 *   3. If the result is 'blocked-remote' and the value appears to be a hostname
 *      (not a bare IP address), attempt DNS resolution.
 *   4. If every resolved address is known-local, return 'dns-resolved-loopback'.
 *   5. Otherwise return 'blocked-remote'.
 *
 * DNS failures (NXDOMAIN, timeout, mixed results) always yield 'blocked-remote'.
 *
 * @param raw       Raw host value (may include protocol or port).
 * @param allowlist Normalized entries from readAllowlist().
 */
export async function classifyHostAsync(
  raw: string,
  allowlist: readonly string[],
): Promise<HostClassificationResult> {
  const normalized = normalizeHost(raw)
  const syncCategory = classifyHostSync(normalized, allowlist)

  if (syncCategory !== 'blocked-remote') {
    return { original: raw, normalized, category: syncCategory, isLocal: true }
  }

  // Only attempt DNS resolution for plain hostnames (no digits-only segments, looks like a name)
  if (looksLikeHostname(normalized)) {
    const resolved = await resolveToIPs(normalized)
    if (resolved.length > 0 && resolved.every((ip) => isKnownLocalIP(ip))) {
      return { original: raw, normalized, category: 'dns-resolved-loopback', isLocal: true }
    }
  }

  return { original: raw, normalized, category: 'blocked-remote', isLocal: false }
}

/** Returns true when `host` looks like a DNS name rather than a bare IP. */
function looksLikeHostname(host: string): boolean {
  // Pure IPv4 or IPv6 addresses are not hostname-resolvable
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false
  if (host.includes(':')) return false
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(host)
}

/** Returns true when `ip` is a known-local address (used for DNS result validation). */
function isKnownLocalIP(ip: string): boolean {
  return isKnownLocal(ip)
}

/** Resolve a hostname to all its IPv4 and IPv6 addresses. Returns [] on failure. */
async function resolveToIPs(hostname: string): Promise<string[]> {
  const { promises: dns } = await import('node:dns')
  const [v4Result, v6Result] = await Promise.allSettled([
    dns.resolve4(hostname),
    dns.resolve6(hostname),
  ])
  const ips: string[] = []
  if (v4Result.status === 'fulfilled') ips.push(...v4Result.value)
  if (v6Result.status === 'fulfilled') ips.push(...v6Result.value)
  return ips
}

/**
 * Read the explicit allowlist from FIRETOOL_ALLOWED_EMULATOR_HOSTS.
 *
 * Parses a comma-separated list of hostnames. Each entry is trimmed and
 * normalized via normalizeHost() before being returned. Empty entries are
 * filtered out. Returns an empty array when the variable is unset or blank.
 */
export function readAllowlist(): readonly string[] {
  const raw = process.env['FIRETOOL_ALLOWED_EMULATOR_HOSTS']
  if (!raw || !raw.trim()) return []
  return raw
    .split(',')
    .map((entry) => normalizeHost(entry))
    .filter((entry) => entry.length > 0)
}
