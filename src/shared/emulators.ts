import type { TServiceName } from './types.ts'

/**
 * @file emulators.ts
 * Single source of truth for how Firetool service names map onto the Firebase
 * Emulator Suite.
 *
 * Firetool exposes `rtdb` and `rules` as service names, but neither is a name the
 * Firebase CLI understands. The Realtime Database emulator is called `database`,
 * and rules are enforced inside the `firestore` and `storage` emulators rather
 * than by an emulator of their own. Emitting the Firetool name inside a suggested
 * `firebase emulators:start --only …` produces a command that does not start
 * anything, so the mapping has to be applied wherever a command is suggested.
 *
 * The same names are used as keys in the `emulators` section of firebase.json,
 * so discovery and command suggestion read from this one map.
 */

/**
 * Emulator names accepted by `firebase emulators:start --only`, and used as keys
 * in the `emulators` section of firebase.json.
 *
 * Verified against firebase-tools 15.8.0:
 *   apphosting, auth, functions, firestore, database, hosting, pubsub, storage,
 *   eventarc, dataconnect, tasks
 */
export const FIREBASE_EMULATOR_NAMES = [
  'apphosting',
  'auth',
  'functions',
  'firestore',
  'database',
  'hosting',
  'pubsub',
  'storage',
  'eventarc',
  'dataconnect',
  'tasks',
] as const

export type FirebaseEmulatorName = (typeof FIREBASE_EMULATOR_NAMES)[number]

/**
 * Firetool service name → the Firebase emulator that actually serves it.
 *
 * `rtdb` → `database` because that is what both firebase.json and the CLI call it.
 * `rules` → `firestore` because rule evaluation happens inside a data emulator;
 * there is no standalone rules emulator to start.
 */
export const FIREBASE_EMULATOR_NAME: Record<TServiceName, FirebaseEmulatorName> = {
  auth: 'auth',
  firestore: 'firestore',
  rtdb: 'database',
  storage: 'storage',
  functions: 'functions',
  pubsub: 'pubsub',
  rules: 'firestore',
}

/**
 * Resolve the Firebase emulator that serves a Firetool service name.
 *
 * Falls back to the given name when it is outside the known service set, so a
 * suggestion degrades to a plausible command instead of throwing on a caller
 * that passes a raw string.
 */
export function emulatorNameFor(service: string): string {
  return FIREBASE_EMULATOR_NAME[service as TServiceName] ?? service
}

/**
 * Format a `firebase emulators:start` command from Firebase emulator names.
 *
 * Names are deduplicated and ordered so the same set always produces the same
 * command. Returns the bare `firebase emulators:start` when no name is given,
 * since that starts everything declared in firebase.json.
 */
export function startCommandForEmulatorNames(names: readonly string[]): string {
  const unique = [...new Set(names)].sort()
  if (unique.length === 0) return 'firebase emulators:start'
  return `firebase emulators:start --only ${unique.join(',')}`
}

/**
 * Build a runnable `firebase emulators:start` command for the given Firetool
 * services, translating each name to the emulator that actually serves it.
 */
export function buildEmulatorStartCommand(services: readonly TServiceName[]): string {
  return startCommandForEmulatorNames(services.map(emulatorNameFor))
}
