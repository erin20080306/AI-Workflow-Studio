# Bundled LibreOffice staging directory

Production packaging bundles a headless LibreOffice here so the desktop Agent's
formatting-preserving workbook combine engine needs **no separate customer
install**. `electron-builder.yml` copies this directory to
`Resources/libreoffice/` and `resolveSofficePath` locates the binary at:

- macOS: `libreoffice/LibreOffice.app/Contents/MacOS/soffice`
- Windows: `libreoffice/program/soffice.exe`
- Linux: `libreoffice/program/soffice`

## Staging

`scripts/stage-libreoffice.mjs` downloads the pinned LibreOffice
(`scripts/libreoffice-manifest.json`), verifies its SHA-256, and lays it out
here — mounting the macOS `.dmg` and copying `LibreOffice.app` (clearing
quarantine), or running a Windows MSI administrative install and flattening the
`program/` tree. It is idempotent (skips when already staged; `--force`
restages) and preserves this README.

```bash
pnpm stage:libreoffice                 # host platform, macOS defaults to aarch64
pnpm stage:libreoffice -- --mac-arch=x86_64
pnpm stage:libreoffice -- --dry-run    # print the resolved URL without downloading
pnpm stage:libreoffice -- --print-hash # download and print the sha256 to pin
```

The Desktop release workflow runs this automatically before every **stable**
build (`.github/workflows/release.yml`). The Document Foundation publishes no
`.sha256` sidecar (only GPG `.asc`), so `scripts/libreoffice-manifest.json`
must carry a committed `sha256` per platform and staging **fails closed**
without one. To bundle a newer LibreOffice: bump `version` in the manifest, run
`--print-hash` on each platform, and paste the values into the manifest.

macOS note: the release app is universal but a bundled LibreOffice is
single-arch. CI stages the aarch64 build; Intel Macs running the universal app
use it through Rosetta 2.

Ad-hoc test builds (`electron-builder.dev.yml`) skip this bundle; the Agent
falls back to a developer's system LibreOffice via `resolveSofficePath` (or the
`AIWS_SOFFICE_PATH` override).

The binary itself is intentionally **not** committed to git (hundreds of MB).
