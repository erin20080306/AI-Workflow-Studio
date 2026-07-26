# Release checklist

Desktop release channels deliberately distinguish zero-cost testing from
customer-ready distribution.

## Channels

### Unsigned prerelease

A semantic-version prerelease tag such as `v0.2.0-beta.1` builds unsigned macOS
and Windows installers, verifies checksums, scans artifacts, and publishes a
GitHub Prerelease. Its filename and release title identify it as unsigned.

This channel is for controlled testing only. Testers must be warned that macOS
Gatekeeper or Windows SmartScreen may block or discourage installation. Never
describe an unsigned artifact as trusted, signed, notarized, Store-approved, or
production-ready.

### Signed stable release

A stable tag such as `v0.2.0` requires macOS Developer ID signing and
notarization plus Windows Authenticode. The workflow verifies both platforms and
creates a draft GitHub Release for final human review. Missing credentials fail
closed.

Stable signing is optional until the project chooses to pay for public direct
distribution. The free Windows production alternative is to package and submit
an MSIX to Microsoft Store, where Microsoft signs an accepted Store package.
That Store path requires a separate packaging, certification, and installation
test before use.

### Microsoft Store draft

The `Microsoft Store package draft` workflow is manually dispatched and builds
x64 and arm64 AppX packages on Windows. AppX is the Store-compatible packaging
target used by the current Electron Builder version. The packages embed the
Partner Center identity reserved for `AI Workflow Studio`, but remain unsigned
until Microsoft accepts and signs a submission.

The current artifact filename contains `DRAFT-DO-NOT-SUBMIT`. It exists only to
validate packaging and identity. Branded AppX assets and bilingual listing
drafts are committed under `apps/desktop/build/appx` and
`distribution/microsoft-store`. Do not upload a package to Partner Center until:

- a clean Windows machine passes install, launch, folder authorization, pairing,
  revocation, update, and uninstall tests;
- Windows App Certification Kit passes;
- Traditional Chinese and English Store listings, screenshots, privacy policy,
  support URL, age rating, and market/price selections are approved.

The workflow uploads draft packages to GitHub Actions for seven days and has no
Store submission credential or automatic publishing step.

## Before tagging

- [ ] Confirm the release channel and intended audience.
- [ ] Update the root and Desktop Agent versions; the tag without the leading
      `v` must exactly match the Desktop package version.
- [ ] Review user-visible changes and breaking changes.
- [ ] Confirm database migrations are immutable, ordered, and staging-tested.
- [ ] Confirm generated output, build caches, runtime data, reports, and secrets
      are absent from Git.
- [ ] Run `git diff` and review every changed file.
- [ ] Run:
  - `pnpm format:check`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm db:test`
  - `pnpm build:web`
  - `pnpm build:desktop`
  - `pnpm test:e2e`
- [ ] Verify native macOS and Windows development packaging in CI.
- [ ] For a Store candidate, run the manual Store package workflow on Windows
      and retain both architecture checksums and identity-verification evidence.
- [ ] Confirm the Vercel production checklist is current.

## Stable signing configuration

GitHub environments or repository secrets provide these values only to the
release workflow:

- macOS: `MACOS_CSC_LINK`, `MACOS_CSC_KEY_PASSWORD`, `APPLE_ID`,
  `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`
- Windows direct distribution: `WINDOWS_CSC_LINK` and
  `WINDOWS_CSC_KEY_PASSWORD`

- [ ] Protect secret changes with the smallest practical GitHub administrator
      group.
- [ ] Never pass a credential as a command-line argument or print it.
- [ ] Confirm the Apple Developer ID and Windows certificate identify the
      intended publisher.
- [ ] Rotate credentials before expiry and after any suspected disclosure.

Unsigned prereleases do not require these secrets.

## Workflow verification

- [ ] All called actions are pinned to full commit SHAs.
- [ ] Default workflow permission is `contents: read`.
- [ ] Only the final GitHub Release job receives `contents: write`.
- [ ] CI and release builds use `pnpm install --frozen-lockfile`.
- [ ] macOS and Windows builds run on their corresponding hosted operating
      systems.
- [ ] A stable macOS build passes `codesign` verification and Apple stapler
      validation.
- [ ] A stable Windows installer has a valid Authenticode status.
- [ ] The artifact scan finds no credential file, private key marker, provider
      token pattern, or local workspace path.
- [ ] Every downloadable artifact appears in a platform `SHA256SUMS-*` file.
- [ ] Every checksum verifies after downloading the workflow artifact.
- [ ] `release-metadata.json` identifies the Git ref, Git SHA, version, platform,
      architecture, signing status, size, and SHA-256 without local paths.

## Publish and rollback

- [ ] Inspect installer names, update metadata, checksums, and JSON metadata.
- [ ] Install on a clean Windows test account and a clean macOS test account.
- [ ] Pair and revoke a test Agent without exposing a token in logs.
- [ ] Test update discovery and confirm download remains user-initiated.
- [ ] Publish a stable draft only after final approval.
- [ ] Retain the previous known-good release and document rollback steps.
- [ ] If an artifact or signing key is compromised, unpublish the affected
      asset, revoke credentials, rotate them, rebuild from a clean tag, and
      publish a security notice.
