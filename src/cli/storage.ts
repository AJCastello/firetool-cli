import type { Command } from 'commander'
import { createCaller } from '../server/caller.ts'
import { formatResult } from './output.ts'

/** Register all `firetool storage *` subcommands onto the given parent command. */
export function registerStorageCommands(parent: Command): void {
  const storage = parent
    .command('storage')
    .description('Manage objects in the local Firebase Storage Emulator')

  // firetool storage list [--bucket <name>] [--prefix <prefix>]
  storage
    .command('list')
    .description('List objects in a bucket (default: {projectId}.appspot.com)')
    .option('--bucket <name>', 'Bucket name (defaults to {projectId}.appspot.com)')
    .option('--prefix <prefix>', 'Filter objects by path prefix')
    .option('--json', 'Output as structured JSON')
    .action(async (opts: { bucket?: string; prefix?: string; json?: boolean }) => {
      const useJson = resolveJson(parent, opts)
      const caller = createCaller(process.cwd())
      const result = await caller.storage.execute({
        action: 'list',
        target: {
          service: 'storage',
          identifier: opts.bucket,
          resourcePath: opts.prefix,
        },
      })
      emit(result, useJson)
    })

  // firetool storage upload <object-path> --file <local-path>
  storage
    .command('upload <object-path>')
    .description('Upload a local file to the Storage Emulator')
    .requiredOption('--file <path>', 'Local file path to upload')
    .option('--bucket <name>', 'Bucket name (defaults to {projectId}.appspot.com)')
    .option('--json', 'Output as structured JSON')
    .action(
      async (
        objectPath: string,
        opts: { file: string; bucket?: string; json?: boolean },
      ) => {
        const useJson = resolveJson(parent, opts)
        const caller = createCaller(process.cwd())
        const result = await caller.storage.execute({
          action: 'upload',
          target: {
            service: 'storage',
            identifier: opts.bucket,
            resourcePath: objectPath,
          },
          filePath: opts.file,
        })
        emit(result, useJson)
      },
    )

  // firetool storage download <object-path> --file <local-path>
  storage
    .command('download <object-path>')
    .description('Download an object from the Storage Emulator to a local file')
    .requiredOption('--file <path>', 'Local destination file path')
    .option('--bucket <name>', 'Bucket name (defaults to {projectId}.appspot.com)')
    .option('--json', 'Output as structured JSON')
    .action(
      async (
        objectPath: string,
        opts: { file: string; bucket?: string; json?: boolean },
      ) => {
        const useJson = resolveJson(parent, opts)
        const caller = createCaller(process.cwd())
        const result = await caller.storage.execute({
          action: 'download',
          target: {
            service: 'storage',
            identifier: opts.bucket,
            resourcePath: objectPath,
          },
          filePath: opts.file,
        })
        emit(result, useJson)
      },
    )

  // firetool storage remove <object-path>
  storage
    .command('remove <object-path>')
    .description('Remove an object from the Storage Emulator — requires --force')
    .option('--bucket <name>', 'Bucket name (defaults to {projectId}.appspot.com)')
    .option('--force', 'Skip confirmation and remove immediately')
    .option('--dry-run', 'Describe what would be removed without making changes')
    .option('--json', 'Output as structured JSON')
    .action(
      async (
        objectPath: string,
        opts: { bucket?: string; force?: boolean; dryRun?: boolean; json?: boolean },
      ) => {
        const useJson = resolveJson(parent, opts)
        const caller = createCaller(process.cwd())
        const result = await caller.storage.execute({
          action: 'remove',
          target: {
            service: 'storage',
            identifier: opts.bucket,
            resourcePath: objectPath,
          },
          force: opts.force ?? false,
          dryRun: opts.dryRun ?? false,
        })
        emit(result, useJson)
      },
    )

  // firetool storage clear
  storage
    .command('clear')
    .description('Clear ALL objects from a bucket in the Storage Emulator — requires --force')
    .option('--bucket <name>', 'Bucket name (defaults to {projectId}.appspot.com)')
    .option('--force', 'Skip confirmation and clear all objects immediately')
    .option('--dry-run', 'Describe what would be cleared without making changes')
    .option('--json', 'Output as structured JSON')
    .action(async (opts: { bucket?: string; force?: boolean; dryRun?: boolean; json?: boolean }) => {
      const useJson = resolveJson(parent, opts)
      const caller = createCaller(process.cwd())
      const result = await caller.storage.execute({
        action: 'clear',
        target: {
          service: 'storage',
          identifier: opts.bucket,
        },
        force: opts.force ?? false,
        dryRun: opts.dryRun ?? false,
      })
      emit(result, useJson)
    })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveJson(program: Command, opts: { json?: boolean }): boolean {
  return opts.json ?? (program.opts() as { json?: boolean }).json ?? false
}

function emit(result: Parameters<typeof formatResult>[0], useJson: boolean): void {
  const { output, exitCode } = formatResult(result, useJson)
  process.stdout.write(output + '\n')
  process.exit(exitCode)
}
