import type { ProfessionalDeckChart, ProfessionalSlide } from '@ai-workflow-studio/google-sheets';
import type { JsonValue } from '@ai-workflow-studio/workflow-schema';
import { z } from 'zod';

const GoogleResourceIdSchema = z
  .string()
  .min(8)
  .max(300)
  .regex(/^[A-Za-z0-9_-]+$/);

const MAX_CHART_CATEGORIES = 12;

/** A validated, ready-to-embed chart series carried between cloud nodes. */
export const ChartSeriesSchema = z
  .object({
    categories: z.array(z.string().trim().min(1).max(60)).min(2).max(MAX_CHART_CATEGORIES),
    kind: z.enum(['bar', 'column', 'line', 'pie']),
    title: z.string().trim().min(1).max(120),
    values: z.array(z.number().finite()).min(2).max(MAX_CHART_CATEGORIES),
  })
  .strict()
  .refine((value) => value.categories.length === value.values.length);

const TabularSchema = z.object({
  columns: z.array(z.string().min(1).max(200)).min(2).max(1_000),
  rows: z
    .array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])))
    .max(100_000),
});

/**
 * Derive a bounded chart series from tabular `{ columns, rows }` data by
 * summing the first numeric column grouped by the first categorical column.
 * Returns undefined when the data is not chartable. Operates only on data the
 * node already holds — it does not widen the desktop→cloud privacy boundary.
 */
export function deriveChartSeries(input: JsonValue): ProfessionalDeckChart | undefined {
  const existing = ChartSeriesSchema.safeParse((input as { chartSeries?: unknown })?.chartSeries);
  if (existing.success) return existing.data;

  const parsed = TabularSchema.safeParse(input);
  if (!parsed.success) return undefined;
  const { columns, rows } = parsed.data;
  if (rows.length === 0) return undefined;

  const isNumeric = (column: string): boolean => {
    let numbers = 0;
    for (const row of rows) if (typeof row[column] === 'number') numbers += 1;
    return numbers >= Math.max(2, Math.ceil(rows.length * 0.5));
  };
  const numericColumn = columns.find(isNumeric);
  if (numericColumn === undefined) return undefined;
  const categoryColumn = columns.find((column) => column !== numericColumn && !isNumeric(column));
  if (categoryColumn === undefined) return undefined;

  const totals = new Map<string, number>();
  for (const row of rows) {
    const value = row[numericColumn];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const label = String(row[categoryColumn] ?? '')
      .trim()
      .slice(0, 60);
    if (label.length === 0) continue;
    totals.set(label, (totals.get(label) ?? 0) + value);
  }
  const ranked = [...totals.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, MAX_CHART_CATEGORIES);
  if (ranked.length < 2) return undefined;

  return {
    categories: ranked.map(([label]) => label),
    kind: ranked.length <= 6 ? 'pie' : 'column',
    title: numericColumn.slice(0, 120),
    values: ranked.map(([, total]) => Math.round(total * 100) / 100),
  };
}

const MAX_BULLETS_PER_SLIDE = 6;
const MAX_BULLET_LENGTH = 180;
const MAX_SLIDE_TITLE_LENGTH = 90;

interface ParsedSection {
  readonly bullets: string[];
  readonly title: string;
}

/** Strip inline markdown, citation markers, and collapse whitespace. */
function cleanInline(text: string): string {
  return text
    .replace(/\*\*|__|`/g, '')
    .replace(/\[S\d+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function headingText(line: string): string | undefined {
  const hashHeading = /^#{1,6}\s+(.+?)\s*#*$/.exec(line);
  if (hashHeading?.[1] !== undefined) return cleanInline(hashHeading[1]);
  // A bold-only line (e.g. "**一、事實**") reads as a section heading.
  const boldHeading = /^\*\*(.+?)\*\*[:：]?$/.exec(line.trim());
  if (boldHeading?.[1] !== undefined) return cleanInline(boldHeading[1]);
  return undefined;
}

/** Parse a markdown summary/report into titled sections with bullet points. */
function parseSections(text: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  let current: ParsedSection | undefined;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0 || /^[-=_*]{3,}$/.test(line)) continue;
    const heading = headingText(line);
    if (heading !== undefined && heading.length > 0) {
      current = { bullets: [], title: heading.slice(0, MAX_SLIDE_TITLE_LENGTH) };
      sections.push(current);
      continue;
    }
    const bullet = cleanInline(
      line.replace(/^(?:[-*•]|\d+[.)、]|[一二三四五六七八九十]+[、.])\s*/, ''),
    );
    if (bullet.length < 4) continue;
    if (current === undefined) {
      current = { bullets: [], title: '' };
      sections.push(current);
    }
    if (current.bullets.length < MAX_BULLETS_PER_SLIDE * 2) {
      current.bullets.push(bullet.slice(0, MAX_BULLET_LENGTH));
    }
  }
  return sections.filter((section) => section.bullets.length > 0);
}

export function buildProfessionalSlides(
  text: string,
  input: {
    readonly includeImages: boolean;
    readonly includeReferences: boolean;
    readonly maxSlides: number;
    readonly title: string;
  },
  retrievedAt = new Date().toISOString().slice(0, 10),
): readonly ProfessionalSlide[] {
  const urls = [...new Set(text.match(/https:\/\/[^\s)\]]+/g) ?? [])].slice(0, 8);
  const imageUrl = urls.find((url) => /\.(?:jpe?g|png|webp)(?:\?|$)/i.test(url));
  const references =
    input.includeReferences && urls.length > 0
      ? urls.slice(0, 3).map((url, index) => ({
          label: `Reference ${index + 1}`,
          retrievedAt,
          url,
        }))
      : undefined;

  const sections = parseSections(text);
  const content: { readonly body: string[]; readonly title: string }[] = [];
  if (sections.length > 0) {
    const titledSections = sections.filter((section) => section.title.length > 0);
    // Title/agenda slide: list the section headings when the report is
    // structured, otherwise lead with the first points.
    content.push({
      body:
        titledSections.length >= 2
          ? titledSections.map((section) => section.title)
          : (sections[0]?.bullets ?? []).slice(0, MAX_BULLETS_PER_SLIDE),
      title: input.title,
    });
    // One slide per section, each capped to a readable bullet count.
    for (const section of sections) {
      content.push({
        body: section.bullets.slice(0, MAX_BULLETS_PER_SLIDE),
        title: section.title.length > 0 ? section.title : input.title,
      });
    }
  } else {
    // Unstructured text: fall back to bounded line chunking under one title.
    const lines = text
      .split('\n')
      .map((line) => cleanInline(line.replace(/^[-*•]\s*/, '')))
      .filter((line) => line.length >= 8);
    const chunkSize = Math.max(1, Math.ceil(lines.length / Math.max(1, input.maxSlides - 1)));
    content.push({ body: lines.slice(0, MAX_BULLETS_PER_SLIDE), title: input.title });
    for (let index = chunkSize; index < lines.length; index += chunkSize) {
      content.push({
        body: lines.slice(index, index + MAX_BULLETS_PER_SLIDE),
        title: input.title,
      });
    }
  }

  const bounded = content.slice(0, input.maxSlides);
  return bounded.map((slide, index) => ({
    body: slide.body.length > 0 ? slide.body : ['內容待補充與核准。'],
    ...(input.includeImages && index > 0 && imageUrl !== undefined ? { imageUrl } : {}),
    ...(references === undefined ? {} : { references }),
    title: slide.title.slice(0, MAX_SLIDE_TITLE_LENGTH),
  }));
}

export function appsScriptParentId(input: JsonValue): string | undefined {
  const parsed = z
    .object({
      kind: z.literal('google_slides_presentation'),
      presentationId: GoogleResourceIdSchema,
    })
    .passthrough()
    .safeParse(input);
  return parsed.success ? parsed.data.presentationId : undefined;
}
