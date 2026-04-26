import { router, publicProcedure } from '../trpc.ts'
import { z } from 'zod'
import { AuthExecuteInputSchema } from '../../shared/schemas.ts'
import type { TFiretoolResult, TCommandTarget } from '../../shared/types.ts'
import { discoverContext } from '../../discovery/index.ts'
import { guardSensitiveOperation, assertConfirmed } from '../../policy/index.ts'
import {
  listUsers,
  createUser,
  getUser,
  updateUser,
  deleteUser,
  clearUsers,
} from '../../adapters/auth/index.ts'
import type { CreateUserData, UpdateUserData } from '../../adapters/auth/index.ts'

const KNOWN_ACTIONS = [
  'create-user',
  'list-users',
  'get-user',
  'update-user',
  'delete-user',
  'clear-users',
] as const

type AuthAction = (typeof KNOWN_ACTIONS)[number]

const DESTRUCTIVE_ACTIONS = new Set<AuthAction>(['delete-user', 'clear-users'])

const CreateUserDataSchema = z.object({
  email: z.string().optional(),
  password: z.string().optional(),
  displayName: z.string().optional(),
  phoneNumber: z.string().optional(),
  disabled: z.boolean().optional(),
  emailVerified: z.boolean().optional(),
})

const UpdateUserDataSchema = CreateUserDataSchema

function resolveProjectId(
  target: TCommandTarget,
  contextProjectId: string | undefined,
): string | null {
  return target.projectId ?? contextProjectId ?? null
}

export const authRouter = router({
  execute: publicProcedure
    .input(AuthExecuteInputSchema)
    .mutation(async ({ input, ctx }): Promise<TFiretoolResult> => {
      const operation = `auth.${input.action}`

      // Validate action
      if (!(KNOWN_ACTIONS as readonly string[]).includes(input.action)) {
        return {
          ok: false,
          operation,
          target: input.target,
          warnings: [],
          error: {
            code: 'INVALID_INPUT',
            message: `Unknown auth action "${input.action}".`,
            hint: `Valid actions: ${KNOWN_ACTIONS.join(', ')}.`,
          },
        }
      }

      const action = input.action as AuthAction

      // Discovery and local-only guard
      const { context, statuses } = await discoverContext(ctx.cwd)
      const guardErr = guardSensitiveOperation('auth', input.target, statuses, context.projectId, context.allProjectAliases)
      if (guardErr) {
        return { ok: false, operation, target: input.target, warnings: [], error: guardErr }
      }

      const projectId = resolveProjectId(input.target, context.projectId)
      if (!projectId) {
        return {
          ok: false,
          operation,
          target: input.target,
          warnings: [],
          error: {
            code: 'INVALID_INPUT',
            message: 'No Firebase project ID found.',
            hint: 'Add a .firebaserc with a default project or pass --project.',
          },
        }
      }

      const authStatus = statuses.find((s) => s.service === 'auth')!
      const host = authStatus.host ?? 'localhost'
      const port = authStatus.port ?? 9099

      // Destructive actions require force
      if (DESTRUCTIVE_ACTIONS.has(action)) {
        const confirmErr = assertConfirmed(action, input.target, input.force ?? false, false)
        if (confirmErr) {
          return { ok: false, operation, target: input.target, warnings: [], error: confirmErr }
        }
      }

      // Route to adapter
      switch (action) {
        case 'list-users': {
          const result = await listUsers(host, port, projectId)
          if ('error' in result) {
            return { ok: false, operation, target: input.target, warnings: [], error: result.error }
          }
          return {
            ok: true,
            operation,
            target: input.target,
            warnings: [],
            result: { users: result.data, count: result.data.length },
          }
        }

        case 'create-user': {
          const parsed = CreateUserDataSchema.safeParse(input.data ?? {})
          if (!parsed.success) {
            return {
              ok: false,
              operation,
              target: input.target,
              warnings: [],
              error: {
                code: 'INVALID_INPUT',
                message: `Invalid user data: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
                hint: 'Provide valid email, password, displayName, phoneNumber, disabled, or emailVerified fields.',
              },
            }
          }
          const result = await createUser(host, port, projectId, parsed.data as CreateUserData)
          if ('error' in result) {
            return { ok: false, operation, target: input.target, warnings: [], error: result.error }
          }
          return {
            ok: true,
            operation,
            target: { ...input.target, identifier: result.data.localId },
            warnings: [],
            result: result.data,
          }
        }

        case 'get-user': {
          const identifier = input.target.identifier
          if (!identifier) {
            return {
              ok: false,
              operation,
              target: input.target,
              warnings: [],
              error: {
                code: 'INVALID_INPUT',
                message: 'get-user requires a uid or email as identifier.',
                hint: 'Pass the uid or email via --identifier.',
              },
            }
          }
          const result = await getUser(host, port, projectId, identifier)
          if ('error' in result) {
            return { ok: false, operation, target: input.target, warnings: [], error: result.error }
          }
          return {
            ok: true,
            operation,
            target: input.target,
            warnings: [],
            result: result.data,
          }
        }

        case 'update-user': {
          const localId = input.target.identifier
          if (!localId) {
            return {
              ok: false,
              operation,
              target: input.target,
              warnings: [],
              error: {
                code: 'INVALID_INPUT',
                message: 'update-user requires the uid as identifier.',
                hint: 'Pass the uid via --identifier.',
              },
            }
          }
          const parsed = UpdateUserDataSchema.safeParse(input.data ?? {})
          if (!parsed.success) {
            return {
              ok: false,
              operation,
              target: input.target,
              warnings: [],
              error: {
                code: 'INVALID_INPUT',
                message: `Invalid update data: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
                hint: 'Provide valid email, password, displayName, phoneNumber, disabled, or emailVerified fields.',
              },
            }
          }
          const result = await updateUser(host, port, projectId, localId, parsed.data as UpdateUserData)
          if ('error' in result) {
            return { ok: false, operation, target: input.target, warnings: [], error: result.error }
          }
          return {
            ok: true,
            operation,
            target: input.target,
            warnings: [],
            result: result.data,
          }
        }

        case 'delete-user': {
          const localId = input.target.identifier
          if (!localId) {
            return {
              ok: false,
              operation,
              target: input.target,
              warnings: [],
              error: {
                code: 'INVALID_INPUT',
                message: 'delete-user requires the uid as identifier.',
                hint: 'Pass the uid via --identifier.',
              },
            }
          }
          const result = await deleteUser(host, port, projectId, localId)
          if ('error' in result) {
            return { ok: false, operation, target: input.target, warnings: [], error: result.error }
          }
          return {
            ok: true,
            operation,
            target: input.target,
            warnings: [],
            result: result.data,
          }
        }

        case 'clear-users': {
          const result = await clearUsers(host, port, projectId)
          if ('error' in result) {
            return { ok: false, operation, target: input.target, warnings: [], error: result.error }
          }
          return {
            ok: true,
            operation,
            target: input.target,
            warnings: [],
            result: result.data,
          }
        }
      }
    }),
})
