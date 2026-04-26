import { readFileSync } from 'node:fs'
import type { Command } from 'commander'
import { createCaller } from '../server/caller.ts'
import { formatResult } from './output.ts'

/** Register all `firetool firestore *` subcommands onto the given parent command. */
export function registerFirestoreCommands(parent: Command): void {
  const fs = parent
    .command('firestore')
    .description('Manage documents in the local Firebase Firestore Emulator')

  // firetool firestore get <path>
  fs.command('get <path>')
    .description('Get a document by path (e.g. products/abc123)')
    .option('--json', 'Output as structured JSON')
    .action(async (path: string, opts: { json?: boolean }) => {
      const useJson = resolveJson(parent, opts)
      const caller = createCaller(process.cwd())
      const result = await caller.firestore.execute({
        action: 'get',
        target: { service: 'firestore', resourcePath: path },
      })
      emit(result, useJson)
    })

  // firetool firestore list <collection>
  fs.command('list <collection>')
    .description('List all documents in a collection (e.g. products)')
    .option('--json', 'Output as structured JSON')
    .action(async (collection: string, opts: { json?: boolean }) => {
      const useJson = resolveJson(parent, opts)
      const caller = createCaller(process.cwd())
      const result = await caller.firestore.execute({
        action: 'list',
        target: { service: 'firestore', resourcePath: collection },
      })
      emit(result, useJson)
    })

  // firetool firestore set <path>
  fs.command('set <path>')
    .description('Create or overwrite a document at path (e.g. products/abc123)')
    .option('--data <json>', 'Document data as a JSON object string')
    .option('--file <path>', 'Path to a JSON file containing document data')
    .option('--json', 'Output as structured JSON')
    .action(async (path: string, opts: { data?: string; file?: string; json?: boolean }) => {
      const useJson = resolveJson(parent, opts)
      const data = resolveData(opts.data, opts.file, useJson)
      const caller = createCaller(process.cwd())
      const result = await caller.firestore.execute({
        action: 'set',
        target: { service: 'firestore', resourcePath: path },
        data,
      })
      emit(result, useJson)
    })

  // firetool firestore update <path>
  fs.command('update <path>')
    .description('Update specific fields of a document at path (e.g. products/abc123)')
    .option('--data <json>', 'Fields to update as a JSON object string')
    .option('--file <path>', 'Path to a JSON file containing fields to update')
    .option('--json', 'Output as structured JSON')
    .action(async (path: string, opts: { data?: string; file?: string; json?: boolean }) => {
      const useJson = resolveJson(parent, opts)
      const data = resolveData(opts.data, opts.file, useJson)
      const caller = createCaller(process.cwd())
      const result = await caller.firestore.execute({
        action: 'update',
        target: { service: 'firestore', resourcePath: path },
        data,
      })
      emit(result, useJson)
    })

  // firetool firestore query <collection>
  fs.command('query <collection>')
    .description('Query documents in a collection')
    .option(
      '--filters <json>',
      'Filters as a JSON array of { field, op, value } objects. Valid ops: EQUAL, LESS_THAN, LESS_THAN_OR_EQUAL, GREATER_THAN, GREATER_THAN_OR_EQUAL, ARRAY_CONTAINS',
    )
    .option('--json', 'Output as structured JSON')
    .action(async (collection: string, opts: { filters?: string; json?: boolean }) => {
      const useJson = resolveJson(parent, opts)
      let filters: unknown = []
      if (opts.filters) {
        try {
          filters = JSON.parse(opts.filters)
        } catch {
          process.stderr.write('Error: --filters must be a valid JSON array.\n')
          process.exit(1)
        }
      }
      const caller = createCaller(process.cwd())
      const result = await caller.firestore.execute({
        action: 'query',
        target: { service: 'firestore', resourcePath: collection },
        data: filters,
      })
      emit(result, useJson)
    })

  // firetool firestore seed <collection>
  fs.command('seed <collection>')
    .description('Seed a collection with documents from a JSON array')
    .option('--data <json>', 'Documents as a JSON array string')
    .option('--file <path>', 'Path to a JSON file containing an array of documents')
    .option(
      '--dry-run',
      'Describe what would happen without making changes',
    )
    .option('--force', 'Skip confirmation for overwriting existing data')
    .option('--json', 'Output as structured JSON')
    .action(async (
      collection: string,
      opts: { data?: string; file?: string; dryRun?: boolean; force?: boolean; json?: boolean },
    ) => {
      const useJson = resolveJson(parent, opts)
      const data = resolveData(opts.data, opts.file, useJson)
      const caller = createCaller(process.cwd())
      const result = await caller.firestore.execute({
        action: 'seed',
        target: { service: 'firestore', resourcePath: collection },
        data,
        dryRun: opts.dryRun ?? false,
        force: opts.force ?? false,
      })
      emit(result, useJson)
    })

  // firetool firestore import <collection>
  fs.command('import <collection>')
    .description('Import documents into a collection from a JSON array')
    .option('--data <json>', 'Documents as a JSON array string')
    .option('--file <path>', 'Path to a JSON file containing an array of documents')
    .option('--dry-run', 'Describe what would happen without making changes')
    .option('--force', 'Skip confirmation for overwriting existing data')
    .option('--json', 'Output as structured JSON')
    .action(async (
      collection: string,
      opts: { data?: string; file?: string; dryRun?: boolean; force?: boolean; json?: boolean },
    ) => {
      const useJson = resolveJson(parent, opts)
      const data = resolveData(opts.data, opts.file, useJson)
      const caller = createCaller(process.cwd())
      const result = await caller.firestore.execute({
        action: 'import',
        target: { service: 'firestore', resourcePath: collection },
        data,
        dryRun: opts.dryRun ?? false,
        force: opts.force ?? false,
      })
      emit(result, useJson)
    })

  // firetool firestore export <collection>
  fs.command('export <collection>')
    .description('Export all documents from a collection as JSON')
    .option('--json', 'Output as structured JSON')
    .action(async (collection: string, opts: { json?: boolean }) => {
      const useJson = resolveJson(parent, opts)
      const caller = createCaller(process.cwd())
      const result = await caller.firestore.execute({
        action: 'export',
        target: { service: 'firestore', resourcePath: collection },
      })
      emit(result, useJson)
    })

  // firetool firestore delete <path>
  fs.command('delete <path>')
    .description('Delete a document at path (e.g. products/abc123) — requires --force')
    .option('--force', 'Skip confirmation and delete immediately')
    .option('--dry-run', 'Describe what would be deleted without making changes')
    .option('--json', 'Output as structured JSON')
    .action(async (path: string, opts: { force?: boolean; dryRun?: boolean; json?: boolean }) => {
      const useJson = resolveJson(parent, opts)
      const caller = createCaller(process.cwd())
      const result = await caller.firestore.execute({
        action: 'delete',
        target: { service: 'firestore', resourcePath: path },
        force: opts.force ?? false,
        dryRun: opts.dryRun ?? false,
      })
      emit(result, useJson)
    })

  // firetool firestore delete-collection <collection>
  fs.command('delete-collection <collection>')
    .description('Delete all documents in a collection — requires --force')
    .option('--force', 'Skip confirmation and delete immediately')
    .option('--dry-run', 'Describe what would be deleted without making changes')
    .option('--json', 'Output as structured JSON')
    .action(async (collection: string, opts: { force?: boolean; dryRun?: boolean; json?: boolean }) => {
      const useJson = resolveJson(parent, opts)
      const caller = createCaller(process.cwd())
      const result = await caller.firestore.execute({
        action: 'delete-collection',
        target: { service: 'firestore', resourcePath: collection },
        force: opts.force ?? false,
        dryRun: opts.dryRun ?? false,
      })
      emit(result, useJson)
    })

  // firetool firestore clear
  fs.command('clear')
    .description('Clear ALL documents from the Firestore Emulator database — requires --force')
    .option('--force', 'Skip confirmation and clear all data immediately')
    .option('--dry-run', 'Describe what would be cleared without making changes')
    .option('--json', 'Output as structured JSON')
    .action(async (opts: { force?: boolean; dryRun?: boolean; json?: boolean }) => {
      const useJson = resolveJson(parent, opts)
      const caller = createCaller(process.cwd())
      const result = await caller.firestore.execute({
        action: 'clear',
        target: { service: 'firestore' },
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

function resolveData(
  dataArg: string | undefined,
  fileArg: string | undefined,
  _useJson: boolean,
): unknown {
  if (fileArg) {
    try {
      const raw = readFileSync(fileArg, 'utf-8')
      return JSON.parse(raw)
    } catch (err) {
      process.stderr.write(
        `Error: Could not read or parse file "${fileArg}": ${err instanceof Error ? err.message : String(err)}\n`,
      )
      process.exit(1)
    }
  }
  if (dataArg) {
    try {
      return JSON.parse(dataArg)
    } catch {
      process.stderr.write('Error: --data must be a valid JSON string.\n')
      process.exit(1)
    }
  }
  return undefined
}

function emit(result: Parameters<typeof formatResult>[0], useJson: boolean): void {
  const { output, exitCode } = formatResult(result, useJson)
  process.stdout.write(output + '\n')
  process.exit(exitCode)
}
