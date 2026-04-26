import { router, publicProcedure } from '../trpc.ts'
import { GetContextInputSchema } from '../../shared/schemas.ts'
import type { TFiretoolResult, TEmulatorStatus } from '../../shared/types.ts'
import { discoverContext } from '../../discovery/index.ts'
import { assertContextFound } from '../../policy/index.ts'

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

      return {
        ok: true,
        operation: 'diagnostics.getContext',
        result: statuses,
        warnings,
      }
    }),
})
