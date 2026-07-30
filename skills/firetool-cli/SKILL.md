---
name: firetool-cli
description: Use Firetool CLI to control Firebase emulators safely from agent workflows.
version: 1.0.0
---

# Firetool CLI Agent Skill

Firetool CLI is an agent-first, local-only command line tool for interacting with Firebase emulators. Use it when a task needs to inspect, seed, mutate, reset, or diagnose local Firebase emulator state without touching real Firebase resources.

Firetool is designed for agent workflows because it supports structured JSON output, explicit error categories, local context discovery, and guardrails for destructive operations.

## Prerequisites

The Firetool CLI binary must be installed in this environment before use. This skill provides procedural guidance only; it does not install the tool.

If `firetool --version` is not available, install it from npm:

```bash
npm install -g firetool-cli
```

Confirm the install succeeded before continuing:

```bash
firetool --version
```

## When to use

Use this skill when working with local Firebase Emulator Suite tasks involving Auth, Firestore, Realtime Database, Storage, Functions, Pub/Sub, security rules, or emulator diagnostics.

Do not assume production Firebase access. Firetool is intended for local emulator operations only.

## Discovery-first workflow

Always discover the available CLI surface before choosing commands:

1. Run `firetool --help` to inspect top-level commands.
2. Run `firetool help-info --json` for the agent-oriented service catalog and error model.
3. Run `firetool help-info <service> --json` for service-specific guidance.
4. Run `firetool <service> --help` or `firetool <service> <method> --help` before invoking a method.

Prefer `--json` so results can be parsed reliably. Use `firetool doctor --json` before sensitive operations to confirm the Firebase project context and emulator status.

## Safety expectations

- Treat Firetool as local-only; do not use it for real Firebase resources.
- Prefer `--dry-run` before operations that may overwrite, delete, seed, import, or clear data.
- Use `--force` only after the target and impact are explicit.
- If Firetool returns a structured error, follow the `code`, `message`, and `hint` fields instead of retrying blindly.

## Agent behavior

Do not memorize or duplicate the full command list in prompts. Use the CLI help and `help-info` commands as the source of truth, then execute the smallest command that satisfies the user request.
