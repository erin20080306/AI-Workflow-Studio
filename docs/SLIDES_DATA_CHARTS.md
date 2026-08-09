# Data-Driven Charts in Generated Slides

## Goal

Let a generated Google Slides deck include real charts (bar / pie / line) built
from the Excel data behind the report, instead of text-only bullet slides.

## Why this is not a small change

Three real blockers, discovered while scoping:

1. **No chart APIs exist yet.** `packages/google-sheets/src/workspace.ts` has no
   Sheets `addChart` or Slides `createSheetsChart` support — both must be built.
2. **No chartable numbers reach the slides step.** The pipeline
   `ai.summarize → report.compose → google_slides.create` passes **text only**
   (`{ kind: 'ai_summary', text }` → `{ kind: 'business_report', content }` →
   `sourceText(input)`). No structured series flows forward.
3. **Privacy boundary.** The desktop→cloud handoff deliberately restricts which
   numbers leave the user's computer (de-identified, bounded aggregates only —
   see Phase 47/50 in STATUS.md). Charts require **more** numeric data crossing
   that boundary, which is a security decision, not a mechanical one.

Because of (3), and because it cannot be verified without a live Google account,
this is implemented code-first and then verified on a real run — like the
bundled-LibreOffice work.

## Recommended architecture: native Google (no third-party, no image hosting)

Google Slides `createImage` needs a Google-fetchable HTTPS image URL and will
not take a base64/data URL. A privacy-preserving chart therefore stays entirely
inside the user's own Google account:

```
numeric series → Google Sheet (values) → Sheets addChart (embedded chart)
              → Slides createSheetsChart (embed that chart by id)
```

No external chart service (e.g. quickchart.io) — that would send customer data
off-account and violates the platform's no-external-URL / local-first posture.

## Implementation plan

### 1. Carry a bounded chart series through the pipeline

- Extend the summary/profile output with an optional, strictly-bounded
  `chartSeries`: e.g. `{ kind: 'bar' | 'pie' | 'line', title, categories: string[]
(≤12), values: number[] (≤12) }`. Categories must already satisfy the existing
  desktop→cloud de-identification rules (ordinal columns, capped labels, cohort
  size floors); **do not** relax those rules to obtain a chart.
- Thread `chartSeries` through `report.compose` into the input the
  `google_slides.create` node reads. Add it to the relevant Zod schemas
  (`cloud-workflow-output`, the agent cloud-step schema, and the envelope).

### 2. Add the two Google API methods (workspace.ts)

- `createDataSheet(accessToken, { title, categories, values })` → a hidden or
  temporary Google Sheet holding the series; returns `{ spreadsheetId }`.
- `addSheetChart(accessToken, spreadsheetId, spec)` via Sheets `batchUpdate`
  `addChart` (BASIC chart, type from series.kind) → returns `{ chartId }`.
- In `createProfessionalDeck`, when a slide carries a chart reference, emit a
  Slides `createSheetsChart` request:
  `{ createSheetsChart: { spreadsheetId, chartId, linkingMode: 'NOT_LINKED_IMAGE',
 elementProperties: { pageObjectId, size, transform }, objectId } }`.
  `NOT_LINKED_IMAGE` embeds a static image of the chart (no live link back to
  the sheet), which is the safest default.

### 3. Wire the slides builder

- In `buildProfessionalSlides`, when `chartSeries` is present, attach a
  `chart` marker to the most relevant content slide (e.g. the analysis slide)
  instead of / in addition to `imageUrl`.
- `SlidesCreateExecutor` passes the series to `createProfessionalDeck`, which
  creates the data sheet + chart once and references it from the slide.

### 4. Cleanup

- The temporary data Sheet should be created in the approved folder and either
  kept (auditable) or trashed after embedding, matching the existing
  temporary-Sheet lifecycle used by the legacy `.xls` reader.

## Testing strategy

- Unit: chart-series extraction, `buildProfessionalSlides` chart attachment, and
  the Sheets/Slides request builders (assert the exact batchUpdate JSON) with a
  mocked transport — the same pattern as the existing workspace tests.
- Gated real-Google acceptance (needs credentials): run the full Drive → summary
  → report → slides chain and confirm the deck opens with a rendered chart. Skip
  when Google credentials are absent, mirroring other gated acceptance tests.

## Status

Implemented at the code + unit-test level:

- `e6358d1` — native Google chart in `createProfessionalDeck` (Sheet →
  `addChart` → Slides `createSheetsChart`, `NOT_LINKED_IMAGE`), Sheets base URL,
  mocked-transport test.
- `df1a158` — `deriveChartSeries` aggregates a numeric column by a categorical
  column from the cloud Drive-Excel data (bounded to 12 categories); the
  `ai.summarize` and `report.compose` nodes carry the series forward and the
  slides node passes it to the deck. Uses only data the cloud node already
  holds, so the desktop→cloud privacy boundary is unchanged.

Remaining: a live-Google end-to-end acceptance run (real credentials) to
confirm the deck opens with a rendered chart — the same gated verification the
bundled-LibreOffice work needs. The chart currently ships only in the **cloud**
Drive-Excel flow, where full rows are available; the desktop path would need a
privacy-reviewed aggregate before it could chart.
