# Desktop Agent

## Responsibility

The Electron Desktop Agent is the only component allowed to access local
folders. It pairs with the web control plane, polls for device-bound jobs, and
will run registered local executors. It never evaluates workflow text, source
code, shell commands, or arbitrary imports.

Phase 8 establishes the secure application, protocol client, local permission
model, and operator experience. Excel and CSV execution begins in Phase 9.

## Process boundary

- The main process owns the Agent network client, secure token storage, system
  folder picker, folder grants, structured logs, tray, startup settings, and
  update controller.
- The sandboxed renderer receives an exact, typed API through the preload
  bridge. It never receives `ipcRenderer`, Node.js, Electron, filesystem paths,
  device tokens, or arbitrary IPC channel access.
- Renderer navigation, new windows, webviews, network connections, and Electron
  permission requests are denied. Production content is loaded through a
  read-only custom protocol constrained to the packaged renderer directory.
- IPC requests are validated at runtime and accepted only from the current
  application window.

The window follows Electron's recommended isolation controls:
`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`,
`webSecurity: true`, and a restrictive Content Security Policy. See the
[Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
and
[context isolation guidance](https://www.electronjs.org/docs/latest/tutorial/context-isolation).

## Pairing and reconnect

The user enters a short-lived pairing code created by the web application. The
Agent exchanges it for one device-bound session, persists the session only
through operating-system encryption, and then sends authenticated heartbeat and
job-poll requests. It never puts tokens in URLs or logs.

The executor can be explicitly started and stopped. Transient transport failures
move the status offline and retry with bounded exponential delays from 5 to 60
seconds. Stopping the executor aborts the current request and cancels future
polls. Every response is size-bounded and runtime-validated before use.

## Local secure storage

The device session is encrypted with Electron `safeStorage` asynchronous APIs
before an atomic private-mode file replacement. If OS encryption is unavailable,
or Linux selects the insecure `basic_text` backend, pairing and session restore
fail closed. The encrypted session file is mode `0600`; its directory is mode
`0700`. See the
[Electron safeStorage API](https://www.electronjs.org/docs/latest/api/safe-storage).

Settings, folder grants, and encrypted session data live in the Electron
`userData` directory. Structured JSONL logs live in the Electron logs directory.
The logger masks credential-shaped keys, tokens, absolute paths, email
addresses, and row-like values before memory or disk persistence.

## Folder authorization

Only a system folder-picker result can create a grant. The local grant stores
the device ID, a random alias, the canonical real path, and separate read,
write, and watch permissions. Cloud-safe views contain the alias and display
name but never the canonical path.

Before any future file operation, the grant service:

1. Revalidates the owning device and requested permission.
2. Rejects absolute, empty, and traversal targets.
3. Resolves the target with `realpath`.
4. Confirms the resolved target remains inside the canonical grant root.
5. Rejects missing paths and symlink escapes.

The renderer can list or revoke aliases but cannot submit a raw path.

## Operator controls

The application provides pairing, connection and heartbeat status, pending-job
count, executor start/stop, folder grant management, redacted activity, privacy
mode, startup behavior, explicit unpair, and manual update controls. Closing the
window keeps the Agent available in the tray; only the explicit tray action
quits it.

## Updates and packaging

`autoDownload` and install-on-quit are disabled. An update check starts only
after a user action, and a second user action is required before download. The
production update channel will accept only formally signed artifacts in Phase 12. The Phase 8 package gate creates an unsigned, unpacked development
application and is not a distributable production release.

Electron Builder packages native targets on their matching operating systems.
See its
[target documentation](https://www.electron.build/docs/targets/) and
[auto-update documentation](https://www.electron.build/docs/features/auto-update/).

## Development

```bash
pnpm build:desktop
pnpm --filter @ai-workflow-studio/desktop dev
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm --filter @ai-workflow-studio/desktop package:test
```

The development renderer uses a deterministic preview bridge when Electron is
not present. It exists for visual testing only and never accesses local files or
the Agent API.
