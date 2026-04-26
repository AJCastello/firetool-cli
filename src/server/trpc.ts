import { initTRPC } from '@trpc/server'

export type Context = {
  cwd: string
}

const t = initTRPC.context<Context>().create()

export const router = t.router
export const publicProcedure = t.procedure
export const createCallerFactory = t.createCallerFactory
