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

const program = new Command()

program
  .name('firetool')
  .description('Agent-first Firebase Emulator CLI — local-only, no Firebase real fallback')
  .version('0.1.0')
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
