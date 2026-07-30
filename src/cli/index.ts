import { createRequire } from 'node:module'
import { Command } from 'commander'
import { createCaller } from '../server/caller.ts'
import { formatResult } from './output.ts'
import { registerAuthCommands } from './auth.ts'
import { registerFirestoreCommands } from './firestore.ts'
import { registerRtdbCommands } from './rtdb.ts'
import { registerStorageCommands } from './storage.ts'
import { registerFunctionsCommands } from './functions.ts'
import { registerPubSubCommands } from './pubsub.ts'
import { registerRulesCommands } from './rules.ts'

/**
 * Read the version from package.json rather than hardcoding it.
 *
 * Both the source entrypoint (`src/cli/`) and the bundled one (`dist/cli/`) sit two
 * levels below package.json, so the same relative path resolves in either context.
 */
const require = createRequire(import.meta.url)
const { version } = require('../../package.json') as { version: string }

const program = new Command()

program
  .name('firetool')
  .description('Agent-first Firebase Emulator CLI — local-only, no Firebase real fallback')
  .version(version)
  .option('--json', 'Output as structured JSON')

program
  .command('doctor')
  .description('Diagnose local Firebase emulator context and status')
  .option('--json', 'Output as structured JSON')
  .action(async (opts: { json?: boolean }) => {
    const useJson = opts.json ?? (program.opts() as { json?: boolean }).json ?? false
    const caller = createCaller(process.cwd())
    const result = await caller.diagnostics.getContext({ cwd: process.cwd() })
    const { output, exitCode } = formatResult(result, useJson)
    process.stdout.write(output + '\n')
    process.exit(exitCode)
  })

program
  .command('help-info [service]')
  .description('Show agent-first usage guide and command catalog')
  .option('--json', 'Output as structured JSON')
  .action(async (service: string | undefined, opts: { json?: boolean }) => {
    const useJson = opts.json ?? (program.opts() as { json?: boolean }).json ?? false
    const caller = createCaller(process.cwd())

    const serviceNames = ['auth', 'firestore', 'rtdb', 'storage', 'functions', 'pubsub', 'rules'] as const
    type SN = typeof serviceNames[number]

    const validService = service && (serviceNames as readonly string[]).includes(service)
      ? (service as SN)
      : undefined

    const result = await caller.help.describe({ service: validService })
    const { output, exitCode } = formatResult(result, useJson)
    process.stdout.write(output + '\n')
    process.exit(exitCode)
  })

registerAuthCommands(program)
registerFirestoreCommands(program)
registerRtdbCommands(program)
registerStorageCommands(program)
registerFunctionsCommands(program)
registerPubSubCommands(program)
registerRulesCommands(program)

program.parse(process.argv)
