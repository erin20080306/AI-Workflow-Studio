# Project Rules

## Package manager

- Only use pnpm.
- Do not use npm, yarn, or bun.
- Never delete `pnpm-lock.yaml` merely to fix dependency problems.
- Check whether an existing dependency can meet a need before adding another one.

## Work process

- Read `docs/EXECUTION_PLAN.md` and `docs/STATUS.md` before modifying code.
- Work on only one phase at a time.
- Do not proceed while lint, typecheck, tests, or required builds fail.
- Inspect `git diff` before every commit.
- Update `docs/STATUS.md` after every phase.
- Give each completed phase its own Git commit.
- Do not claim a deployment, push, build, release, or test succeeded unless it actually succeeded.

## Repository safety

- Confirm the repository root before creating files.
- Do not create nested repositories.
- Do not create duplicated `apps/apps`, `packages/packages`, or `src/src` paths.
- Do not move or rename existing files without first checking all imports and build configuration.
- Never commit secrets, tokens, credentials, local absolute paths, or production data.
- Keep generated files, caches, reports, and build artifacts out of Git.

## TypeScript quality

- Keep strict TypeScript enabled.
- Avoid `any`.
- Do not use `@ts-ignore` to hide errors.
- Validate external input at runtime with Zod.
- Keep server-only credentials out of client bundles.

## Workflow safety

- AI may only generate validated workflow JSON.
- AI must never generate executable shell commands for end users.
- Never execute `eval`, `Function` constructors, arbitrary JavaScript, arbitrary Python, or arbitrary shell commands from AI output.
- Destructive workflow nodes require explicit approval.
- File operations must stay inside user-approved folders.
- All workflow runs must be idempotent and auditable.

## Testing

Run the relevant commands after every phase:

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build:web`
- `pnpm build:desktop` when desktop code is changed

Do not disable failing tests.
