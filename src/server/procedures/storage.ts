import { readFileSync, writeFileSync } from 'node:fs'
import { router, publicProcedure } from '../trpc.ts'
import { ServiceExecuteInputSchema } from '../../shared/schemas.ts'
import type { TFiretoolResult, TCommandTarget } from '../../shared/types.ts'
import { discoverContext } from '../../discovery/index.ts'
import { guardSensitiveOperation, assertConfirmed } from '../../policy/index.ts'
import {
  listObjects,
  uploadObject,
  downloadObject,
  removeObject,
  clearBucket,
} from '../../adapters/storage/index.ts'

const KNOWN_ACTIONS = ['list', 'upload', 'download', 'remove', 'clear'] as const

type StorageAction = (typeof KNOWN_ACTIONS)[number]

const DESTRUCTIVE_ACTIONS = new Set<StorageAction>(['remove', 'clear'])

/** Resolve the default bucket name from the project ID (Firebase convention). */
function resolveDefaultBucket(projectId: string): string {
  return `${projectId}.appspot.com`
}

function resolveBucket(target: TCommandTarget, projectId: string | undefined): string | null {
  if (target.identifier) return target.identifier
  if (projectId) return resolveDefaultBucket(projectId)
  return null
}

export const storageRouter = router({
  execute: publicProcedure
    .input(ServiceExecuteInputSchema)
    .mutation(async ({ input, ctx }): Promise<TFiretoolResult> => {
      const operation = `storage.${input.action}`

      if (!(KNOWN_ACTIONS as readonly string[]).includes(input.action)) {
        return {
          ok: false,
          operation,
          target: input.target,
          warnings: [],
          error: {
            code: 'INVALID_INPUT',
            message: `Unknown storage action "${input.action}".`,
            hint: `Valid actions: ${KNOWN_ACTIONS.join(', ')}.`,
          },
        }
      }

      const action = input.action as StorageAction

      const { context, statuses } = await discoverContext(ctx.cwd)
      const guardErr = guardSensitiveOperation('storage', input.target, statuses, context.projectId, context.allProjectAliases)
      if (guardErr) {
        return { ok: false, operation, target: input.target, warnings: [], error: guardErr }
      }

      const storageStatus = statuses.find((s) => s.service === 'storage')!
      const host = storageStatus.host ?? 'localhost'
      const port = storageStatus.port ?? 9199

      const bucket = resolveBucket(input.target, context.projectId)
      if (!bucket) {
        return {
          ok: false,
          operation,
          target: input.target,
          warnings: [],
          error: {
            code: 'INVALID_INPUT',
            message: 'No Firebase project ID or explicit bucket found.',
            hint: 'Add a .firebaserc with a default project, pass --project, or specify --bucket explicitly.',
          },
        }
      }

      if (DESTRUCTIVE_ACTIONS.has(action)) {
        if (input.dryRun) {
          return buildDryRunResult(operation, input.target, action, bucket, input.target.resourcePath)
        }
        const confirmErr = assertConfirmed(action, input.target, input.force ?? false, false)
        if (confirmErr) {
          return { ok: false, operation, target: input.target, warnings: [], error: confirmErr }
        }
      }

      switch (action) {
        case 'list': {
          const prefix = input.target.resourcePath
          const result = await listObjects(host, port, bucket, prefix)
          if ('error' in result) {
            return { ok: false, operation, target: input.target, warnings: [], error: result.error }
          }
          return {
            ok: true,
            operation,
            target: input.target,
            warnings: result.data.count === 0 ? ['No objects found in this bucket/prefix.'] : [],
            result: result.data,
          }
        }

        case 'upload': {
          const objectPath = input.target.resourcePath
          if (!objectPath) {
            return missingPathError(operation, input.target, 'upload', 'the destination object path')
          }
          const filePath = input.filePath
          if (!filePath) {
            return {
              ok: false,
              operation,
              target: input.target,
              warnings: [],
              error: {
                code: 'INVALID_INPUT',
                message: '"upload" requires a local file path.',
                hint: 'Pass --file <local-path> to specify the file to upload.',
              },
            }
          }

          let content: Uint8Array
          let contentType = 'application/octet-stream'
          try {
            content = new Uint8Array(readFileSync(filePath))
            if (filePath.endsWith('.json')) contentType = 'application/json'
            else if (filePath.endsWith('.txt')) contentType = 'text/plain'
            else if (filePath.endsWith('.html')) contentType = 'text/html'
            else if (filePath.endsWith('.png')) contentType = 'image/png'
            else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) contentType = 'image/jpeg'
          } catch (err) {
            return {
              ok: false,
              operation,
              target: input.target,
              warnings: [],
              error: {
                code: 'INVALID_INPUT',
                message: `Could not read local file "${filePath}": ${err instanceof Error ? err.message : String(err)}`,
                hint: 'Verify the file exists and is readable.',
              },
            }
          }

          const result = await uploadObject(host, port, bucket, objectPath, content, contentType)
          if ('error' in result) {
            return { ok: false, operation, target: input.target, warnings: [], error: result.error }
          }
          return {
            ok: true,
            operation,
            target: input.target,
            warnings: [],
            result: { ...result.data, localFile: filePath },
          }
        }

        case 'download': {
          const objectPath = input.target.resourcePath
          if (!objectPath) {
            return missingPathError(operation, input.target, 'download', 'the source object path')
          }
          const filePath = input.filePath
          if (!filePath) {
            return {
              ok: false,
              operation,
              target: input.target,
              warnings: [],
              error: {
                code: 'INVALID_INPUT',
                message: '"download" requires a local destination file path.',
                hint: 'Pass --file <local-path> to specify where to save the downloaded file.',
              },
            }
          }

          const result = await downloadObject(host, port, bucket, objectPath)
          if ('error' in result) {
            return { ok: false, operation, target: input.target, warnings: [], error: result.error }
          }

          try {
            writeFileSync(filePath, result.data.content)
          } catch (err) {
            return {
              ok: false,
              operation,
              target: input.target,
              warnings: [],
              error: {
                code: 'INVALID_INPUT',
                message: `Could not write to local file "${filePath}": ${err instanceof Error ? err.message : String(err)}`,
                hint: 'Verify the destination path is writable.',
              },
            }
          }

          return {
            ok: true,
            operation,
            target: input.target,
            warnings: [],
            result: {
              bucket,
              name: result.data.name,
              size: result.data.size,
              localFile: filePath,
              downloaded: true,
            },
          }
        }

        case 'remove': {
          const objectPath = input.target.resourcePath
          if (!objectPath) {
            return missingPathError(operation, input.target, 'remove', 'the object path to remove')
          }
          const result = await removeObject(host, port, bucket, objectPath)
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
          const result = await clearBucket(host, port, bucket)
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
      message: `"${action}" requires an explicit object path.`,
      hint: `Pass ${expected} as the first argument.`,
    },
  }
}

function buildDryRunResult(
  operation: string,
  target: TCommandTarget,
  action: StorageAction,
  bucket: string,
  objectPath: string | undefined,
): TFiretoolResult {
  const intent = describeDryRunIntent(action, bucket, objectPath)
  return {
    ok: true,
    operation,
    target,
    warnings: ['dry-run: no changes were made to the Storage Emulator.'],
    result: { dryRun: true, intent },
  }
}

function describeDryRunIntent(
  action: StorageAction,
  bucket: string,
  objectPath: string | undefined,
): string {
  switch (action) {
    case 'remove':
      return `Would remove object "${objectPath}" from bucket "${bucket}".`
    case 'clear':
      return `Would clear all objects from bucket "${bucket}".`
    default:
      return `Would execute "${action}" on bucket "${bucket}".`
  }
}
