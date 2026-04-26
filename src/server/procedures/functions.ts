import { router, publicProcedure } from '../trpc.ts'
import { FunctionsCallInputSchema } from '../../shared/schemas.ts'
import type { TFiretoolResult } from '../../shared/types.ts'
import { discoverContext } from '../../discovery/index.ts'
import { guardSensitiveOperation } from '../../policy/index.ts'
import { callFunction } from '../../adapters/functions/index.ts'

// Note: `call` is a tRPC reserved word — procedure named `invoke` instead.
// The operation string in results still reports `functions.call` per the SDS contract.
export const functionsRouter = router({
  invoke: publicProcedure
    .input(FunctionsCallInputSchema)
    .mutation(async ({ input, ctx }): Promise<TFiretoolResult> => {
      const operation = 'functions.call'
      const target = { service: 'functions' as const, identifier: input.nameOrUrl }

      const { context, statuses } = await discoverContext(ctx.cwd)
      const guardErr = guardSensitiveOperation('functions', target, statuses, context.projectId, context.allProjectAliases)
      if (guardErr) {
        return { ok: false, operation, target, warnings: [], error: guardErr }
      }

      const fnStatus = statuses.find((s) => s.service === 'functions')!
      const host = fnStatus.host ?? 'localhost'
      const port = fnStatus.port ?? 5001

      const result = await callFunction(host, port, context.projectId, input.nameOrUrl, input.data)
      if ('error' in result) {
        return { ok: false, operation, target, warnings: [], error: result.error }
      }

      return {
        ok: true,
        operation,
        target,
        warnings: fnStatus.source === 'inferred'
          ? ['Function endpoint resolved from default port — pass the full URL for a reliable target.']
          : [],
        result: result.data,
      }
    }),
})
