import { router, publicProcedure } from '../trpc.ts'
import { PubSubPublishInputSchema } from '../../shared/schemas.ts'
import type { TFiretoolResult } from '../../shared/types.ts'
import { discoverContext } from '../../discovery/index.ts'
import { guardSensitiveOperation } from '../../policy/index.ts'
import { publishMessage } from '../../adapters/pubsub/index.ts'

export const pubsubRouter = router({
  publish: publicProcedure
    .input(PubSubPublishInputSchema)
    .mutation(async ({ input, ctx }): Promise<TFiretoolResult> => {
      const operation = 'pubsub.publish'
      const target = { service: 'pubsub' as const, identifier: input.topic }

      const { context, statuses } = await discoverContext(ctx.cwd)
      const guardErr = guardSensitiveOperation('pubsub', target, statuses, context.projectId, context.allProjectAliases)
      if (guardErr) {
        return { ok: false, operation, target, warnings: [], error: guardErr }
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
            hint: 'Add a .firebaserc with a default project before publishing to Pub/Sub.',
          },
        }
      }

      const psStatus = statuses.find((s) => s.service === 'pubsub')!
      const host = psStatus.host ?? 'localhost'
      const port = psStatus.port ?? 8085

      const result = await publishMessage(
        host,
        port,
        context.projectId,
        input.topic,
        input.data,
        input.attributes,
      )
      if ('error' in result) {
        return { ok: false, operation, target, warnings: [], error: result.error }
      }

      return { ok: true, operation, target, warnings: [], result: result.data }
    }),
})
