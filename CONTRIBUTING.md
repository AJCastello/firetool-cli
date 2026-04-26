# Contributing to Firetool CLI

Thanks for helping improve Firetool CLI.

## Ground rules

- Keep the CLI local-only. Do not introduce fallbacks to real Firebase resources.
- Preserve structured `--json` output, typed error codes, and destructive-operation guardrails.
- Prefer small, focused pull requests with clear user-facing intent.
- Update tests and documentation when behavior changes.

## Development setup

This repository uses Bun for local development.

```bash
bun install
bun run check
bun run build
```

Run the CLI from source:

```bash
bun run dev -- doctor --json
```

## Pull request checklist

Before opening a PR:

1. run `bun run check`;
2. run `npm pack --dry-run` if your change affects packaging or release behavior;
3. update `README.md`, `CHANGELOG.md`, or command help when user-facing behavior changes;
4. keep commits and PR description scoped to one coherent change.

## Release workflow

Firetool uses a changelog-plus-tag flow:

1. update `CHANGELOG.md`;
2. bump the package version in `package.json`;
3. run `bun run release:check`;
4. create a `v<version>` tag;
5. push the branch and tag;
6. publish with `npm publish --access public` or let the tag workflow publish when `NPM_TOKEN` is configured in GitHub.

## Reporting problems

- Use GitHub Issues for bugs, regressions, and feature requests.
- Use `SECURITY.md` for private vulnerability reporting.
