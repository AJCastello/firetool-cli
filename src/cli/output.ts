import type { TFiretoolResult } from '../shared/types.ts'
import { renderHuman, renderJson, exitCodeFor } from '../render/index.ts'

/**
 * Format a TFiretoolResult for CLI output.
 * Returns the formatted string and the appropriate process exit code.
 * Delegates to the render module so exit codes are per-error-category (RNF-03/RNF-04).
 */
export function formatResult(
  result: TFiretoolResult,
  json: boolean,
): { output: string; exitCode: number } {
  return {
    output: json ? renderJson(result) : renderHuman(result),
    exitCode: exitCodeFor(result),
  }
}
