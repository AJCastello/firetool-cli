---
name: Firetool CLI Main Instruction
version: 1.0.0
---

# Firetool CLI — Project Instructions

## Project identity

This repository is **Firetool CLI**, an open source command line tool for controlling Firebase emulators locally with predictable, agent-friendly behavior.

Repository URL: https://github.com/AJCastello/firetool-cli

Firetool exists to reduce the friction of inspecting, seeding, resetting, and automating Firebase Emulator Suite workflows. It is designed for developers, scripts, CI jobs, and AI agents that need structured output and safe local operations across Firebase Auth, Firestore, Realtime Database, Storage, Functions, Pub/Sub, and security rules.

## Core purpose

The CLI must remain **local-only**. It must never fall back to real Firebase resources. Sensitive operations should validate that the target emulator is configured, running locally, and unambiguous before mutating state.

The main value proposition is:

- one CLI surface for common Firebase emulator operations;
- JSON-first output for agents and automation;
- explicit error categories and exit codes;
- dry-run and force guardrails for destructive operations;
- discoverable commands through `firetool --help` and `firetool help-info --json`.

## Technology summary

The project uses:

- TypeScript for source code;
- Bun for local development, tests, dependency management, and scripts;
- tsdown for building the distributable Node CLI bundle;
- Commander for CLI command parsing;
- Zod for runtime schemas and contract validation;
- tRPC-style internal routers for strongly structured command procedures;
- Firebase Emulator Suite HTTP surfaces as the operational target;
- npm package metadata for future public distribution.

The distributable CLI entrypoint is:

```text
dist/cli/index.js
```

The published package should include only the runtime bundle and public package files. Repository-only agent assets must not be included in the npm package unless explicitly decided later.

## Open source readiness expectations

As the project evolves, keep the repository friendly to external contributors:

- maintain a clear README with scope, examples, and safety model;
- keep the MIT license present;
- add contribution and security guidance before broader promotion;
- prefer pull requests for public changes;
- protect the default branch before accepting external contributions;
- enable security features such as Dependabot alerts and dependency updates;
- keep issue and pull request templates concise and useful;
- keep releases and npm publishing reproducible through scripts.
