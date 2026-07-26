# Local Excel and CSV Executor

## Boundary

The local executor runs only inside the Electron main process. A cloud workflow
can name a device-scoped folder alias and a safe relative file name; it cannot
submit or receive an absolute path. `FolderGrantStore` resolves the alias,
rechecks the device and requested permission, rejects lexical traversal, resolves
real paths, and rejects symlink escape before the executor sees a file.

The executor implements the Phase 9 capabilities:

- bounded `.xlsx` and independent CSV reads;
- worksheet merge with strict or union columns;
- deterministic column mapping, filters, and deduplication;
- verified new `.xlsx` and CSV output;
- SHA-256 input and output hashes;
- persisted restart-safe duplicate receipts;
- stabilized folder create/change watching.

The Agent advertises only registered Workflow v1 capability names. The Phase 11
Job executor now connects folder list, Excel read/merge/write/report, filter,
column map, and deduplicate functions to claimed, renewable-lease Jobs. Unknown
or cloud-only nodes fail closed.

## Read limits

Default limits are deliberately below the schema maxima:

| Limit                     | Default     |
| ------------------------- | ----------- |
| Compressed file size      | 50 MB       |
| Total data rows           | 100,000     |
| Worksheets                | 50          |
| Columns per worksheet     | 500         |
| ZIP entries               | 5,000       |
| Uncompressed archive size | 250 MB      |
| Per-entry compression     | 100:1 ratio |

Callers can lower these limits for a workflow. Runtime validation caps any
increase.

Before ExcelJS loads an `.xlsx`, a lazy central-directory scan rejects encrypted
entries, traversal names, VBA projects, embedded objects, external workbook
links, excessive entry counts, excessive uncompressed size, and suspicious
compression ratios. Legacy `.xls`, `.xlsm`, and every other extension fail with
a structured unsupported-format error.

ExcelJS parses values but never calculates formulas or runs workbook content.
Formula text is discarded; only an already-cached scalar result can enter the
local dataset. Hyperlink targets, drawings, validations, protection metadata,
and other execution-irrelevant nodes are ignored. No formula is generated.

## Transformations

Rows are records of only `string`, finite `number`, `boolean`, or `null`.
Dates become ISO timestamps. Complex cell objects become safe text or `null`.
Empty rows are skipped. Blank and duplicate headers receive deterministic
names.

- Strict merge requires identical ordered columns; union merge fills absent
  values with `null`.
- Column mapping rejects output collisions rather than losing a value.
- Filters use closed operators from Workflow v1.
- Deduplication requires existing key columns and deterministic first/last
  retention.

No transformation evaluates expressions, source code, regex supplied by AI, or
arbitrary callbacks.

## Safe output

Normal workflows pass `overwrite: false`. The writer:

1. Requires an existing, authorized output parent.
2. Rejects a symbolic-link destination and unsupported extension.
3. Acquires a private exclusive output lock.
4. Writes a random same-directory temporary file with mode `0600`.
5. Flushes, rereads, and revalidates row/sheet/size/archive limits.
6. Computes the temporary SHA-256.
7. Renames the verified file atomically.
8. Rehashes the final file and requires an exact match.
9. Removes temporary and lock files on every exit path.

The lower-level destructive overwrite option is not exposed by the current
Workflow v1 output schema. If it is invoked by a future explicitly approved
operation, it requires an exclusive backup, verifies the backup hash before
rename, and records that a backup was created.

CSV supports one table per output. Cells beginning with Excel formula-trigger
characters are prefixed with an apostrophe to prevent spreadsheet formula
injection.

## Duplicate suppression

The processing ledger hashes a workflow/version context plus sorted input
SHA-256 values. It never persists raw paths or workflow identifiers. Active
claims are serialized in memory, and successful receipts are atomically stored
in a private `0600` file. A restarted Agent returns `duplicate` before opening an
already-produced output.

Electron also enforces a single Agent process per OS user. Same-directory output
locks prevent concurrent writers from targeting one file.

## Folder watching

The watcher receives only a previously resolved canonical grant root and a
single-segment filename pattern. It:

- ignores initial files and watches only the root and its direct children;
- never follows symbolic links;
- waits for file size stability;
- resolves and rechecks canonical containment for every event;
- accepts only real files matching the safe pattern;
- hashes content and suppresses unchanged events.

Portable polling is used at a bounded 250 ms interval because native watcher
limits vary across desktop platforms. Persistent ledger checks remain the
restart-safe source of duplicate suppression.

## MVP limitations

- No `.xls`, `.xlsm`, VBA, macros, embedded objects, or external workbook links.
- No guarantee of preserving pivot tables, charts, external data connections,
  complex styling, or every Excel-native feature.
- Workbooks are processed in bounded memory; streaming multi-million-row
  processing is outside the MVP.
- Folder watchers do not recurse into arbitrary directory trees.
- Folder listing and watching remain non-recursive and capped; they do not
  enumerate arbitrary directory trees.
