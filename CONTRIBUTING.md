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

### The supported Node floor

The published CLI runs under Node, not Bun, and `package.json` declares the minimum in `engines.node`. Because the test suite runs under Bun, it says nothing about that floor, so CI has a dedicated `verify-node-floor` job: it reads the declared minimum from `package.json`, installs exactly that Node version, builds the bundle, and runs the CLI under it.

Changing `engines.node` is a breaking change to this package and needs its own release. Never raise it as a side effect of a dependency update — a dependency that demands a newer Node is a product decision, not a routine bump.

Runtime dependencies are **not** bundled: `dist/cli/index.js` imports them, and they resolve on the installing machine. A dependency's own `engines` therefore becomes this package's floor in practice, which is what the `verify-node-floor` job exists to catch.

## Pull request checklist

Before opening a PR:

1. run `bun run check`;
2. run `npm pack --dry-run` if your change affects packaging or release behavior;
3. update `README.md`, `CHANGELOG.md`, or command help when user-facing behavior changes;
4. keep commits and PR description scoped to one coherent change.

## Release workflow

Firetool publishes to npm through **trusted publishing (OIDC)**. The workflow exchanges the job's identity token for a short-lived registry credential, so there is no npm token stored in the repository and nothing to rotate.

**Do not run `npm publish` by hand.** A manual publish bypasses the pipeline and produces a release without provenance. The tag is the only supported way to publish.

`main` is protected, so the version bump reaches it through a pull request like any other change. The tag is created afterwards, on the merged commit:

1. open a release pull request that updates `CHANGELOG.md` — moving `[Unreleased]` into a dated `[<version>]` section — and bumps `version` in `package.json`;
2. run `bun run release:check` locally; this is exactly what the release workflow runs;
3. merge the release pull request;
4. pull `main`, then create an annotated `v<version>` tag **on the merged commit** and push it.

The workflow refuses to release when the tag does not match `package.json`, so a tag pointing at an un-bumped commit fails early rather than publishing the wrong version.

### Confirm the release actually happened

A green workflow is not proof of publication. Verify against the registry, not against the Actions tab:

```bash
npm view firetool-cli version
npm view firetool-cli@<version> dist.attestations
```

For a release that changes runtime behavior, install the published package and exercise the change against a local emulator before considering the release done.

### If publishing fails

The GitHub release is created only after npm publishing succeeds, so a failed publish leaves nothing half-done. Delete the tag, fix the problem, and re-tag the same version.

### Approvals

`main` requires a passing `validate` check and one approving review. GitHub does not allow approving your own pull request, so a solo maintainer cannot satisfy the review requirement on their own work and merges through the administrator bypass. Contributor pull requests go through normal review and must not be merged this way.

## Reporting problems

- Use GitHub Issues for bugs, regressions, and feature requests.
- Use `SECURITY.md` for private vulnerability reporting.
