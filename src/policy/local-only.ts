import type { TEmulatorStatus, TCommandTarget, TFiretoolError } from '../shared/types.ts'
import { normalizeHost, classifyHostSync, readAllowlist } from './host-classification.ts'

/**
 * Returns true when `host` is not a permitted local emulator address.
 *
 * Delegates to the flexible host classification module. Reads the explicit
 * allowlist from FIRETOOL_ALLOWED_EMULATOR_HOSTS on every call so runtime
 * changes to the environment variable are respected without restart.
 */
export function isRemoteHost(host: string): boolean {
  const normalized = normalizeHost(host)
  const allowlist = readAllowlist()
  const category = classifyHostSync(normalized, allowlist)
  return category === 'blocked-remote'
}

/**
 * Validate that the context is sufficient to proceed.
 * Returns a TFiretoolError when the context is absent (no firebase.json found).
 */
export function assertContextFound(statuses: TEmulatorStatus[]): TFiretoolError | null {
  // Context is considered found if at least one service has a non-inferred source
  const hasDeclaredConfig = statuses.some((s) => s.source !== 'inferred')
  if (!hasDeclaredConfig) {
    return {
      code: 'CONTEXT_NOT_FOUND',
      message: 'No firebase.json or emulator environment variables found in this directory tree.',
      hint: 'Run "firebase init" or set FIRESTORE_EMULATOR_HOST (and friends) before using firetool.',
    }
  }
  return null
}

/**
 * Assert that a required emulator is running for the requested service.
 * Returns a TFiretoolError when blocked, null when clear to proceed.
 */
export function assertEmulatorRunning(
  service: string,
  statuses: TEmulatorStatus[],
): TFiretoolError | null {
  const status = statuses.find((s) => s.service === service)

  if (!status || !status.configured) {
    return {
      code: 'SERVICE_NOT_CONFIGURED',
      message: `The ${service} emulator is not configured in this Firebase project.`,
      hint: `Add the ${service} emulator to firebase.json or set the corresponding emulator host environment variable.`,
    }
  }

  // Block if host is remote — local-only policy
  if (status.host && isRemoteHost(status.host)) {
    return {
      code: 'EMULATOR_NOT_RUNNING',
      message: `The ${service} emulator host "${status.host}" is not a local address. firetool only operates against local emulators.`,
      hint: 'Set the emulator host to a local address (e.g. "localhost", "127.0.0.1", "0.0.0.0", or "::1"). For Docker/WSL hosts, set FIRETOOL_ALLOWED_EMULATOR_HOSTS=<hostname>.',
    }
  }

  if (!status.running) {
    return {
      code: 'EMULATOR_NOT_RUNNING',
      message: `The ${service} emulator is configured but not running (${status.host ?? 'localhost'}:${status.port ?? '?'}).`,
      hint: `Start the ${service} emulator with "firebase emulators:start --only ${service}" and retry.`,
    }
  }

  return null
}

/**
 * Assert that the target is unambiguous.
 * When multiple project aliases are found in .firebaserc and no explicit target.projectId
 * is provided, returns an AMBIGUOUS_TARGET error.
 * Force does NOT bypass an ambiguous target.
 *
 * @param target              The command target provided by the caller.
 * @param projectId           The resolved projectId from context (can be undefined).
 * @param allProjectAliases   All project aliases found in .firebaserc.
 */
export function assertUnambiguousTarget(
  target: TCommandTarget,
  projectId: string | undefined,
  allProjectAliases: string[] = [],
): TFiretoolError | null {
  // If target already carries an explicit projectId, it is unambiguous.
  if (target.projectId) return null

  // Multiple aliases in .firebaserc without an explicit target → ambiguous
  if (allProjectAliases.length > 1) {
    return {
      code: 'AMBIGUOUS_TARGET',
      message: `Multiple Firebase project aliases found (${allProjectAliases.join(', ')}) but no explicit project was specified.`,
      hint: 'Pass --project with the desired alias or provide target.projectId so firetool can identify the correct local resource.',
    }
  }

  return null
}

/**
 * Assert that confirmation has been granted for a destructive operation.
 * Returns CONFIRMATION_REQUIRED when `force` is false and `confirmed` is false.
 */
export function assertConfirmed(
  operationName: string,
  target: TCommandTarget,
  force: boolean,
  confirmed: boolean,
): TFiretoolError | null {
  if (force || confirmed) return null

  const targetDesc = [
    target.service,
    target.resourcePath ?? target.identifier,
  ]
    .filter(Boolean)
    .join(' / ')

  return {
    code: 'CONFIRMATION_REQUIRED',
    message: `"${operationName}" on ${targetDesc} is a destructive operation and requires confirmation.`,
    hint: 'Pass --force to skip confirmation in automation, or confirm interactively.',
  }
}

/**
 * Full local-only guard for a sensitive service operation.
 * Re-runs discovery checks (statuses must be fresh) and verifies:
 *   1. Context is present.
 *   2. The required emulator is running and local.
 *   3. The target is unambiguous (force does NOT bypass this).
 *
 * Returns the first blocking error found, or null when clear to proceed.
 */
export function guardSensitiveOperation(
  service: string,
  target: TCommandTarget,
  statuses: TEmulatorStatus[],
  projectId: string | undefined,
  allProjectAliases: string[] = [],
): TFiretoolError | null {
  const contextErr = assertContextFound(statuses)
  if (contextErr) return contextErr

  const runningErr = assertEmulatorRunning(service, statuses)
  if (runningErr) return runningErr

  const ambiguousErr = assertUnambiguousTarget(target, projectId, allProjectAliases)
  if (ambiguousErr) return ambiguousErr

  return null
}
