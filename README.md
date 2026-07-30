# Firetool CLI

[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-ready-000000?logo=bun&logoColor=white)](https://bun.sh/)
[![Firebase Emulators](https://img.shields.io/badge/Firebase-Emulators-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/docs/emulator-suite)
[![Local only](https://img.shields.io/badge/safety-local--only-16a34a)](#local-only-by-design)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![skills.sh](https://skills.sh/b/AJCastello/firetool-cli)](https://skills.sh/AJCastello/firetool-cli)

![Firetool CLI](https://raw.githubusercontent.com/AJCastello/firetool-cli/main/firetool-cli.png)

**Firetool CLI is an agent-first command line tool for controlling Firebase emulators without ever falling back to real Firebase resources.**

Firebase emulators are excellent for local development, but they are awkward to inspect, seed, reset, and automate across Auth, Firestore, Realtime Database, Storage, Functions, Pub/Sub, and Rules. That friction gets worse when AI agents, scripts, or CI jobs need predictable structured output and safe failure modes.

Firetool solves that by giving developers and automation a single local-only CLI with consistent JSON output, explicit exit codes, dry-run support, and guardrails around destructive operations.

## Why this exists

Modern development workflows increasingly rely on agents, repeatable test data, and local integration environments. Firebase projects often end up needing one-off scripts for common emulator tasks:

- creating and deleting Auth emulator users;
- seeding Firestore or Realtime Database data;
- exporting local state for debugging;
- clearing emulator data between tests;
- calling local Functions;
- publishing local Pub/Sub messages;
- checking Firestore and Storage rules behavior;
- detecting whether the right emulator context is running.

Firetool turns those tasks into a stable CLI surface designed for both humans and machines.

## Highlights

- **Local-only safety model**: Firetool blocks non-local hosts and is designed to operate only against Firebase emulators.
- **Agent-friendly output**: every command can emit structured JSON with `--json`.
- **Predictable failures**: error categories map to distinct exit codes for shell scripts and AI agents.
- **Destructive-operation guardrails**: dangerous operations require `--force`; many support `--dry-run`.
- **Firebase context discovery**: `firetool doctor` inspects `firebase.json`, `.firebaserc`, emulator environment variables, and running ports.
- **Multi-service coverage**: Auth, Firestore, Realtime Database, Storage, Functions, Pub/Sub, and security rules.
- **Typed internals**: built with TypeScript, Zod schemas, and a tRPC-style internal router.

## Service coverage

| Service | What Firetool helps with | Common methods |
| --- | --- | --- |
| Auth Emulator | Create, inspect, update, and clean up local users for tests and demos. | `create-user`, `list-users`, `get-user`, `update-user`, `delete-user`, `clear-users` |
| Firestore Emulator | Work with local documents and collections, including repeatable seed/import/export flows. | `get`, `list`, `set`, `update`, `query`, `seed`, `import`, `export`, `delete`, `delete-collection`, `clear` |
| Realtime Database Emulator | Read, write, query, seed, export, and reset local RTDB paths. | `get`, `set`, `update`, `push`, `query`, `seed`, `import`, `export`, `delete`, `clear` |
| Storage Emulator | Manage local bucket objects without touching production storage. | `list`, `upload`, `download`, `remove`, `clear` |
| Functions Emulator | Invoke local Firebase Functions by name or URL with JSON payloads. | `call` |
| Pub/Sub Emulator | Publish structured local messages with optional attributes. | `publish` |
| Rules checks | Probe Firestore and Storage security rules locally for a path, intent, and auth context. | `check` |
| Diagnostics | Discover Firebase project context and emulator availability before acting. | `doctor`, `help-info` |

## Agent skill

This repository includes a concise skill for AI agents at [`skills/firetool-cli/SKILL.md`](skills/firetool-cli/SKILL.md). It tells agents how to discover and use the CLI through `firetool --help`, `firetool help-info`, and JSON-first command execution instead of relying on copied command lists.

Install the skill into a supported agent with:

```bash
npx skills add AJCastello/firetool-cli
```

The skill teaches agents how to drive Firetool, but it does not install the Firetool CLI binary itself — install that separately as described in [Installation](#installation).

## Installation

Firetool requires **Node.js 22.12 or newer**. That floor is not a guess: CI installs exactly that version, builds the CLI, and runs it, so the compatibility claim is exercised on every change rather than asserted.

Install Firetool globally:

```bash
npm install -g firetool-cli
```

Then run it inside a Firebase project using the Emulator Suite:

```bash
firetool doctor
firetool doctor --json
```

Published packages include only the built CLI bundle plus the public package files:

- `dist/`
- `README.md`
- `LICENSE`

## Local development

This repository uses Bun.

```bash
bun install
bun run check
bun run build
```

Run the CLI directly from source:

```bash
bun run dev -- doctor --json
```

Build output is generated under `dist/` and is intentionally ignored by Git.

## Contributing and security

If you want to contribute, start with [CONTRIBUTING.md](CONTRIBUTING.md). For security reports, use [SECURITY.md](SECURITY.md) instead of filing a public issue.

## Quick start

Start Firebase emulators in your project:

```bash
firebase emulators:start
```

Diagnose the local context:

```bash
firetool doctor --json
```

Create a local Auth user:

```bash
firetool auth create-user \
  --email user@example.test \
  --password secret123 \
  --json
```

Seed a Firestore collection:

```bash
firetool firestore seed products \
  --file ./products.seed.json \
  --dry-run \
  --json
```

Call a local Firebase Function:

```bash
firetool functions call createUserProfile \
  --data '{"uid":"abc123"}' \
  --json
```

Publish a local Pub/Sub message:

```bash
firetool pubsub publish user-created \
  --data '{"uid":"abc123"}' \
  --attribute source=local-test \
  --json
```

Check local security rules:

```bash
firetool rules check \
  --service firestore \
  --path products/abc123 \
  --intent read \
  --auth-uid user_123 \
  --json
```

## Commands

| Area | Command | What to use it for | Useful flags |
| --- | --- | --- | --- |
| Diagnostics | `firetool doctor` | Check whether Firetool found a Firebase project and which emulators are configured/running. | `--json` |
| Discovery | `firetool help-info [service]` | Print the agent-first usage guide, service catalog, and error model. | `--json` |
| Auth | `firetool auth <method>` | Manage local Auth emulator users for tests, demos, and repeatable local setup. | `--json`, `--force` |
| Firestore | `firetool firestore <method>` | Inspect, mutate, seed, import/export, and clear local Firestore data. | `--json`, `--dry-run`, `--force`, `--file`, `--data` |
| Realtime Database | `firetool rtdb <method>` | Inspect, mutate, seed, import/export, and clear local RTDB paths. | `--json`, `--dry-run`, `--force`, `--file`, `--data` |
| Storage | `firetool storage <method>` | List, upload, download, remove, and clear local Storage emulator objects. | `--json`, `--dry-run`, `--force`, `--bucket`, `--file` |
| Functions | `firetool functions call <name-or-url>` | Invoke a local Firebase Function with an optional JSON payload. | `--json`, `--data` |
| Pub/Sub | `firetool pubsub publish <topic>` | Publish local Pub/Sub messages with optional attributes. | `--json`, `--data`, `--attribute` |
| Rules | `firetool rules check` | Check Firestore or Storage rules locally for a path, operation intent, and optional auth context. | `--json`, `--service`, `--path`, `--intent`, `--auth-uid` |

## Local-only by design

Firetool is intentionally scoped to local Firebase emulator workflows. It discovers emulator settings from:

- `firebase.json`;
- `.firebaserc`;
- Firebase emulator environment variables such as `FIRESTORE_EMULATOR_HOST`;
- default local emulator ports.

Before sensitive operations, it checks that the target service is configured, running, local, and unambiguous. Non-local hosts are blocked instead of being treated as valid targets.

Accepted by default: `localhost`, the full `127.0.0.0/8` loopback range, `0.0.0.0` (commonly used by Firebase emulators and WSL setups), IPv6 loopback (`::1`, expanded forms, `::ffff:127.x.x.x`), and custom hostnames whose DNS resolves exclusively to loopback addresses.

For Docker, devcontainer, and WSL topologies where the emulator is reachable via a non-loopback hostname (e.g. `host.docker.internal`), add that hostname to the explicit allowlist:

```bash
export FIRETOOL_ALLOWED_EMULATOR_HOSTS=host.docker.internal,firebase-emulator
```

Private LAN IPs (`192.168.x.x`, `10.x.x.x`, `172.16–31.x.x`) are blocked by default because they may represent another machine, a shared environment, or a container Firetool should not target without an explicit decision. Add a specific IP to the allowlist if you genuinely run emulators there.

See [docs/host-strategy.md](docs/host-strategy.md) for the full explanation of the classification model, all supported topology scenarios, and the admin vs rules-check distinction.

### Data commands bypass security rules

Data commands for Auth, Firestore, Realtime Database, and Storage talk to the emulators with admin credentials, so they work regardless of `firestore.rules`, `database.rules.json`, or `storage.rules`. This keeps seeding and resetting local state predictable.

The consequence is worth stating plainly: a successful data command does **not** mean your app could perform the same operation. To check what your rules actually allow for a given identity, use `firetool rules check`.

## JSON output and exit codes

Use `--json` when integrating with agents, scripts, or CI:

```json
{
  "ok": true,
  "operation": "firestore.seed",
  "target": {
    "service": "firestore",
    "resourcePath": "products"
  },
  "result": {},
  "warnings": []
}
```

Known error categories use distinct exit codes:

| Error code | Meaning |
| --- | --- |
| `CONTEXT_NOT_FOUND` | No Firebase project context was found. |
| `SERVICE_NOT_CONFIGURED` | The requested emulator is not configured. |
| `EMULATOR_NOT_RUNNING` | The emulator is configured but unavailable locally. |
| `INVALID_INPUT` | JSON, flags, paths, or identifiers are invalid. |
| `CONFIRMATION_REQUIRED` | A destructive operation needs confirmation or `--force`. |
| `RULE_DENIED` | Local rules denied the requested operation. |
| `AMBIGUOUS_TARGET` | Firetool cannot determine the local target safely. |

## Releases and publishing

Firetool uses a tag-first release cycle, published to npm through trusted publishing (OIDC) with build provenance. No npm token is stored in the repository, and releases are never published by hand.

1. open a release pull request updating [`CHANGELOG.md`](CHANGELOG.md) and the version in `package.json`;
2. run `bun run release:check`;
3. merge it;
4. tag the merged commit `v<version>` and push the tag.

The workflow verifies that the tag matches `package.json` before releasing, and creates the GitHub release only after npm publishing succeeds.

The npm package ships only the built CLI bundle and essential package files, not the full repository source tree.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full release procedure, including how to verify a publication actually reached the registry.

## License

MIT
