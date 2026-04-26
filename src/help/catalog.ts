import type { TServiceName } from '../shared/types.ts'
import { EXIT_CODES } from '../errors/catalog.ts'

export type ServiceInfo = {
  name: TServiceName
  description: string
  destructive: boolean
  actions: string[]
  examples: string[]
}

export const SERVICE_CATALOG: Record<TServiceName, ServiceInfo> = {
  auth: {
    name: 'auth',
    description: 'Manage Firebase Auth emulator users (create, list, get, update, delete, clear)',
    destructive: true,
    actions: ['create-user', 'get-user', 'list-users', 'update-user', 'delete-user', 'clear'],
    examples: [
      'firetool auth create-user --email user@example.test --password secret --json',
      'firetool auth list-users --json',
      'firetool auth get-user --uid abc123 --json',
      'firetool auth delete-user --uid abc123 --force --json',
      'firetool auth clear --force --json',
    ],
  },
  firestore: {
    name: 'firestore',
    description:
      'Manage Firestore emulator data (read, write, seed, import, export, delete, clear)',
    destructive: true,
    actions: ['get', 'set', 'update', 'query', 'seed', 'import', 'export', 'delete', 'clear'],
    examples: [
      'firetool firestore get users/123 --json',
      'firetool firestore seed products --file products.seed.json --json',
      'firetool firestore seed products --file products.seed.json --dry-run --json',
      'firetool firestore clear products --force --json',
    ],
  },
  rtdb: {
    name: 'rtdb',
    description:
      'Manage Realtime Database emulator data (get, set, update, query, remove, seed, import, export)',
    destructive: true,
    actions: ['get', 'set', 'update', 'query', 'remove', 'seed', 'import', 'export'],
    examples: [
      'firetool rtdb get /users --json',
      "firetool rtdb seed /products --data '[{\"name\":\"A\"}]' --dry-run --json",
      'firetool rtdb remove /tmp --force --json',
    ],
  },
  storage: {
    name: 'storage',
    description: 'Manage Storage emulator objects (list, upload, download, delete, clear)',
    destructive: true,
    actions: ['list', 'upload', 'download', 'delete', 'clear'],
    examples: [
      'firetool storage list --json',
      'firetool storage upload --file ./image.png --path images/test.png --json',
      'firetool storage clear --force --json',
    ],
  },
  functions: {
    name: 'functions',
    description: 'Call Firebase Functions emulator endpoints (call, list)',
    destructive: false,
    actions: ['call', 'list'],
    examples: [
      "firetool functions call createUserProfile --data '{\"uid\":\"abc\"}' --json",
      'firetool functions list --json',
    ],
  },
  pubsub: {
    name: 'pubsub',
    description: 'Publish messages to Pub/Sub emulator topics (publish, list-topics)',
    destructive: false,
    actions: ['publish', 'list-topics'],
    examples: [
      "firetool pubsub publish user-created --data '{\"uid\":\"abc\"}' --json",
      'firetool pubsub list-topics --json',
    ],
  },
  rules: {
    name: 'rules',
    description:
      'Check Firebase security rules locally for Firestore and Storage (check)',
    destructive: false,
    actions: ['check'],
    examples: [
      'firetool rules check firestore products/abc --read --uid user_123 --json',
      'firetool rules check storage files/test.png --write --json',
    ],
  },
}

export const AGENT_FLOW: string[] = [
  '1. Diagnose local context first: firetool doctor --json',
  '2. Validate which emulators are configured and running (check ok:true and statuses)',
  '3. Choose the explicit service command for your operation',
  '4. Use --json for structured output that agents can parse reliably',
  '5. Use --dry-run when the operation may alter many records or overwrite existing state',
  '6. Use --force only when the local target and impact are unambiguous',
  '7. Interpret errors by code and exit code — each error category has a distinct exit code',
]

type ErrorCodeEntry = {
  exitCode: number
  description: string
  hint: string
}

const ERROR_CODES_CATALOG: Record<string, ErrorCodeEntry> = {
  CONTEXT_NOT_FOUND: {
    exitCode: EXIT_CODES.CONTEXT_NOT_FOUND,
    description: 'No Firebase project context found in the current directory tree.',
    hint: 'Run from a Firebase project directory containing firebase.json, or set emulator host environment variables.',
  },
  SERVICE_NOT_CONFIGURED: {
    exitCode: EXIT_CODES.SERVICE_NOT_CONFIGURED,
    description: 'The requested service is not declared in firebase.json or env variables.',
    hint: 'Add the service to the emulators section of firebase.json.',
  },
  EMULATOR_NOT_RUNNING: {
    exitCode: EXIT_CODES.EMULATOR_NOT_RUNNING,
    description: 'The required emulator is configured but not running or not accessible locally.',
    hint: 'Start the required emulator with "firebase emulators:start" and retry.',
  },
  INVALID_INPUT: {
    exitCode: EXIT_CODES.INVALID_INPUT,
    description: 'The provided JSON, flags, path, or identifier is unusable.',
    hint: 'Check the provided data. Use --dry-run to preview an operation before mutating state.',
  },
  CONFIRMATION_REQUIRED: {
    exitCode: EXIT_CODES.CONFIRMATION_REQUIRED,
    description: 'Destructive operation blocked until confirmed or --force is passed.',
    hint: 'Pass --force to skip confirmation in automation.',
  },
  RULE_DENIED: {
    exitCode: EXIT_CODES.RULE_DENIED,
    description: 'Local security rules denied the described operation.',
    hint: 'Use "firetool rules check" to diagnose access for a specific target and identity.',
  },
  AMBIGUOUS_TARGET: {
    exitCode: EXIT_CODES.AMBIGUOUS_TARGET,
    description: 'The CLI cannot determine which local resource to affect.',
    hint: 'Provide an explicit --project flag or run from a directory with a single firebase.json.',
  },
}

export type GeneralHelpData = {
  description: string
  agentFlow: string[]
  commands: Array<{ name: string; description: string; destructive: boolean }>
  flags: Record<string, string>
  errorCodes: Record<string, ErrorCodeEntry>
}

export function buildGeneralHelp(): GeneralHelpData {
  return {
    description: 'Firetool CLI — Agent-first Firebase Emulator Control (local-only, no Firebase real fallback)',
    agentFlow: AGENT_FLOW,
    commands: [
      { name: 'doctor', description: 'Diagnose local Firebase emulator context and status', destructive: false },
      ...Object.values(SERVICE_CATALOG).map((s) => ({
        name: s.name,
        description: s.description,
        destructive: s.destructive,
      })),
    ],
    flags: {
      '--json': 'Output structured JSON instead of human-readable text (recommended for agents)',
      '--dry-run': 'Preview the intended operation without mutating emulator state',
      '--force': 'Skip confirmation prompts for destructive operations (use only when target is unambiguous)',
    },
    errorCodes: ERROR_CODES_CATALOG,
  }
}

export type ServiceHelpData = {
  service: TServiceName
  description: string
  destructive: boolean
  actions: string[]
  examples: string[]
  agentFlow: string[]
}

export function buildServiceHelp(service: TServiceName): ServiceHelpData {
  const info = SERVICE_CATALOG[service]
  return {
    service,
    description: info.description,
    destructive: info.destructive,
    actions: info.actions,
    examples: info.examples,
    agentFlow: AGENT_FLOW,
  }
}
