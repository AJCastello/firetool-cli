import { router } from './trpc.ts'
import { diagnosticsRouter } from './procedures/diagnostics.ts'
import { helpRouter } from './procedures/help.ts'
import { authRouter } from './procedures/auth.ts'
import { firestoreRouter } from './procedures/firestore.ts'
import { rtdbRouter } from './procedures/rtdb.ts'
import { storageRouter } from './procedures/storage.ts'
import { functionsRouter } from './procedures/functions.ts'
import { pubsubRouter } from './procedures/pubsub.ts'
import { rulesRouter } from './procedures/rules.ts'

export const appRouter = router({
  diagnostics: diagnosticsRouter,
  help: helpRouter,
  auth: authRouter,
  firestore: firestoreRouter,
  rtdb: rtdbRouter,
  storage: storageRouter,
  functions: functionsRouter,
  pubsub: pubsubRouter,
  rules: rulesRouter,
})

export type AppRouter = typeof appRouter
