import type { Command } from 'commander'
import { createCaller } from '../server/caller.ts'
import { formatResult } from './output.ts'

/** Register all `firetool pubsub *` subcommands onto the given parent command. */
export function registerPubSubCommands(parent: Command): void {
  const pubsub = parent
    .command('pubsub')
    .description('Publish messages to Pub/Sub topics on the local emulator')

  // firetool pubsub publish <topic> --data <json> [--attribute <key=value>...] [--json]
  pubsub
    .command('publish <topic>')
    .description('Publish a message to a local Pub/Sub topic')
    .requiredOption('--data <json>', 'JSON message payload')
    .option(
      '--attribute <key=value>',
      'Message attribute (repeat to add multiple)',
      collectAttributes,
      {} as Record<string, string>,
    )
    .option('--json', 'Output as structured JSON')
    .action(
      async (
        topic: string,
        opts: { data: string; attribute: Record<string, string>; json?: boolean },
      ) => {
        const useJson = resolveJson(parent, opts)
        const caller = createCaller(process.cwd())

        let data: unknown
        try {
          data = JSON.parse(opts.data)
        } catch {
          process.stderr.write(`Error: --data must be valid JSON. Got: ${opts.data}\n`)
          process.exit(1)
        }

        const attributes =
          Object.keys(opts.attribute).length > 0 ? opts.attribute : undefined

        const result = await caller.pubsub.publish({ topic, data, attributes })
        emit(result, useJson)
      },
    )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Accumulate --attribute key=value pairs into a record. */
function collectAttributes(
  value: string,
  previous: Record<string, string>,
): Record<string, string> {
  const idx = value.indexOf('=')
  if (idx === -1) {
    process.stderr.write(`Error: --attribute must be in key=value format. Got: "${value}"\n`)
    process.exit(1)
  }
  return { ...previous, [value.slice(0, idx)]: value.slice(idx + 1) }
}

function resolveJson(program: Command, opts: { json?: boolean }): boolean {
  return opts.json ?? (program.opts() as { json?: boolean }).json ?? false
}

function emit(result: Parameters<typeof formatResult>[0], useJson: boolean): void {
  const { output, exitCode } = formatResult(result, useJson)
  process.stdout.write(output + '\n')
  process.exit(exitCode)
}
