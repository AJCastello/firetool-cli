import type { TFiretoolErrorCode } from '../shared/types.ts'

/** Per-error exit codes — all non-zero so shells can distinguish error categories. */
export const EXIT_CODES: Record<TFiretoolErrorCode, number> = {
  CONTEXT_NOT_FOUND: 2,
  SERVICE_NOT_CONFIGURED: 3,
  EMULATOR_NOT_RUNNING: 4,
  INVALID_INPUT: 5,
  CONFIRMATION_REQUIRED: 6,
  RULE_DENIED: 7,
  AMBIGUOUS_TARGET: 8,
}

/** Default messages for each error code — procedures may override these. */
export const DEFAULT_MESSAGES: Record<TFiretoolErrorCode, string> = {
  CONTEXT_NOT_FOUND:
    'No Firebase project context found in the current directory tree.',
  SERVICE_NOT_CONFIGURED:
    'The requested service is not declared in firebase.json or emulator environment variables.',
  EMULATOR_NOT_RUNNING:
    'The required emulator is configured but not running or not accessible locally.',
  INVALID_INPUT:
    'The provided JSON, flags, path, or identifier is unusable.',
  CONFIRMATION_REQUIRED:
    'This destructive operation requires confirmation or the --force flag.',
  RULE_DENIED:
    'Local security rules denied the described operation.',
  AMBIGUOUS_TARGET:
    'The CLI cannot determine which local resource to affect.',
}

/** Default hints for each error code — procedures may override these. */
export const DEFAULT_HINTS: Record<TFiretoolErrorCode, string> = {
  CONTEXT_NOT_FOUND:
    'Run from a Firebase project directory containing firebase.json, or set the relevant EMULATOR_HOST environment variables.',
  SERVICE_NOT_CONFIGURED:
    'Add the service to the emulators section of firebase.json or set the corresponding host environment variable.',
  EMULATOR_NOT_RUNNING:
    'Start the required emulator with "firebase emulators:start" and retry.',
  INVALID_INPUT:
    'Check the provided data, flags, and paths. Use --dry-run to preview an operation before mutating state.',
  CONFIRMATION_REQUIRED:
    'Pass --force to skip confirmation in automation, or confirm interactively.',
  RULE_DENIED:
    'Review your local security rules file. Use "firetool rules check" to diagnose access for a specific target and identity.',
  AMBIGUOUS_TARGET:
    'Provide an explicit --project flag or run from a directory with a single unambiguous firebase.json.',
}

/**
 * Returns the exit code for a given TFiretoolErrorCode.
 * Returns 1 for undefined or unknown codes.
 */
export function exitCodeForErrorCode(code: TFiretoolErrorCode | undefined): number {
  if (!code) return 1
  return EXIT_CODES[code] ?? 1
}
