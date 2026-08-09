# Bundled LibreOffice staging directory

Production packaging bundles a headless LibreOffice here so the desktop Agent's
formatting-preserving workbook combine engine needs **no separate customer
install**. `electron-builder.yml` copies this directory to
`Resources/libreoffice/` and `resolveSofficePath` locates the binary at:

- macOS: `libreoffice/LibreOffice.app/Contents/MacOS/soffice`
- Windows: `libreoffice/program/soffice.exe`
- Linux: `libreoffice/program/soffice`

## CI responsibility

Before a production build, CI must stage the platform's LibreOffice into this
directory (e.g. copy `/Applications/LibreOffice.app` on macOS, or the
`program/` tree on Windows/Linux), and clear quarantine on macOS
(`xattr -dr com.apple.quarantine`).

Ad-hoc test builds (`electron-builder.dev.yml`) skip this bundle; the Agent
falls back to a developer's system LibreOffice via `resolveSofficePath`.

The binary itself is intentionally **not** committed to git (hundreds of MB).
