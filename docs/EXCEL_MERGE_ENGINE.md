# Formatting-Preserving Multi-Tab Excel Merge

## Problem

The desktop Agent reads spreadsheets with SheetJS (`packages/local-executor/src/read.ts`).
SheetJS's community build exposes **cell values only** — it does not read legacy
`.xls` styling. Every merge path that flows through the in-memory
`SpreadsheetTable` model therefore loses borders, fills, fonts, column widths,
merged cells, and embedded images.

Measured on one real quote workbook (`2596@.xls`), same file through each engine:

| Style artifact     | LibreOffice | SheetJS |
| ------------------ | ----------- | ------- |
| Border definitions | 35          | 2       |
| Font definitions   | 51          | ~1      |
| Cell styles (`xf`) | 267         | 2       |
| Merged cells       | 7           | 1       |

A 187-workbook consolidation produced 8,617 preserved merged cells and 199
embedded images through the LibreOffice path versus a near-styleless grid
through SheetJS.

## Approach

Two stages, both free and headless (no GUI, no per-file macOS permission,
unlike sandboxed App Store Excel):

1. **Convert** legacy `.xls` → `.xlsx` with **LibreOffice headless**
   (`soffice --headless --convert-to xlsx`). LibreOffice reads the full `.xls`
   format and writes styling-complete `.xlsx`.
2. **Combine** each `.xlsx`'s first worksheet into one workbook, one tab per
   source file, with **ExcelJS** (already a `local-executor` dependency). ExcelJS
   reads `.xlsx` styles, so cell values, styles, column widths, row heights,
   merged ranges, and images all survive.

## What is implemented (this branch)

`packages/local-executor/src/combine-workbooks.ts`:

- `combineXlsxWorkbooksAsTabs(xlsxPaths, outputPath)` — pure ExcelJS multi-tab
  merge. Copies value + style per cell, column widths, row heights, merges, and
  images (`getImages`/`getImage`/`addImage`). Tabs are named after the source
  file (no numeric prefix); duplicates get a `(2)` suffix. Unit-tested without
  LibreOffice.
- `combineWorkbooksAsTabs(options)` — full pipeline. Converts `.xls` inputs via
  the injected `sofficePath`, then calls the ExcelJS merge. Bounded by
  `maxFiles` (default 500) and a conversion timeout; aborts on `signal`.
- New error codes `WORKBOOK_CONVERSION_FAILED` (retryable) and
  `WORKBOOK_COMBINE_FAILED`.
- Exported from `packages/local-executor/src/index.ts`.
- Tests: `combine-workbooks.test.ts` (formatting/image/naming/error paths).

## Remaining integration work

### 1. Bundle LibreOffice into the desktop Agent

The Agent is an Electron app; customers must install **nothing** extra.

- Ship a LibreOffice runtime inside the packaged app (extraResources), or a
  slimmed headless build, and resolve `sofficePath` to the bundled binary at
  runtime.
- Dev fallback: `AIWS_SOFFICE_PATH` env var, then
  `/Applications/LibreOffice.app/Contents/MacOS/soffice` (macOS) /
  the Windows install path.
- Freshly installed bundles need quarantine cleared once
  (`xattr -dr com.apple.quarantine`) — handle in packaging, not at runtime.
- Size tradeoff to decide: full LibreOffice (~400 MB, free) vs a licensed
  styling-capable library (small, paid). Bundling keeps the customer at zero
  install either way.

### 2. Route the `separate_sheets` merge through the new engine

`apps/desktop/src/main/workflow-job-executor.ts` `case 'excel.merge'` already
branches on `layout === 'separate_sheets'`, but `preservedSheets(envelope)`
operates on the **SheetJS-read in-memory envelope** — the lossy path.

Change: when `layout === 'separate_sheets'`, call `combineWorkbooksAsTabs`
against the **original source file paths** (from the claimed job's approved
folder), not the in-memory tables. The flatten path (`layout` default) is
unchanged.

### 3. Schema / planner

- `excel.merge` config already carries `layout: 'separate_sheets' | ...`. No new
  node type is strictly required — reusing `separate_sheets` is enough. If a
  clearer contract is wanted, add `excel.combine_workbooks` to
  `packages/workflow-schema/src/node-catalog.ts` + `node-configs.ts`.
- The grounded planner should emit `layout: 'separate_sheets'` when the request
  asks for "each file as a tab / 一個檔一個分頁" rather than a flattened table.

## Testing strategy

- Unit (done): `combineXlsxWorkbooksAsTabs` with ExcelJS fixtures — asserts
  styles, widths, merges, images, tab naming, and the empty-input error.
- Integration (gated, needs LibreOffice on the runner): `combineWorkbooksAsTabs`
  end-to-end on a small `.xls` fixture; skip when `soffice` is absent, mirroring
  the existing gated real-OS acceptance tests.
- Packaged acceptance: run the full Drive → download → combine chain on the
  packaged Agent and confirm the output opens in Excel with formatting + images.

## Limitations

- Only the **first worksheet** of each source becomes a tab (matches "one file =
  one quote = one tab"). Multi-sheet sources keep only sheet 1.
- Very complex `.xls` may convert with minor visual differences; quote-style
  tabular forms convert faithfully.
- Bundled LibreOffice increases the Agent download size (see the size tradeoff
  above).
