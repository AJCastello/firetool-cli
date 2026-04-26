import { router, publicProcedure } from '../trpc.ts'
import { RulesCheckInputSchema } from '../../shared/schemas.ts'
import type { TFiretoolResult } from '../../shared/types.ts'
import { discoverContext } from '../../discovery/index.ts'
import { assertContextFound, assertEmulatorRunning } from '../../policy/index.ts'
import { checkRules } from '../../adapters/rules/index.ts'

export const rulesRouter = router({
  check: publicProcedure
    .input(RulesCheckInputSchema)
    .mutation(async ({ input, ctx }): Promise<TFiretoolResult> => {
      const operation = 'rules.check'
      const target = { ...input.target, service: input.service }

      const { context, statuses } = await discoverContext(ctx.cwd)

      const contextErr = assertContextFound(statuses)
      if (contextErr) {
        return { ok: false, operation, target, warnings: [], error: contextErr }
      }

      // Rules run inside the service emulator (firestore or storage)
      const runningErr = assertEmulatorRunning(input.service, statuses)
      if (runningErr) {
        return { ok: false, operation, target, warnings: [], error: runningErr }
      }

      if (!context.projectId) {
        return {
          ok: false,
          operation,
          target,
          warnings: [],
          error: {
            code: 'CONTEXT_NOT_FOUND',
            message: 'No Firebase project ID found.',
            hint: 'Add a .firebaserc with a default project before checking rules.',
          },
        }
      }

      const serviceStatus = statuses.find((s) => s.service === input.service)!
      const host = serviceStatus.host ?? 'localhost'
      const port = serviceStatus.port ?? (input.service === 'firestore' ? 8080 : 9199)

      const resourcePath = input.target.resourcePath ?? ''
      const bucket = input.target.identifier

      const result = await checkRules(
        host,
        port,
        context.projectId,
        input.service,
        resourcePath,
        input.intent,
        bucket,
        input.auth,
      )

      if ('error' in result) {
        return { ok: false, operation, target, warnings: [], error: result.error }
      }

      const warnings: string[] = []
      if (result.data.notFound) {
        warnings.push(
          `The resource at "${resourcePath}" does not exist, but rules allowed the "${input.intent}" operation.`,
        )
      }

      return { ok: true, operation, target, warnings, result: result.data }
    }),
})
