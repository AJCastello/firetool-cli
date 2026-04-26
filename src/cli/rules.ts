import type { Command } from 'commander'
import { createCaller } from '../server/caller.ts'
import { formatResult } from './output.ts'

/** Register all `firetool rules *` subcommands onto the given parent command. */
export function registerRulesCommands(parent: Command): void {
  const rules = parent
    .command('rules')
    .description('Check Firebase security rules against the local emulator')

  // firetool rules check --service <firestore|storage> --path <path> --intent <intent>
  //   [--auth-uid <uid>] [--auth-email <email>] [--auth-token <token>]
  //   [--bucket <name>] [--json]
  rules
    .command('check')
    .description(
      'Probe Firestore or Storage rules for a given path and intent (read / write / delete / …). ' +
        'Returns whether the operation is allowed or denied.',
    )
    .requiredOption(
      '--service <firestore|storage>',
      'The Firebase service whose rules to check',
    )
    .requiredOption('--path <path>', 'Document path (Firestore) or object path (Storage)')
    .requiredOption(
      '--intent <intent>',
      'Operation intent: read, get, list, write, create, update, or delete',
    )
    .option('--auth-uid <uid>', 'Simulate a signed-in user with this UID')
    .option('--auth-email <email>', 'Email address for the simulated user (use with --auth-uid)')
    .option('--auth-token <token>', 'Raw Firebase auth token (Bearer) to use for the request')
    .option(
      '--bucket <name>',
      'Storage bucket name (defaults to {projectId}.appspot.com for Storage checks)',
    )
    .option('--json', 'Output as structured JSON')
    .action(
      async (opts: {
        service: string
        path: string
        intent: string
        authUid?: string
        authEmail?: string
        authToken?: string
        bucket?: string
        json?: boolean
      }) => {
        const useJson = resolveJson(parent, opts)

        if (opts.service !== 'firestore' && opts.service !== 'storage') {
          process.stderr.write(
            `Error: --service must be "firestore" or "storage". Got: "${opts.service}"\n`,
          )
          process.exit(1)
        }

        const auth = buildAuth(opts.authToken, opts.authUid, opts.authEmail)

        const caller = createCaller(process.cwd())
        const result = await caller.rules.check({
          service: opts.service as 'firestore' | 'storage',
          target: {
            service: opts.service as 'firestore' | 'storage',
            resourcePath: opts.path,
            identifier: opts.bucket,
          },
          intent: opts.intent,
          auth,
        })
        emit(result, useJson)
      },
    )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildAuth(
  token: string | undefined,
  uid: string | undefined,
  email: string | undefined,
): unknown {
  if (token) return { token }
  if (uid) return { uid, ...(email ? { email } : {}) }
  return undefined
}

function resolveJson(program: Command, opts: { json?: boolean }): boolean {
  return opts.json ?? (program.opts() as { json?: boolean }).json ?? false
}

function emit(result: Parameters<typeof formatResult>[0], useJson: boolean): void {
  const { output, exitCode } = formatResult(result, useJson)
  process.stdout.write(output + '\n')
  process.exit(exitCode)
}
