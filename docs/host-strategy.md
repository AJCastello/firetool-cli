# Local Emulator Host Strategy

Firetool CLI operates exclusively against local Firebase emulators. This document explains the host classification policy, which topologies are supported, how to configure non-standard setups, and why certain hosts remain blocked by default.

## Why hosts are validated

Firetool's value proposition rests on a safety guarantee: it never accidentally targets a real Firebase project. Firebase emulator hosts can be configured in `firebase.json`, `.firebaserc`, or environment variables, and those values are controlled by the developer. If Firetool blindly connected to whatever host was configured, a misconfiguration or a compromised environment file could point the tool at a production endpoint and trigger a destructive operation.

Strict host validation enforces the local-only contract before any emulator call is made.

## Safe defaults

The following host values are accepted without any extra configuration:

| Host value | Why it is accepted |
|---|---|
| `localhost` | Standard loopback hostname |
| `127.0.0.1` — `127.255.255.255` | Full `127.0.0.0/8` loopback range |
| `0.0.0.0` | Bind-all IPv4 used by Firebase emulators and WSL setups |
| `::1` | IPv6 loopback (compressed) |
| `0:0:0:0:0:0:0:1` | IPv6 loopback (expanded) |
| `::ffff:127.x.x.x` | IPv4-mapped loopback |
| `::` | Bind-all IPv6 |

These addresses can only refer to the current machine or a bind-all listener on the current machine. They cannot be routed to a remote host.

### Why `0.0.0.0` is accepted

Firebase emulators often bind to `0.0.0.0` rather than `127.0.0.1`, especially in WSL, Docker, and devcontainer environments. Binding to `0.0.0.0` means "accept connections on all interfaces of this machine." It does not mean "connect to a remote host." Blocking it would prevent Firetool from working in the most common Firebase emulator setups.

## Host normalization

Emulator host values sometimes arrive with extra characters due to environment variable formatting or firebase.json variations. Firetool normalizes each raw host value before classification:

1. Leading and trailing whitespace is stripped.
2. Any `http://` or `https://` protocol prefix is removed.
3. Bracketed IPv6 forms such as `[::1]` are unwrapped to `::1`.
4. A port suffix (`:8080`) is stripped from non-IPv6 values.
5. A trailing dot (DNS absolute form, `localhost.`) is stripped.
6. The result is lowercased.

After normalization, classification proceeds against the safe-defaults list, the explicit allowlist, and optional DNS resolution.

## Development topology scenarios

### Standard local setup

Firebase emulators running directly on the developer's machine with `localhost` or `127.0.0.1` as the host. All services will be accepted automatically.

### Firebase emulators bound to `0.0.0.0`

Firebase CLI versions and certain operating system configurations cause the emulator to bind to `0.0.0.0`. This is accepted by default. No additional configuration is needed.

```
# firebase.json emulator host set to 0.0.0.0 — accepted automatically
FIRESTORE_EMULATOR_HOST=0.0.0.0:8080
```

### WSL (Windows Subsystem for Linux)

When running Firebase emulators inside WSL, the emulator typically binds to `0.0.0.0` or `localhost` inside the WSL environment. Accessing it from within the same WSL session works automatically because `0.0.0.0` and `127.0.0.1` are accepted.

If the emulator is running on the Windows host and accessed from WSL via the Windows host alias (commonly `host.docker.internal` or a specific IP), that hostname or IP is not in the safe-defaults list and must be explicitly allowlisted:

```bash
export FIRETOOL_ALLOWED_EMULATOR_HOSTS=host.docker.internal
```

### Docker and devcontainers

Emulators running inside a Docker container are not accessible at `localhost` from the host machine or from sibling containers unless network bridging is configured. Common scenarios:

- **`host.docker.internal`**: On Docker Desktop (Mac and Windows), this name resolves to the host machine. Use the allowlist:
  ```bash
  export FIRETOOL_ALLOWED_EMULATOR_HOSTS=host.docker.internal
  ```

- **Docker Compose service names**: When Firetool and the emulator run in separate Docker Compose services, the emulator may be reachable by its service name (e.g., `firebase-emulator`). Use the allowlist:
  ```bash
  export FIRETOOL_ALLOWED_EMULATOR_HOSTS=firebase-emulator
  ```

- **Emulator inside the same container**: If Firetool and the emulator share the same container, `localhost` and `127.0.0.1` work without any allowlist entry.

### Custom local hostnames and `/etc/hosts` aliases

Some developers map a friendly name to loopback in `/etc/hosts` (e.g., `firebase.local → 127.0.0.1`). Firetool supports this through DNS-based fallback: if a hostname is not in the safe-defaults list or the explicit allowlist, Firetool attempts DNS resolution. If every resolved address is a known-local address, the hostname is accepted as `dns-resolved-loopback`.

This means `/etc/hosts` entries that resolve to `127.x.x.x` or `::1` are accepted automatically, without requiring a manual allowlist entry.

If DNS resolution fails, returns mixed results, or returns a non-loopback address, the host is blocked.

### IPv6 loopback variants

All of the following are accepted as equivalent to `::1`:

- `::1`
- `[::1]` (bracketed, common in URLs)
- `0:0:0:0:0:0:0:1` (expanded form)

`::ffff:127.0.0.1` and similar IPv4-mapped loopback addresses are also accepted.

## Explicit allowlist

When the emulator topology cannot be covered by the safe-defaults list or DNS resolution, use the `FIRETOOL_ALLOWED_EMULATOR_HOSTS` environment variable:

```bash
export FIRETOOL_ALLOWED_EMULATOR_HOSTS=host.docker.internal,firebase-emulator
```

Rules:

- The value is a comma-separated list of host strings.
- Each entry is normalized (protocol stripped, port stripped, lowercased) before comparison.
- Matching is exact after normalization. Wildcards and patterns are not supported.
- The allowlist is read on every command invocation, so changes take effect without restarting a shell.
- Allowlisted hosts bypass DNS resolution. They are trusted unconditionally.

The allowlist is intended for:

- Docker host aliases (`host.docker.internal`);
- Docker Compose service names (`firebase-emulator`, `auth-emulator`);
- WSL or devcontainer host aliases that do not resolve to loopback via standard DNS;
- any custom internal hostname the developer controls and trusts as local.

## What remains blocked

### Public Firebase and Google hosts

Hostnames such as `firestore.googleapis.com`, `firebaseio.com`, `identitytoolkit.googleapis.com`, and any other public Firebase or Google endpoint are blocked. These are never valid emulator hosts and their appearance in a configuration almost certainly indicates a misconfiguration pointing at a production service.

### Private LAN IP ranges

The following private IP ranges are **blocked by default**:

| Range | CIDR |
|---|---|
| `10.x.x.x` | `10.0.0.0/8` |
| `172.16.x.x` — `172.31.x.x` | `172.16.0.0/12` |
| `192.168.x.x` | `192.168.0.0/16` |

**Why private LAN IPs are not auto-trusted**: A private IP address on your local network may represent another developer's machine, a shared staging environment, a container running a different service, or a corporate server. Auto-trusting the entire `192.168.0.0/16` range because it is "private" would allow Firetool to connect to any of those machines. The local-only guarantee would become meaningless.

If you genuinely run emulators at a private LAN IP and understand the implications, add that specific IP to the allowlist:

```bash
export FIRETOOL_ALLOWED_EMULATOR_HOSTS=192.168.1.42
```

### Arbitrary public hostnames

Any hostname that is not in the safe-defaults list, not in the allowlist, and does not resolve exclusively to loopback addresses is blocked. DNS failures are treated as blocked, not as trusted.

## Firestore data operations vs security rules

Firetool's Firestore data commands (`get`, `set`, `update`, `query`, `seed`, `delete`, etc.) use emulator admin credentials when talking to the Firestore emulator. This means they can read and write data regardless of your app's security rules.

This is intentional. Firetool data commands are **local administration tools**, not application-user simulators. They exist to help you inspect, seed, and reset emulator state reliably — tasks that would be impossible if they were subject to per-user access rules.

If you want to validate what a specific authenticated user can or cannot do under your security rules, use the rules command:

```bash
firetool rules check \
  --service firestore \
  --path products/abc123 \
  --intent read \
  --auth-uid user_123 \
  --json
```

The `rules check` command simulates a rule evaluation for a given path, operation, and auth context without bypassing rules. It is the correct tool for validating rule coverage. Data commands are the correct tool for managing local state.

## Error messages

When Firetool blocks a host, the error output identifies the host and includes a hint:

```json
{
  "ok": false,
  "error": {
    "code": "EMULATOR_NOT_RUNNING",
    "message": "The firestore emulator host \"192.168.1.10\" is not a local address. firetool only operates against local emulators.",
    "hint": "Set the emulator host to a local address (e.g. \"localhost\", \"127.0.0.1\", \"0.0.0.0\", or \"::1\"). For Docker/WSL hosts, set FIRETOOL_ALLOWED_EMULATOR_HOSTS=<hostname>."
  }
}
```

The `EMULATOR_NOT_RUNNING` code is used for both "not running" and "non-local host" cases. Use the message text to distinguish them.

## Summary table

| Host value or scenario | Accepted by default | Accepted via allowlist | Permanently blocked |
|---|---|---|---|
| `localhost`, `127.x.x.x` | ✓ | — | — |
| `0.0.0.0` | ✓ | — | — |
| `::1`, `[::1]`, expanded forms | ✓ | — | — |
| `::ffff:127.x.x.x` | ✓ | — | — |
| `::` (bind-all IPv6) | ✓ | — | — |
| `/etc/hosts` alias → loopback | ✓ (DNS) | — | — |
| `host.docker.internal` | — | ✓ | — |
| Docker Compose service name | — | ✓ | — |
| WSL host alias (non-loopback DNS) | — | ✓ | — |
| Private LAN IP (`192.168.x.x`, etc.) | — | ✓ (explicit) | — |
| Public Firebase/Google hostname | — | — | ✓ |
| Arbitrary public hostname | — | — | ✓ |
| DNS-unresolvable hostname | — | — | ✓ |
| Hostname resolving to non-loopback | — | — | ✓ |
