# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and version numbers follow Semantic Versioning as the project matures.

## [Unreleased]

### Fixed

- Error hints no longer suggest a `firebase emulators:start` command that starts nothing. When the Realtime Database emulator was down, `firetool rtdb <method>` suggested `firebase emulators:start --only rtdb`; `rtdb` is not a name the Firebase CLI accepts, so the command exits with "No emulators to start, run firebase init emulators to get started" — on a project that does declare the emulator. The suggestion now names the emulator the Firebase CLI actually serves the service from (`database` for `rtdb`, `firestore` for `rules`) and says so explicitly, so the rename does not read as a typo. This class of error is worse than a wrong result: the hint is copied and run verbatim by agents and scripts, and its failure mode points the caller at their own configuration.
- `SERVICE_NOT_CONFIGURED` now names the key to add to the `emulators` section of `firebase.json`, which for `rtdb` is `database` rather than the Firetool service name.

### Added

- `firetool doctor` now reports how to start the emulators that are configured but down, deriving the command from what discovery actually found: `No configured emulator is running. Start with: firebase emulators:start --only auth,database,firestore`. When only some are down it narrows to those. `doctor` is step 1 of the documented agent flow and therefore where a caller learns the project is idle; stopping at the diagnosis left them to construct an invocation whose emulator names do not all match Firetool's service names. The suggestion is emitted as a warning, so the `result` payload keeps its shape.
- `src/shared/emulators.ts` as the single source of truth for the Firetool service → Firebase emulator mapping, shared by discovery, policy hints, and `doctor`. Tests assert that every name it can emit appears in the set `firebase emulators:start --only` accepts, so a service added with an invented name fails in CI instead of in a user's terminal.
- `check-types:scope` script, which automated review tooling invokes and this package did not define.

### Changed

- README leads with `npx firetool-cli doctor` so the tool can be tried without a global install, documents `0.1.2` as the fallback for Node 20 and 21, and explains why the floor moved.
- SECURITY.md now points at GitHub Security Advisories, which has been enabled for the repository. It previously offered "GitHub Security Advisories, if enabled" and "a private direct contact with the maintainer" without an address — between them, no working private channel existed. It also states that `0.1.2` is a compatibility fallback receiving no fixes, rather than leaving the README's recommendation to imply otherwise.
- npm keywords expanded and GitHub repository topics set; the repository previously had none.

## [0.2.0] - 2026-07-30

### Changed

- **BREAKING: Firetool now requires Node.js 22.12 or newer.** The previous floor of `>=20` covered a runtime that reached end of life in April 2026, and nothing verified it — the test suite runs under Bun, while the published CLI runs under Node. Users on Node 20 or 21 should stay on `0.1.2`, which contains every fix released so far.
- `commander` upgraded from 14 to 15, which requires Node `>=22.12.0`. Runtime dependencies are not bundled, so a dependency's floor becomes this package's floor on the installing machine; taking this upgrade is what motivated raising `engines`.

### Added

- A `verify-node-floor` CI job that reads the declared minimum from `package.json`, installs exactly that Node version, builds the bundle, and runs the CLI under it. The supported-runtime claim is now exercised on every change instead of asserted.

## [0.1.2] - 2026-07-30

### Fixed

- `firetool --version` now reports the installed version. It was hardcoded to `0.1.0` in the CLI entrypoint, so `0.1.1` identified itself as `0.1.0` — enough to make an agent or a script conclude that an upgrade had not taken effect. The version is now read from `package.json`, which resolves identically from the source and bundled entrypoints, so the two cannot drift again.

### Changed

- The GitHub release is now created only after npm publishing succeeds. The two ran in parallel, so a failed publish could leave a GitHub release advertising a version that never reached the registry.
- `CONTRIBUTING.md` and `README.md` now describe the release process that actually exists. Both still instructed maintainers to publish with `npm publish` by hand or to configure an `NPM_TOKEN` secret; publishing moved to trusted publishing (OIDC), and a manual publish would now bypass the pipeline and produce a release without provenance. They also omitted that `main` is protected, so the version bump has to merge before the tag is created.

### Added

- The agent skill is now published to skills.sh, installable with `npx skills add AJCastello/firetool-cli`. `skill/` moved to `skills/` to match the discovery convention, and `SKILL.md` now tells agents to install the CLI binary separately before using it.

## [0.1.1] - 2026-07-30

### Fixed

- Realtime Database data commands now send emulator admin credentials, so `rtdb get`, `set`, `update`, `push`, `query`, `seed`, `import`, `export`, `delete`, and `clear` work against paths protected by `database.rules.json`. They previously failed with `RULE_DENIED` on any rule requiring authentication, and the accompanying hint pointed at a service-account option the CLI does not offer.
- Storage data commands now send emulator admin credentials. `list`, `download`, and `remove` use the rules-enforced surface and failed with `RULE_DENIED` whenever `storage.rules` required authentication.
- `help-info` no longer advertises actions that do not exist. It listed `functions list`, `pubsub list-topics`, `rtdb remove`, `storage delete`, and `auth clear`, none of which are implemented, while omitting `rtdb push`, `rtdb delete`, `rtdb clear`, `firestore list`, and `firestore delete-collection`. Its `rules check` examples also used a syntax the CLI rejects.

### Added

- Contributor documentation, security guidance, issue/PR templates, CODEOWNERS, and repository automation for public collaboration.
- CI and tag-based release workflows for validation, GitHub Releases, and npm publication.
- `src/shared/actions.ts` as the single source of truth for the action names each service accepts, shared by the routers and the help catalog, with tests that fail if the catalog drifts from the implementation again.
- The release workflow now verifies that the pushed tag matches the version in `package.json` before creating a release or publishing.

### Changed

- npm package metadata now links back to the GitHub repository, issue tracker, and project homepage.
- README now documents package contents, contribution flow, and the release/publish cycle.
- README and `docs/host-strategy.md` now document the admin-credential model for all four data services instead of Firestore alone, and state explicitly that a successful data command is not evidence that security rules allow the same operation.
- The npm publish step now authenticates through trusted publishing (OIDC) instead of a stored token. It previously skipped itself silently when no token was configured, reporting success without publishing.
- CI and release workflows build on Node 22.

## [0.1.0] - 2026-04-26

### Added

- Initial public foundation for the Firetool CLI.
- Local-only Firebase Emulator control surface for humans, scripts, CI, and AI agents.
- Bundled Node CLI distribution through `dist/cli/index.js`.
