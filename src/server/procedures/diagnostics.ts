import { router, publicProcedure } from '../trpc.ts'
import { GetContextInputSchema } from '../../shared/schemas.ts'
import type { TFiretoolResult, TEmulatorStatus } from '../../shared/types.ts'
import { discoverContext } from '../../discovery/index.ts'
import { assertContextFound } from '../../policy/index.ts'
import { buildEmulatorStartCommand } from '../../shared/emulators.ts'

/**
 * Describe what to start when configured emulators are down.
 *
 * `doctor` is the first command the agent flow tells callers to run, so a
 * diagnosis that stops at "not running" leaves them to work out the Firebase
 * invocation themselves — and the service names Firetool uses are not all names
 * the Firebase CLI accepts. The command is derived from what discovery actually
 * found, so it names only emulators this project declares.
 *
 * Returns null when nothing is configured-but-down, including the case where a
 * project declares no emulators at all.
 */
function buildStartSuggestion(statuses: TEmulatorStatus[]): string | null {
  const down = statuses.filter((status) => status.configured && !status.running)
  if (down.length === 0) return null

  // The command is the authoritative list. Naming the Firetool services alongside
  // it would contradict it: `rules` is served by the firestore emulator and has
  // none of its own, so it belongs in a "not running" list but never in --only,
  // and the discrepancy reads as a command missing an emulator.
  const anyRunning = statuses.some((status) => status.configured && status.running)
  const subject = anyRunning
    ? 'Some configured emulators are not running.'
    : 'No configured emulator is running.'

  return `${subject} Start them with: ${buildEmulatorStartCommand(down.map((s) => s.service))}`
}

export const diagnosticsRouter = router({
  getContext: publicProcedure
    .input(GetContextInputSchema)
    .query(async ({ input }): Promise<TFiretoolResult<TEmulatorStatus[]>> => {
      const { context, statuses } = await discoverContext(input.cwd)

      const contextErr = assertContextFound(statuses)
      if (contextErr) {
        return {
          ok: false,
          operation: 'diagnostics.getContext',
          warnings: [],
          error: contextErr,
        }
      }

      const warnings: string[] = []

      if (!context.firebaseRcFound) {
        warnings.push('No .firebaserc found — project ID may be unavailable.')
      }

      const startSuggestion = buildStartSuggestion(statuses)
      if (startSuggestion) {
        warnings.push(startSuggestion)
      }

      return {
        ok: true,
        operation: 'diagnostics.getContext',
        result: statuses,
        warnings,
      }
    }),
})
