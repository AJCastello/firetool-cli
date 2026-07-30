# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and version numbers follow Semantic Versioning as the project matures.

## [Unreleased]

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
