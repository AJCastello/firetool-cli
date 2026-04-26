import type { TFiretoolResult } from '../shared/types.ts'
import { exitCodeForErrorCode } from '../errors/catalog.ts'

/** Returns the process exit code for a result. */
export function exitCodeFor(result: TFiretoolResult): number {
  if (result.ok) return 0
  return exitCodeForErrorCode(result.error?.code)
}

/** Render a TFiretoolResult as pretty-printed JSON. */
export function renderJson(result: TFiretoolResult): string {
  return JSON.stringify(result, null, 2)
}

/** Render a TFiretoolResult as human-readable text. */
export function renderHuman(result: TFiretoolResult): string {
  const lines: string[] = []

  lines.push(result.ok ? `✓ ${result.operation}` : `✗ ${result.operation}`)

  if (result.target) {
    const parts: string[] = [result.target.service]
    if (result.target.resourcePath) parts.push(result.target.resourcePath)
    else if (result.target.identifier) parts.push(result.target.identifier)
    lines.push(`  Target: ${parts.join(' / ')}`)
  }

  if (result.ok && result.result !== undefined) {
    lines.push(JSON.stringify(result.result, null, 2))
  }

  if (!result.ok && result.error) {
    lines.push(`  Error:  [${result.error.code}] ${result.error.message}`)
    if (result.error.hint) {
      lines.push(`  Hint:   ${result.error.hint}`)
    }
  }

  for (const w of result.warnings) {
    lines.push(`⚠ ${w}`)
  }

  return lines.join('\n')
}
