import { createCallerFactory } from './trpc.ts'
import { appRouter } from './router.ts'

const makeServerCaller = createCallerFactory(appRouter)

/**
 * Creates an in-process tRPC caller with the given working directory as context.
 * No HTTP transport is involved — procedures execute in the same process.
 */
export function createCaller(cwd: string) {
  return makeServerCaller({ cwd })
}
