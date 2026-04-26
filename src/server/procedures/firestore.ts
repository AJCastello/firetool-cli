import { router, publicProcedure } from '../trpc.ts'
import { z } from 'zod'
import { ServiceExecuteInputSchema } from '../../shared/schemas.ts'
import type { TFiretoolResult, TCommandTarget } from '../../shared/types.ts'
import { discoverContext } from '../../discovery/index.ts'
import { guardSensitiveOperation, assertConfirmed } from '../../policy/index.ts'
import {
  getDocument,
  setDocument,
  updateDocument,
  deleteDocument,
  listDocuments,
  queryCollection,
  deleteCollection,
  clearDatabase,
  seedCollection,
  exportCollection,
} from '../../adapters/firestore/index.ts'
import type { QueryFilter, SeedDoc } from '../../adapters/firestore/index.ts'

const KNOWN_ACTIONS = [
  'get',
  'set',
  'update',
  'query',
  'list',
  'seed',
  'import',
  'export',
  'delete',
  'delete-collection',
  'clear',
] as const

type FirestoreAction = (typeof KNOWN_ACTIONS)[number]

const DESTRUCTIVE_ACTIONS = new Set<FirestoreAction>([
  'delete',
  'delete-collection',
  'clear',
  'seed',
  'import',
])

const QueryFilterSchema = z.object({
  field: z.string(),
  op: z.enum([
    'EQUAL',
    'LESS_THAN',
    'LESS_THAN_OR_EQUAL',
    'GREATER_THAN',
    'GREATER_THAN_OR_EQUAL',
    'ARRAY_CONTAINS',
  ]),
  value: z.unknown(),
})

function resolveProjectId(
  target: TCommandTarget,
  contextProjectId: string | undefined,
): string | null {
  return target.projectId ?? contextProjectId ?? null
}

/**
 * Parse resourcePath into collection + optional docId.
 * "products" → { collection: "products", docId: null }
 * "products/abc" → { collection: "products", docId: "abc" }
 * "products/abc/reviews/xyz" → { collection: "products/abc/reviews", docId: "xyz" }
 */
function parseResourcePath(resourcePath: string): { collection: string; docId: string | null } {
  const parts = resourcePath.split('/').filter(Boolean)
  if (parts.length === 0) return { collection: '', docId: null }
  if (parts.length % 2 === 0) {
    // Even segments → last segment is docId
    const docId = parts[parts.length - 1]!
    const collection = parts.slice(0, -1).join('/')
    return { collection, docId }
  }
  // Odd segments → whole path is a collection
  return { collection: parts.join('/'), docId: null }
}

export const firestoreRouter = router({
  execute: publicProcedure
    .input(ServiceExecuteInputSchema)
    .mutation(async ({ input, ctx }): Promise<TFiretoolResult> => {
      const operation = `firestore.${input.action}`

      // Validate action
      if (!(KNOWN_ACTIONS as readonly string[]).includes(input.action)) {
        return {
          ok: false,
          operation,
          target: input.target,
          warnings: [],
          error: {
            code: 'INVALID_INPUT',
            message: `Unknown firestore action "${input.action}".`,
            hint: `Valid actions: ${KNOWN_ACTIONS.join(', ')}.`,
          },
        }
      }

      const action = input.action as FirestoreAction

      // Discovery and local-only guard
      const { context, statuses } = await discoverContext(ctx.cwd)
      const guardErr = guardSensitiveOperation('firestore', input.target, statuses, context.projectId, context.allProjectAliases)
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

      const firestoreStatus = statuses.find((s) => s.service === 'firestore')!
      const host = firestoreStatus.host ?? 'localhost'
      const port = firestoreStatus.port ?? 8080

      // Resolve resourcePath
      const resourcePath = input.target.resourcePath ?? ''

      // Destructive actions: dry-run describes intent without mutating; without dry-run, require force
      if (DESTRUCTIVE_ACTIONS.has(action)) {
        if (input.dryRun) {
          return buildDryRunResult(operation, input.target, action, resourcePath, input.data)
        }
        const confirmErr = assertConfirmed(action, input.target, input.force ?? false, false)
        if (confirmErr) {
          return { ok: false, operation, target: input.target, warnings: [], error: confirmErr }
        }
      }

      // Route to adapter
      switch (action) {
        case 'get': {
          const { collection, docId } = parseResourcePath(resourcePath)
          if (!collection || !docId) {
            return missingPathError(operation, input.target, 'get', 'collection/docId (e.g. products/abc123)')
          }
          const result = await getDocument(host, port, projectId, collection, docId)
          if ('error' in result) return { ok: false, operation, target: input.target, warnings: [], error: result.error }
          return { ok: true, operation, target: input.target, warnings: [], result: result.data }
        }

        case 'list': {
          const { collection } = parseResourcePath(resourcePath)
          if (!collection) {
            return missingPathError(operation, input.target, 'list', 'collection path (e.g. products)')
          }
          const result = await listDocuments(host, port, projectId, collection)
          if ('error' in result) return { ok: false, operation, target: input.target, warnings: [], error: result.error }
          return {
            ok: true,
            operation,
            target: input.target,
            warnings: [],
            result: { documents: result.data, count: result.data.length },
          }
        }

        case 'set': {
          const { collection, docId } = parseResourcePath(resourcePath)
          if (!collection) {
            return missingPathError(operation, input.target, 'set', 'collection/docId or collection')
          }
          const data = toRecord(input.data)
          if (!data) {
            return invalidDataError(operation, input.target, 'set', 'a JSON object with document fields')
          }
          const result = await setDocument(host, port, projectId, collection, docId, data)
          if ('error' in result) return { ok: false, operation, target: input.target, warnings: [], error: result.error }
          return {
            ok: true,
            operation,
            target: { ...input.target, resourcePath: `${collection}/${result.data.id}` },
            warnings: [],
            result: result.data,
          }
        }

        case 'update': {
          const { collection, docId } = parseResourcePath(resourcePath)
          if (!collection || !docId) {
            return missingPathError(operation, input.target, 'update', 'collection/docId (e.g. products/abc123)')
          }
          const data = toRecord(input.data)
          if (!data) {
            return invalidDataError(operation, input.target, 'update', 'a JSON object with fields to update')
          }
          const result = await updateDocument(host, port, projectId, collection, docId, data)
          if ('error' in result) return { ok: false, operation, target: input.target, warnings: [], error: result.error }
          return { ok: true, operation, target: input.target, warnings: [], result: result.data }
        }

        case 'query': {
          const { collection } = parseResourcePath(resourcePath)
          if (!collection) {
            return missingPathError(operation, input.target, 'query', 'collection path (e.g. products)')
          }
          const filtersRaw = input.data as unknown
          let filters: QueryFilter[] = []
          if (Array.isArray(filtersRaw)) {
            const parsed = z.array(QueryFilterSchema).safeParse(filtersRaw)
            if (!parsed.success) {
              return {
                ok: false,
                operation,
                target: input.target,
                warnings: [],
                error: {
                  code: 'INVALID_INPUT',
                  message: `Invalid query filters: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
                  hint: 'Provide filters as an array of { field, op, value } objects. Valid ops: EQUAL, LESS_THAN, LESS_THAN_OR_EQUAL, GREATER_THAN, GREATER_THAN_OR_EQUAL, ARRAY_CONTAINS.',
                },
              }
            }
            filters = parsed.data as QueryFilter[]
          }
          const result = await queryCollection(host, port, projectId, collection, filters)
          if ('error' in result) return { ok: false, operation, target: input.target, warnings: [], error: result.error }
          return {
            ok: true,
            operation,
            target: input.target,
            warnings: [],
            result: { documents: result.data, count: result.data.length },
          }
        }

        case 'seed':
        case 'import': {
          const { collection } = parseResourcePath(resourcePath)
          if (!collection) {
            return missingPathError(operation, input.target, action, 'collection path (e.g. products)')
          }
          const docs = toSeedDocs(input.data)
          if (!docs) {
            return invalidDataError(
              operation,
              input.target,
              action,
              'a JSON array of document objects (optionally with _id field)',
            )
          }
          const result = await seedCollection(host, port, projectId, collection, docs)
          if ('error' in result) return { ok: false, operation, target: input.target, warnings: [], error: result.error }
          return {
            ok: true,
            operation,
            target: input.target,
            warnings: [],
            result: { ...result.data, source: action === 'import' ? 'provided-data' : 'provided-json' },
          }
        }

        case 'export': {
          const { collection } = parseResourcePath(resourcePath)
          if (!collection) {
            return missingPathError(operation, input.target, 'export', 'collection path (e.g. products)')
          }
          const result = await exportCollection(host, port, projectId, collection)
          if ('error' in result) return { ok: false, operation, target: input.target, warnings: [], error: result.error }
          return { ok: true, operation, target: input.target, warnings: [], result: result.data }
        }

        case 'delete': {
          const { collection, docId } = parseResourcePath(resourcePath)
          if (!collection || !docId) {
            return missingPathError(operation, input.target, 'delete', 'collection/docId (e.g. products/abc123)')
          }
          const result = await deleteDocument(host, port, projectId, collection, docId)
          if ('error' in result) return { ok: false, operation, target: input.target, warnings: [], error: result.error }
          return { ok: true, operation, target: input.target, warnings: [], result: result.data }
        }

        case 'delete-collection': {
          const { collection } = parseResourcePath(resourcePath)
          if (!collection) {
            return missingPathError(operation, input.target, 'delete-collection', 'collection path (e.g. products)')
          }
          const result = await deleteCollection(host, port, projectId, collection)
          if ('error' in result) return { ok: false, operation, target: input.target, warnings: [], error: result.error }
          return { ok: true, operation, target: input.target, warnings: [], result: result.data }
        }

        case 'clear': {
          const result = await clearDatabase(host, port, projectId)
          if ('error' in result) return { ok: false, operation, target: input.target, warnings: [], error: result.error }
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

function missingPathError(
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
      message: `"${action}" requires a resource path.`,
      hint: `Provide --path with ${expected}.`,
    },
  }
}

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

function toSeedDocs(data: unknown): SeedDoc[] | null {
  if (!Array.isArray(data) || data.length === 0) return null
  return data as SeedDoc[]
}

function buildDryRunResult(
  operation: string,
  target: TCommandTarget,
  action: FirestoreAction,
  resourcePath: string,
  data: unknown,
): TFiretoolResult {
  const intent = describeDryRunIntent(action, resourcePath, data)
  return {
    ok: true,
    operation,
    target,
    warnings: ['dry-run: no changes were made to the Firestore Emulator.'],
    result: { dryRun: true, intent },
  }
}

function describeDryRunIntent(action: FirestoreAction, resourcePath: string, data: unknown): string {
  const path = resourcePath || '(unspecified)'
  switch (action) {
    case 'seed':
    case 'import': {
      const count = Array.isArray(data) ? data.length : '?'
      return `Would write ${count} document(s) to collection "${path}".`
    }
    case 'delete':
      return `Would delete document at path "${path}".`
    case 'delete-collection':
      return `Would delete all documents in collection "${path}".`
    case 'clear':
      return 'Would clear all documents from the Firestore Emulator database.'
    default:
      return `Would execute "${action}" on "${path}".`
  }
}
