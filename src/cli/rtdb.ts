import { readFileSync } from 'node:fs'
import type { Command } from 'commander'
import { createCaller } from '../server/caller.ts'
import { formatResult } from './output.ts'

/** Register all `firetool rtdb *` subcommands onto the given parent command. */
export function registerRtdbCommands(parent: Command): void {
  const rtdb = parent
    .command('rtdb')
    .description('Manage data in the local Firebase Realtime Database Emulator')

  // firetool rtdb get <path>
  rtdb
    .command('get <path>')
    .description('Get data at a path (e.g. /users/alice)')
    .option('--json', 'Output as structured JSON')
    .action(async (path: string, opts: { json?: boolean }) => {
      const useJson = resolveJson(parent, opts)
      const caller = createCaller(process.cwd())
      const result = await caller.rtdb.execute({
        action: 'get',
        target: { service: 'rtdb', resourcePath: path },
      })
      emit(result, useJson)
    })

  // firetool rtdb set <path>
  rtdb
    .command('set <path>')
    .description('Set (overwrite) data at a path (e.g. /users/alice)')
    .option('--data <json>', 'Data as a JSON string')
    .option('--file <path>', 'Path to a JSON file containing the data')
    .option('--json', 'Output as structured JSON')
    .action(async (path: string, opts: { data?: string; file?: string; json?: boolean }) => {
      const useJson = resolveJson(parent, opts)
      const data = resolveData(opts.data, opts.file)
      const caller = createCaller(process.cwd())
      const result = await caller.rtdb.execute({
        action: 'set',
        target: { service: 'rtdb', resourcePath: path },
        data,
      })
      emit(result, useJson)
    })

  // firetool rtdb update <path>
  rtdb
    .command('update <path>')
    .description('Merge top-level keys at a path (e.g. /users/alice)')
    .option('--data <json>', 'Fields to update as a JSON object string')
    .option('--file <path>', 'Path to a JSON file containing fields to update')
    .option('--json', 'Output as structured JSON')
    .action(async (path: string, opts: { data?: string; file?: string; json?: boolean }) => {
      const useJson = resolveJson(parent, opts)
      const data = resolveData(opts.data, opts.file)
      const caller = createCaller(process.cwd())
      const result = await caller.rtdb.execute({
        action: 'update',
        target: { service: 'rtdb', resourcePath: path },
        data,
      })
      emit(result, useJson)
    })

  // firetool rtdb push <path>
  rtdb
    .command('push <path>')
    .description('Push a new child with an auto-generated key at a path (e.g. /messages)')
    .option('--data <json>', 'Data as a JSON string')
    .option('--file <path>', 'Path to a JSON file containing the data')
    .option('--json', 'Output as structured JSON')
    .action(async (path: string, opts: { data?: string; file?: string; json?: boolean }) => {
      const useJson = resolveJson(parent, opts)
      const data = resolveData(opts.data, opts.file)
      const caller = createCaller(process.cwd())
      const result = await caller.rtdb.execute({
        action: 'push',
        target: { service: 'rtdb', resourcePath: path },
        data,
      })
      emit(result, useJson)
    })

  // firetool rtdb query <path>
  rtdb
    .command('query <path>')
    .description('Query data at a path with ordering and filtering')
    .option(
      '--filter <json>',
      'Query filter as a JSON object: { orderBy?, equalTo?, startAt?, endAt?, limitToFirst?, limitToLast? }',
    )
    .option('--json', 'Output as structured JSON')
    .action(async (path: string, opts: { filter?: string; json?: boolean }) => {
      const useJson = resolveJson(parent, opts)
      let filter: unknown = {}
      if (opts.filter) {
        try {
          filter = JSON.parse(opts.filter)
        } catch {
          process.stderr.write('Error: --filter must be a valid JSON object.\n')
          process.exit(1)
        }
      }
      const caller = createCaller(process.cwd())
      const result = await caller.rtdb.execute({
        action: 'query',
        target: { service: 'rtdb', resourcePath: path },
        data: filter,
      })
      emit(result, useJson)
    })

  // firetool rtdb seed <path>
  rtdb
    .command('seed <path>')
    .description('Seed data at a path from a JSON value — creates, updates, or overwrites')
    .option('--data <json>', 'Data as a JSON string')
    .option('--file <path>', 'Path to a JSON file containing the data')
    .option('--dry-run', 'Describe what would happen without making changes')
    .option('--force', 'Skip confirmation for overwriting existing data')
    .option('--json', 'Output as structured JSON')
    .action(
      async (
        path: string,
        opts: { data?: string; file?: string; dryRun?: boolean; force?: boolean; json?: boolean },
      ) => {
        const useJson = resolveJson(parent, opts)
        const data = resolveData(opts.data, opts.file)
        const caller = createCaller(process.cwd())
        const result = await caller.rtdb.execute({
          action: 'seed',
          target: { service: 'rtdb', resourcePath: path },
          data,
          dryRun: opts.dryRun ?? false,
          force: opts.force ?? false,
        })
        emit(result, useJson)
      },
    )

  // firetool rtdb import <path>
  rtdb
    .command('import <path>')
    .description('Import JSON data into a path — creates, updates, or overwrites')
    .option('--data <json>', 'Data as a JSON string')
    .option('--file <path>', 'Path to a JSON file containing the data')
    .option('--dry-run', 'Describe what would happen without making changes')
    .option('--force', 'Skip confirmation for overwriting existing data')
    .option('--json', 'Output as structured JSON')
    .action(
      async (
        path: string,
        opts: { data?: string; file?: string; dryRun?: boolean; force?: boolean; json?: boolean },
      ) => {
        const useJson = resolveJson(parent, opts)
        const data = resolveData(opts.data, opts.file)
        const caller = createCaller(process.cwd())
        const result = await caller.rtdb.execute({
          action: 'import',
          target: { service: 'rtdb', resourcePath: path },
          data,
          dryRun: opts.dryRun ?? false,
          force: opts.force ?? false,
        })
        emit(result, useJson)
      },
    )

  // firetool rtdb export <path>
  rtdb
    .command('export <path>')
    .description('Export all data at a path as JSON')
    .option('--json', 'Output as structured JSON')
    .action(async (path: string, opts: { json?: boolean }) => {
      const useJson = resolveJson(parent, opts)
      const caller = createCaller(process.cwd())
      const result = await caller.rtdb.execute({
        action: 'export',
        target: { service: 'rtdb', resourcePath: path },
      })
      emit(result, useJson)
    })

  // firetool rtdb delete <path>
  rtdb
    .command('delete <path>')
    .description('Delete data at a path — requires --force')
    .option('--force', 'Skip confirmation and delete immediately')
    .option('--dry-run', 'Describe what would be deleted without making changes')
    .option('--json', 'Output as structured JSON')
    .action(
      async (path: string, opts: { force?: boolean; dryRun?: boolean; json?: boolean }) => {
        const useJson = resolveJson(parent, opts)
        const caller = createCaller(process.cwd())
        const result = await caller.rtdb.execute({
          action: 'delete',
          target: { service: 'rtdb', resourcePath: path },
          force: opts.force ?? false,
          dryRun: opts.dryRun ?? false,
        })
        emit(result, useJson)
      },
    )

  // firetool rtdb clear
  rtdb
    .command('clear')
    .description('Clear ALL data from the Realtime Database Emulator — requires --force')
    .option('--force', 'Skip confirmation and clear all data immediately')
    .option('--dry-run', 'Describe what would be cleared without making changes')
    .option('--json', 'Output as structured JSON')
    .action(async (opts: { force?: boolean; dryRun?: boolean; json?: boolean }) => {
      const useJson = resolveJson(parent, opts)
      const caller = createCaller(process.cwd())
      const result = await caller.rtdb.execute({
        action: 'clear',
        target: { service: 'rtdb' },
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

function resolveData(dataArg: string | undefined, fileArg: string | undefined): unknown {
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
