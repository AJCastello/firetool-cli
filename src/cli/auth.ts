import type { Command } from 'commander'
import { createCaller } from '../server/caller.ts'
import { formatResult } from './output.ts'

/** Register all `firetool auth *` subcommands onto the given parent command. */
export function registerAuthCommands(parent: Command): void {
  const auth = parent
    .command('auth')
    .description('Manage users in the local Firebase Auth Emulator')

  // firetool auth list-users
  auth
    .command('list-users')
    .description('List all users in the Auth Emulator')
    .option('--json', 'Output as structured JSON')
    .action(async (opts: { json?: boolean }) => {
      const useJson = resolveJson(parent, opts)
      const caller = createCaller(process.cwd())
      const result = await caller.auth.execute({
        action: 'list-users',
        target: { service: 'auth' },
      })
      emit(result, useJson)
    })

  // firetool auth create-user
  auth
    .command('create-user')
    .description('Create a user in the Auth Emulator')
    .option('--email <email>', 'User email address')
    .option('--password <password>', 'User password (min 6 characters)')
    .option('--display-name <name>', 'Display name')
    .option('--phone-number <phone>', 'E.164 phone number (e.g. +15555555555)')
    .option('--disabled', 'Create the user in a disabled state')
    .option('--email-verified', 'Mark email as verified')
    .option('--json', 'Output as structured JSON')
    .action(async (opts: {
      email?: string
      password?: string
      displayName?: string
      phoneNumber?: string
      disabled?: boolean
      emailVerified?: boolean
      json?: boolean
    }) => {
      const useJson = resolveJson(parent, opts)
      const caller = createCaller(process.cwd())
      const result = await caller.auth.execute({
        action: 'create-user',
        target: { service: 'auth' },
        data: {
          email: opts.email,
          password: opts.password,
          displayName: opts.displayName,
          phoneNumber: opts.phoneNumber,
          disabled: opts.disabled ?? false,
          emailVerified: opts.emailVerified ?? false,
        },
      })
      emit(result, useJson)
    })

  // firetool auth get-user <uid|email>
  auth
    .command('get-user <uid-or-email>')
    .description('Get a user by UID or email from the Auth Emulator')
    .option('--json', 'Output as structured JSON')
    .action(async (uidOrEmail: string, opts: { json?: boolean }) => {
      const useJson = resolveJson(parent, opts)
      const caller = createCaller(process.cwd())
      const result = await caller.auth.execute({
        action: 'get-user',
        target: { service: 'auth', identifier: uidOrEmail },
      })
      emit(result, useJson)
    })

  // firetool auth update-user <uid>
  auth
    .command('update-user <uid>')
    .description('Update a user in the Auth Emulator')
    .option('--email <email>', 'New email address')
    .option('--password <password>', 'New password (min 6 characters)')
    .option('--display-name <name>', 'New display name')
    .option('--phone-number <phone>', 'New E.164 phone number')
    .option('--disabled', 'Disable the user')
    .option('--enabled', 'Enable the user (sets disabled to false)')
    .option('--email-verified', 'Mark email as verified')
    .option('--json', 'Output as structured JSON')
    .action(async (uid: string, opts: {
      email?: string
      password?: string
      displayName?: string
      phoneNumber?: string
      disabled?: boolean
      enabled?: boolean
      emailVerified?: boolean
      json?: boolean
    }) => {
      const useJson = resolveJson(parent, opts)
      const caller = createCaller(process.cwd())

      const data: Record<string, unknown> = {}
      if (opts.email !== undefined) data.email = opts.email
      if (opts.password !== undefined) data.password = opts.password
      if (opts.displayName !== undefined) data.displayName = opts.displayName
      if (opts.phoneNumber !== undefined) data.phoneNumber = opts.phoneNumber
      if (opts.disabled) data.disabled = true
      if (opts.enabled) data.disabled = false
      if (opts.emailVerified) data.emailVerified = true

      const result = await caller.auth.execute({
        action: 'update-user',
        target: { service: 'auth', identifier: uid },
        data,
      })
      emit(result, useJson)
    })

  // firetool auth delete-user <uid>
  auth
    .command('delete-user <uid>')
    .description('Delete a user from the Auth Emulator (requires --force)')
    .option('--force', 'Skip confirmation and delete immediately')
    .option('--json', 'Output as structured JSON')
    .action(async (uid: string, opts: { force?: boolean; json?: boolean }) => {
      const useJson = resolveJson(parent, opts)
      const caller = createCaller(process.cwd())
      const result = await caller.auth.execute({
        action: 'delete-user',
        target: { service: 'auth', identifier: uid },
        force: opts.force ?? false,
      })
      emit(result, useJson)
    })

  // firetool auth clear-users
  auth
    .command('clear-users')
    .description('Delete all users from the Auth Emulator (requires --force)')
    .option('--force', 'Skip confirmation and delete all users immediately')
    .option('--json', 'Output as structured JSON')
    .action(async (opts: { force?: boolean; json?: boolean }) => {
      const useJson = resolveJson(parent, opts)
      const caller = createCaller(process.cwd())
      const result = await caller.auth.execute({
        action: 'clear-users',
        target: { service: 'auth' },
        force: opts.force ?? false,
      })
      emit(result, useJson)
    })
}

function resolveJson(program: Command, opts: { json?: boolean }): boolean {
  return opts.json ?? (program.opts() as { json?: boolean }).json ?? false
}

function emit(result: Parameters<typeof formatResult>[0], useJson: boolean): void {
  const { output, exitCode } = formatResult(result, useJson)
  process.stdout.write(output + '\n')
  process.exit(exitCode)
}
