import type { Command } from 'commander'
import { createCaller } from '../server/caller.ts'
import { formatResult } from './output.ts'

/** Register all `firetool functions *` subcommands onto the given parent command. */
export function registerFunctionsCommands(parent: Command): void {
  const functions = parent
    .command('functions')
    .description('Call Firebase Functions on the local emulator')

  // firetool functions call <name-or-url> [--data <json>] [--json]
  functions
    .command('call <name-or-url>')
    .description(
      'Call a local Firebase Function by name or URL. ' +
        'When a name is given, the URL is built as http://{host}:{port}/{projectId}/us-central1/{name}.',
    )
    .option('--data <json>', 'JSON payload to send as the function data argument')
    .option('--json', 'Output as structured JSON')
    .action(
      async (nameOrUrl: string, opts: { data?: string; json?: boolean }) => {
        const useJson = resolveJson(parent, opts)
        const caller = createCaller(process.cwd())

        let data: unknown
        if (opts.data !== undefined) {
          try {
            data = JSON.parse(opts.data)
          } catch {
            process.stderr.write(`Error: --data must be valid JSON. Got: ${opts.data}\n`)
            process.exit(1)
          }
        }

        const result = await caller.functions.invoke({ nameOrUrl, data })
        emit(result, useJson)
      },
    )
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
