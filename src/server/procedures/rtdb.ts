import { router, publicProcedure } from '../trpc.ts'
import { z } from 'zod'
import { ServiceExecuteInputSchema } from '../../shared/schemas.ts'
import type { TFiretoolResult, TCommandTarget } from '../../shared/types.ts'
import { discoverContext } from '../../discovery/index.ts'
import { guardSensitiveOperation, assertConfirmed } from '../../policy/index.ts'
import {
  getData,
  setData,
  updateData,
  pushData,
  deleteData,
  queryData,
  seedData,
  exportData,
} from '../../adapters/rtdb/index.ts'
import type { RtdbQueryFilter } from '../../adapters/rtdb/index.ts'

const KNOWN_ACTIONS = [
  'get',
  'set',
  'update',
  'push',
  'query',
  'seed',
  'import',
  'export',
  'delete',
  'clear',
] as const

type RtdbAction = (typeof KNOWN_ACTIONS)[number]

const DESTRUCTIVE_ACTIONS = new Set<RtdbAction>(['delete', 'clear', 'seed', 'import'])

const RtdbQueryFilterSchema = z.object({
  orderBy: z.string().optional(),
  equalTo: z.unknown().optional(),
  startAt: z.unknown().optional(),
  endAt: z.unknown().optional(),
  limitToFirst: z.number().int().positive().optional(),
  limitToLast: z.number().int().positive().optional(),
})

function resolveProjectId(
  target: TCommandTarget,
  contextProjectId: string | undefined,
): string | null {
  return target.projectId ?? contextProjectId ?? null
}

export const rtdbRouter = router({
  execute: publicProcedure
    .input(ServiceExecuteInputSchema)
    .mutation(async ({ input, ctx }): Promise<TFiretoolResult> => {
      const operation = `rtdb.${input.action}`

      if (!(KNOWN_ACTIONS as readonly string[]).includes(input.action)) {
        return {
          ok: false,
          operation,
          target: input.target,
          warnings: [],
          error: {
            code: 'INVALID_INPUT',
            message: `Unknown rtdb action "${input.action}".`,
            hint: `Valid actions: ${KNOWN_ACTIONS.join(', ')}.`,
          },
        }
      }

      const action = input.action as RtdbAction

      const { context, statuses } = await discoverContext(ctx.cwd)
      const guardErr = guardSensitiveOperation('rtdb', input.target, statuses, context.projectId, context.allProjectAliases)
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

      const rtdbStatus = statuses.find((s) => s.service === 'rtdb')!
      const host = rtdbStatus.host ?? 'localhost'
      const port = rtdbStatus.port ?? 9000

      const resourcePath = input.target.resourcePath ?? '/'

      if (DESTRUCTIVE_ACTIONS.has(action)) {
        if (input.dryRun) {
          return buildDryRunResult(operation, input.target, action, resourcePath, input.data)
        }
        const confirmErr = assertConfirmed(action, input.target, input.force ?? false, false)
        if (confirmErr) {
          return { ok: false, operation, target: input.target, warnings: [], error: confirmErr }
        }
      }

      switch (action) {
        case 'get': {
          const result = await getData(host, port, projectId, resourcePath)
          if ('error' in result) {
            return { ok: false, operation, target: input.target, warnings: [], error: result.error }
          }
          if (result.data === null) {
            return {
              ok: true,
              operation,
              target: input.target,
              warnings: ['No data found at this path.'],
              result: { path: resourcePath, data: null, absent: true },
            }
          }
          return {
            ok: true,
            operation,
            target: input.target,
            warnings: [],
            result: { path: resourcePath, data: result.data },
          }
        }

        case 'set': {
          if (input.data === undefined || input.data === null) {
            return invalidDataError(operation, input.target, 'set', 'any JSON value')
          }
          const result = await setData(host, port, projectId, resourcePath, input.data)
          if ('error' in result) {
            return { ok: false, operation, target: input.target, warnings: [], error: result.error }
          }
          return {
            ok: true,
            operation,
            target: input.target,
            warnings: [],
            result: { path: resourcePath, written: true },
          }
        }

        case 'update': {
          const data = toRecord(input.data)
          if (!data) {
            return invalidDataError(
              operation,
              input.target,
              'update',
              'a JSON object with top-level keys to merge',
            )
          }
          const result = await updateData(host, port, projectId, resourcePath, data)
          if ('error' in result) {
            return { ok: false, operation, target: input.target, warnings: [], error: result.error }
          }
          return {
            ok: true,
            operation,
            target: input.target,
            warnings: [],
            result: { path: resourcePath, updated: true, data: result.data },
          }
        }

        case 'push': {
          if (input.data === undefined || input.data === null) {
            return invalidDataError(operation, input.target, 'push', 'any JSON value')
          }
          const result = await pushData(host, port, projectId, resourcePath, input.data)
          if ('error' in result) {
            return { ok: false, operation, target: input.target, warnings: [], error: result.error }
          }
          return {
            ok: true,
            operation,
            target: input.target,
            warnings: [],
            result: { path: resourcePath, key: result.data.name, pushed: true },
          }
        }

        case 'query': {
          const filterRaw = input.data as unknown
          let filter: RtdbQueryFilter = {}
          if (filterRaw !== undefined && filterRaw !== null) {
            const parsed = RtdbQueryFilterSchema.safeParse(filterRaw)
            if (!parsed.success) {
              return {
                ok: false,
                operation,
                target: input.target,
                warnings: [],
                error: {
                  code: 'INVALID_INPUT',
                  message: `Invalid query filter: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
                  hint: 'Provide a filter as { orderBy?, equalTo?, startAt?, endAt?, limitToFirst?, limitToLast? }.',
                },
              }
            }
            filter = parsed.data as RtdbQueryFilter
          }
          const result = await queryData(host, port, projectId, resourcePath, filter)
          if ('error' in result) {
            return { ok: false, operation, target: input.target, warnings: [], error: result.error }
          }
          return {
            ok: true,
            operation,
            target: input.target,
            warnings: [],
            result: { path: resourcePath, data: result.data },
          }
        }

        case 'seed':
        case 'import': {
          if (input.data === undefined || input.data === null) {
            return invalidDataError(
              operation,
              input.target,
              action,
              'a JSON value (object, array, or primitive) to write at the path',
            )
          }
          const result = await seedData(host, port, projectId, resourcePath, input.data)
          if ('error' in result) {
            return { ok: false, operation, target: input.target, warnings: [], error: result.error }
          }
          return {
            ok: true,
            operation,
            target: input.target,
            warnings: [],
            result: {
              ...result.data,
              source: action === 'import' ? 'provided-data' : 'provided-json',
            },
          }
        }

        case 'export': {
          const result = await exportData(host, port, projectId, resourcePath)
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

        case 'delete': {
          const result = await deleteData(host, port, projectId, resourcePath)
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

        case 'clear': {
          // Clear root — deletes everything at "/"
          const result = await deleteData(host, port, projectId, '/')
          if ('error' in result) {
            return { ok: false, operation, target: input.target, warnings: [], error: result.error }
          }
          return {
            ok: true,
            operation,
            target: input.target,
            warnings: [],
            result: { cleared: true, projectId },
          }
        }
      }
    }),
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function invalidDataError(
  operation: string,
  target: TCommandTarget,
  action: string,
  expected: string,
): TFiretoolResult {
  return {
    ok: false,
    operation,
    target,
    warnings: [],
    error: {
      code: 'INVALID_INPUT',
      message: `"${action}" requires valid data.`,
      hint: `Provide --data or --file with ${expected}.`,
    },
  }
}

function toRecord(data: unknown): Record<string, unknown> | null {
  if (data === null || data === undefined) return null
  if (typeof data !== 'object' || Array.isArray(data)) return null
  return data as Record<string, unknown>
}

function buildDryRunResult(
  operation: string,
  target: TCommandTarget,
  action: RtdbAction,
  resourcePath: string,
  data: unknown,
): TFiretoolResult {
  const intent = describeDryRunIntent(action, resourcePath, data)
  return {
    ok: true,
    operation,
    target,
    warnings: ['dry-run: no changes were made to the Realtime Database Emulator.'],
    result: { dryRun: true, intent },
  }
}

function describeDryRunIntent(action: RtdbAction, resourcePath: string, data: unknown): string {
  const path = resourcePath || '/'
  switch (action) {
    case 'seed':
    case 'import':
      return `Would write data to path "${path}".`
    case 'delete':
      return `Would delete data at path "${path}".`
    case 'clear':
      return 'Would clear all data from the Realtime Database Emulator.'
    default:
      return `Would execute "${action}" on "${path}".`
  }
}
