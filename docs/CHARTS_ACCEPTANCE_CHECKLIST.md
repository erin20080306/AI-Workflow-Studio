# Slides data-chart acceptance checklist

The cloud Drive-Excel flow can turn tabular data into a **native Google chart**
embedded in the generated Slides deck. Unit tests cover the derivation and the
API request shaping; this checklist is the manual, live-Google acceptance that
still needs a real connected account. Run it once per meaningful change to the
chart path (`deriveChartSeries`, `createDataChart`, `createProfessionalDeck`).

## What the flow does

1. `deriveChartSeries` (apps/web/src/lib/cloud-workflow-output.ts) reads the
   read-sheet/Drive-Excel `columns` + `rows`, sums the first numeric column
   grouped by the first category column, keeps the top 12 categories, and
   produces `{ kind, title, categories, values }`. An explicit `chartSeries`
   on the payload passes through unchanged.
2. `createDataChart` (packages/google-sheets/src/workspace.ts) creates a new
   spreadsheet titled `AIWS chart — <title>` with a `Data` sheet, then adds a
   native `pieChart`/`basicChart`, returning `{ spreadsheetId, chartId }`.
3. `createProfessionalDeck` embeds it with `createSheetsChart`
   (`LINKED`) so the deck contains a native chart object backed by the user's
   own Google Sheet — no third-party image service.

## Prerequisites

- A Google connection whose granted scopes include `spreadsheets`,
  `presentations`, and Drive read (`oauth.ts` default scopes). Reconnect if the
  connection predates the chart feature so the consent covers Sheets + Slides.
- A Drive folder with at least one Excel workbook whose first sheet has a text
  category column and a numeric column (e.g. `板材` and `數量`).

## Steps

1. On www.erin-aiworkflowstudio.com, create an automation from a prompt such as
   **「讀取這個 Drive 資料夾的 Excel，做成本摘要，並產生一份含圖表的 Google 簡報」**
   and point it at the folder above.
2. Approve the run. Let it complete through summarize → report → slides.
3. Open the Run details panel and follow the produced Google Slides link.

## Pass criteria

- [ ] The run finishes `succeeded`; the Slides step result is
      `google_slides_presentation` with a valid `docs.google.com/presentation`
      URL.
- [ ] The deck contains an **embedded chart object** (selectable/editable as a
      chart in Slides), not a flat PNG.
- [ ] A new spreadsheet `AIWS chart — …` exists in the account's Drive, with a
      `Data` sheet whose category/value rows match the source aggregation.
- [ ] Chart categories and values match `deriveChartSeries`: the top 12
      categories by summed value, largest first.
- [ ] No third-party/image-host request appears in the run — the chart is
      native Google (Sheets → Slides `createSheetsChart`).

## Troubleshooting

- **No chart in the deck**: confirm the source sheet actually has a numeric
  column; `deriveChartSeries` returns `undefined` for non-tabular input and the
  deck then renders text-only slides (expected fallback).
- **`GOOGLE_AUTHORIZATION_INVALID` / missing scope**: the connection lacks
  Sheets or Slides scope — reconnect and re-consent.
- **Chart shows as a static image**: verify the embed used `createSheetsChart`
  with `LINKED`; `NOT_LINKED_IMAGE` is disallowed because it inserts an
  unlinked image rather than an editable chart object.

## Desktop path

The desktop (local Agent) flow does **not** generate charts: charts need full
row data, and the desktop→cloud boundary sends only de-identified aggregates.
Enabling desktop charts requires a privacy review first — out of scope here.
