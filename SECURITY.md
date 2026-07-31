# Security Policy

## Supported versions

Firetool CLI is currently in its early public release phase. Security fixes are applied to the latest published release line only.

| Version | Supported |
| --- | --- |
| `0.2.x` | yes |
| `0.1.x` | no |

`README.md` points users still on Node 20 or 21 at `0.1.2`, since `0.2.0` raised the runtime floor. That is a compatibility fallback, not a supported line: it receives no fixes, including security fixes. Upgrading Node is the only path that stays supported.

## Reporting a vulnerability

Please do not open public GitHub issues for suspected security vulnerabilities.

Report privately through GitHub Security Advisories, which is enabled for this repository:

**https://github.com/AJCastello/firetool-cli/security/advisories/new**

That is the only private channel; there is no separate security mailing address.

Include:

- affected Firetool CLI version;
- impact summary;
- reproduction steps or proof of concept;
- whether the issue can escape the local-only safety model or target non-emulator resources.

You can expect acknowledgement and triage as quickly as practical. Valid reports will be investigated privately first, then disclosed with a fix and release notes when appropriate.
