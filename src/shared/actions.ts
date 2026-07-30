import type { TServiceName } from './types.ts'

/**
 * Single source of truth for the action names each service accepts.
 *
 * Every action listed here is registered both as a CLI subcommand
 * (`firetool <service> <action>`) and as a router action, so the help catalog can
 * advertise these names to agents without drifting from what the CLI implements.
 */

export const AUTH_ACTIONS = [
  'create-user',
  'list-users',
  'get-user',
  'update-user',
  'delete-user',
  'clear-users',
] as const

export const FIRESTORE_ACTIONS = [
  'get',
  'set',
  'update',
  'query',
  'list',
  'seed',
  'import',
  'export',
  'delete',
  'delete-collection',
  'clear',
] as const

export const RTDB_ACTIONS = [
  'get',
  'set',
  'update',
  'push',
  'query',
  'seed',
  'import',
  'export',
  'delete',
  'clear',
] as const

export const STORAGE_ACTIONS = ['list', 'upload', 'download', 'remove', 'clear'] as const

export const FUNCTIONS_ACTIONS = ['call'] as const

export const PUBSUB_ACTIONS = ['publish'] as const

export const RULES_ACTIONS = ['check'] as const

export const SERVICE_ACTIONS: Record<TServiceName, readonly string[]> = {
  auth: AUTH_ACTIONS,
  firestore: FIRESTORE_ACTIONS,
  rtdb: RTDB_ACTIONS,
  storage: STORAGE_ACTIONS,
  functions: FUNCTIONS_ACTIONS,
  pubsub: PUBSUB_ACTIONS,
  rules: RULES_ACTIONS,
}
