import { z } from 'zod';

import { GoogleSheetsError } from './errors';
import type { GoogleFetch } from './types';

const GoogleIdSchema = z
  .string()
  .min(8)
  .max(300)
  .regex(/^[A-Za-z0-9_-]+$/);
const HttpsUrlSchema = z
  .url()
  .max(2_000)
  .refine((value) => new URL(value).protocol === 'https:', 'Reference URLs must use HTTPS.');
const HeaderSchema = z.object({ name: z.string().max(200), value: z.string().max(10_000) });
const MessagePayloadSchema = z
  .object({
    body: z
      .object({ data: z.string().max(7_000_000).optional() })
      .passthrough()
      .optional(),
    headers: z.array(HeaderSchema).max(200).default([]),
    mimeType: z.string().max(200).optional(),
    parts: z.array(z.unknown()).max(100).optional(),
  })
  .passthrough();
const MessageSchema = z
  .object({
    id: GoogleIdSchema,
    labelIds: z.array(z.string().max(100)).max(100).default([]),
    payload: MessagePayloadSchema.default({ headers: [] }),
    snippet: z.string().max(20_000).default(''),
    threadId: GoogleIdSchema,
  })
  .passthrough();
const MessageListSchema = z
  .object({
    messages: z
      .array(z.object({ id: GoogleIdSchema }))
      .max(100)
      .default([]),
  })
  .passthrough();
const FormResponsesSchema = z
  .object({
    responses: z
      .array(
        z
          .object({
            answers: z.record(z.string(), z.unknown()).default({}),
            createTime: z.iso.datetime({ offset: true }).optional(),
            lastSubmittedTime: z.iso.datetime({ offset: true }).optional(),
            responseId: GoogleIdSchema,
          })
          .passthrough(),
      )
      .max(500)
      .default([]),
  })
  .passthrough();
const PresentationSchema = z.object({ presentationId: GoogleIdSchema }).passthrough();
const ScriptProjectSchema = z.object({ scriptId: GoogleIdSchema }).passthrough();
const ScriptVersionSchema = z.object({ versionNumber: z.number().int().positive() }).passthrough();
const DeploymentSchema = z.object({ deploymentId: GoogleIdSchema }).passthrough();
const GmailSendSchema = z.object({ id: GoogleIdSchema, threadId: GoogleIdSchema }).passthrough();
const GmailDraftSchema = z
  .object({
    id: GoogleIdSchema,
    message: z.object({ threadId: GoogleIdSchema }).passthrough(),
  })
  .passthrough();

const MAX_RESPONSE_BYTES = 5_000_000;
const MAX_REQUEST_BYTES = 2_000_000;

export interface GoogleWorkspaceClientOptions {
  readonly appsScriptBaseUrl?: string;
  readonly driveBaseUrl?: string;
  readonly fetchTransport?: GoogleFetch;
  readonly formsBaseUrl?: string;
  readonly gmailBaseUrl?: string;
  readonly sheetsBaseUrl?: string;
  readonly slidesBaseUrl?: string;
}

export interface GmailMessageSummary {
  readonly body?: string;
  readonly from: string;
  readonly id: string;
  readonly labels: readonly string[];
  readonly receivedAt: string;
  readonly snippet: string;
  readonly subject: string;
  readonly threadId: string;
  readonly to: string;
}

export interface GoogleFormResponse {
  readonly answers: Readonly<Record<string, unknown>>;
  readonly responseId: string;
  readonly submittedAt?: string;
}

export interface ProfessionalSlide {
  readonly body: readonly string[];
  readonly imageUrl?: string;
  readonly references?: readonly {
    readonly label: string;
    readonly retrievedAt: string;
    readonly url: string;
  }[];
  readonly title: string;
}

export interface ProfessionalDeckChart {
  readonly categories: readonly string[];
  readonly kind: 'bar' | 'column' | 'line' | 'pie';
  readonly title: string;
  readonly values: readonly number[];
}

export interface ProfessionalDeckInput {
  readonly chart?: ProfessionalDeckChart;
  readonly folderId?: string;
  readonly locale: 'en' | 'zh-Hant';
  readonly slides: readonly ProfessionalSlide[];
  readonly title: string;
}

export type SafeAppsScriptTemplate =
  'email-order-summary' | 'sheet-cost-summary' | 'slides-executive-report';
export type SafeAppsScriptDeployment = 'api_executable';

function baseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:') {
    throw new GoogleSheetsError('GOOGLE_NOT_CONFIGURED', 'Google API base URLs must use HTTPS.');
  }
  return url.toString().replace(/\/$/, '');
}

function header(headers: readonly z.infer<typeof HeaderSchema>[], name: string): string {
  return (
    headers.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase())?.value ?? ''
  );
}

function safeReceivedAt(value: string): string {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : '';
}

function plainTextParts(payload: unknown, remaining = 20_000): string[] {
  if (remaining <= 0) return [];
  const parsed = MessagePayloadSchema.safeParse(payload);
  if (!parsed.success) return [];
  const parts: string[] = [];
  const data = parsed.data.body?.data;
  if (data !== undefined && parsed.data.mimeType === 'text/plain') {
    try {
      parts.push(Buffer.from(data, 'base64url').toString('utf8').slice(0, remaining));
    } catch {
      return [];
    }
  }
  for (const child of parsed.data.parts ?? []) {
    const consumed = parts.reduce((sum, part) => sum + part.length, 0);
    if (consumed >= remaining) break;
    parts.push(...plainTextParts(child, remaining - consumed));
  }
  return parts;
}

function rawEmail(input: {
  readonly html: string;
  readonly subject: string;
  readonly to: string;
}): string {
  const message = [
    `To: ${input.to}`,
    `Subject: =?UTF-8?B?${Buffer.from(input.subject, 'utf8').toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    input.html,
  ].join('\r\n');
  return Buffer.from(message, 'utf8').toString('base64url');
}

function safeScriptTemplate(
  template: SafeAppsScriptTemplate,
  deployment: SafeAppsScriptDeployment,
): {
  readonly files: readonly {
    readonly name: string;
    readonly source: string;
    readonly type: string;
  }[];
  readonly requiredScopes: readonly string[];
} {
  const commonManifest = (scopes: readonly string[]) =>
    JSON.stringify(
      {
        ...(deployment === 'api_executable' ? { executionApi: { access: 'MYSELF' } } : {}),
        exceptionLogging: 'STACKDRIVER',
        oauthScopes: scopes,
        runtimeVersion: 'V8',
        timeZone: 'Asia/Taipei',
      },
      null,
      2,
    );
  const templates = {
    'email-order-summary': {
      source: `function buildApprovedOrderSummary() {\n  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();\n  const values = sheet.getDataRange().getDisplayValues();\n  return { rowCount: Math.max(0, values.length - 1), headers: values[0] || [] };\n}\n`,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.currentonly'],
    },
    'sheet-cost-summary': {
      source: `function refreshApprovedCostSummary() {\n  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();\n  const source = spreadsheet.getSheets()[0];\n  const values = source.getDataRange().getValues();\n  return { sourceSheet: source.getName(), rowCount: Math.max(0, values.length - 1) };\n}\n`,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.currentonly'],
    },
    'slides-executive-report': {
      source: `function inspectApprovedPresentation() {\n  const presentation = SlidesApp.getActivePresentation();\n  return { title: presentation.getName(), slideCount: presentation.getSlides().length };\n}\n`,
      scopes: ['https://www.googleapis.com/auth/presentations.currentonly'],
    },
  } as const;
  const selected = templates[template];
  return {
    files: [
      { name: 'Code', source: selected.source, type: 'SERVER_JS' },
      { name: 'appsscript', source: commonManifest(selected.scopes), type: 'JSON' },
    ],
    requiredScopes: selected.scopes,
  };
}

export class GoogleWorkspaceClient {
  private readonly appsScriptBaseUrl: string;
  private readonly driveBaseUrl: string;
  private readonly fetchTransport: GoogleFetch;
  private readonly formsBaseUrl: string;
  private readonly gmailBaseUrl: string;
  private readonly sheetsBaseUrl: string;
  private readonly slidesBaseUrl: string;

  constructor(options: GoogleWorkspaceClientOptions = {}) {
    this.appsScriptBaseUrl = baseUrl(
      options.appsScriptBaseUrl ?? 'https://script.googleapis.com/v1',
    );
    this.driveBaseUrl = baseUrl(options.driveBaseUrl ?? 'https://www.googleapis.com/drive/v3');
    this.fetchTransport = options.fetchTransport ?? fetch;
    this.formsBaseUrl = baseUrl(options.formsBaseUrl ?? 'https://forms.googleapis.com/v1');
    this.gmailBaseUrl = baseUrl(options.gmailBaseUrl ?? 'https://gmail.googleapis.com/gmail/v1');
    this.sheetsBaseUrl = baseUrl(options.sheetsBaseUrl ?? 'https://sheets.googleapis.com/v4');
    this.slidesBaseUrl = baseUrl(options.slidesBaseUrl ?? 'https://slides.googleapis.com/v1');
  }

  async listMessagesSince(
    accessToken: string,
    input: {
      readonly after: string;
      readonly before: string;
      readonly includeBodies?: boolean;
      readonly maxMessages?: number;
      readonly query?: string;
    },
    signal?: AbortSignal,
  ): Promise<readonly GmailMessageSummary[]> {
    const after = z.iso.datetime({ offset: true }).parse(input.after);
    const before = z.iso.datetime({ offset: true }).parse(input.before);
    if (new Date(after).getTime() >= new Date(before).getTime()) {
      throw new GoogleSheetsError('GOOGLE_REQUEST_INVALID', 'Gmail time range is invalid.');
    }
    const maxMessages = z.number().int().min(1).max(100).default(50).parse(input.maxMessages);
    const extra = z.string().trim().max(500).default('').parse(input.query);
    const query = [
      `after:${Math.floor(new Date(after).getTime() / 1_000)}`,
      `before:${Math.floor(new Date(before).getTime() / 1_000)}`,
      extra,
    ]
      .filter(Boolean)
      .join(' ');
    const list = await this.request({
      accessToken,
      method: 'GET',
      schema: MessageListSchema,
      ...(signal === undefined ? {} : { signal }),
      url: `${this.gmailBaseUrl}/users/me/messages?${new URLSearchParams({
        maxResults: String(maxMessages),
        q: query,
      })}`,
    });
    const messages: GmailMessageSummary[] = [];
    for (const item of list.messages.slice(0, maxMessages)) {
      const params = new URLSearchParams({
        format: input.includeBodies === true ? 'full' : 'metadata',
      });
      if (input.includeBodies !== true) {
        for (const name of ['From', 'To', 'Subject', 'Date'])
          params.append('metadataHeaders', name);
      }
      const message = await this.request({
        accessToken,
        method: 'GET',
        schema: MessageSchema,
        ...(signal === undefined ? {} : { signal }),
        url: `${this.gmailBaseUrl}/users/me/messages/${encodeURIComponent(item.id)}?${params}`,
      });
      const body = input.includeBodies === true ? plainTextParts(message.payload).join('\n') : '';
      messages.push({
        ...(body === '' ? {} : { body }),
        from: header(message.payload.headers, 'From').slice(0, 1_000),
        id: message.id,
        labels: message.labelIds,
        receivedAt: safeReceivedAt(header(message.payload.headers, 'Date')),
        snippet: message.snippet,
        subject: header(message.payload.headers, 'Subject').slice(0, 2_000),
        threadId: message.threadId,
        to: header(message.payload.headers, 'To').slice(0, 1_000),
      });
    }
    return messages;
  }

  async listFormResponses(
    accessToken: string,
    formIdInput: string,
    input: { readonly maxResponses?: number; readonly submittedSince?: string } = {},
    signal?: AbortSignal,
  ): Promise<readonly GoogleFormResponse[]> {
    const formId = GoogleIdSchema.parse(formIdInput);
    const maxResponses = z.number().int().min(1).max(500).default(200).parse(input.maxResponses);
    const params = new URLSearchParams({ pageSize: String(Math.min(maxResponses, 5_000)) });
    if (input.submittedSince !== undefined) {
      const submittedSince = z.iso.datetime({ offset: true }).parse(input.submittedSince);
      params.set('filter', `timestamp >= ${submittedSince}`);
    }
    const response = await this.request({
      accessToken,
      method: 'GET',
      schema: FormResponsesSchema,
      ...(signal === undefined ? {} : { signal }),
      url: `${this.formsBaseUrl}/forms/${encodeURIComponent(formId)}/responses?${params}`,
    });
    return response.responses.slice(0, maxResponses).map((item) => {
      const submittedAt = item.lastSubmittedTime ?? item.createTime;
      return {
        answers: item.answers,
        responseId: item.responseId,
        ...(submittedAt === undefined ? {} : { submittedAt }),
      };
    });
  }

  async sendEmail(
    accessToken: string,
    input: { readonly html: string; readonly subject: string; readonly to: string },
    signal?: AbortSignal,
  ): Promise<{ readonly id: string; readonly threadId: string }> {
    const parsed = z
      .object({
        html: z.string().min(1).max(200_000),
        subject: z.string().trim().min(1).max(200),
        to: z.email().max(320),
      })
      .strict()
      .parse(input);
    return await this.request({
      accessToken,
      body: { raw: rawEmail(parsed) },
      method: 'POST',
      schema: GmailSendSchema,
      ...(signal === undefined ? {} : { signal }),
      url: `${this.gmailBaseUrl}/users/me/messages/send`,
    });
  }

  async createEmailDraft(
    accessToken: string,
    input: { readonly html: string; readonly subject: string; readonly to: string },
    signal?: AbortSignal,
  ): Promise<{ readonly id: string; readonly threadId: string }> {
    const parsed = z
      .object({
        html: z.string().min(1).max(200_000),
        subject: z.string().trim().min(1).max(200),
        to: z.email().max(320),
      })
      .strict()
      .parse(input);
    const draft = await this.request({
      accessToken,
      body: { message: { raw: rawEmail(parsed) } },
      method: 'POST',
      schema: GmailDraftSchema,
      ...(signal === undefined ? {} : { signal }),
      url: `${this.gmailBaseUrl}/users/me/drafts`,
    });
    return { id: draft.id, threadId: draft.message.threadId };
  }

  /**
   * Build a chart entirely inside the user's own Google account: write the
   * series into a new Sheet, add a chart to it, and return the ids so a deck
   * can embed a static image of that chart. No third-party service and no
   * external image hosting are involved.
   */
  private async createDataChart(
    accessToken: string,
    chart: ProfessionalDeckChart,
    signal: AbortSignal | undefined,
  ): Promise<{ readonly chartId: number; readonly spreadsheetId: string }> {
    const rowData = [
      {
        values: [
          { userEnteredValue: { stringValue: 'Category' } },
          { userEnteredValue: { stringValue: chart.title } },
        ],
      },
      ...chart.categories.map((category, index) => ({
        values: [
          { userEnteredValue: { stringValue: category } },
          { userEnteredValue: { numberValue: chart.values[index] ?? 0 } },
        ],
      })),
    ];
    const spreadsheet = await this.request({
      accessToken,
      body: {
        properties: { title: `AIWS chart — ${chart.title}`.slice(0, 100) },
        sheets: [
          {
            data: [{ rowData, startColumnIndex: 0, startRowIndex: 0 }],
            properties: { sheetId: 0, title: 'Data' },
          },
        ],
      },
      method: 'POST',
      schema: z.object({ spreadsheetId: GoogleIdSchema }).passthrough(),
      ...(signal === undefined ? {} : { signal }),
      url: `${this.sheetsBaseUrl}/spreadsheets`,
    });
    const endRowIndex = chart.categories.length + 1;
    const domainRange = {
      sources: [
        { endColumnIndex: 1, endRowIndex, sheetId: 0, startColumnIndex: 0, startRowIndex: 1 },
      ],
    };
    const seriesRange = {
      sources: [
        { endColumnIndex: 2, endRowIndex, sheetId: 0, startColumnIndex: 1, startRowIndex: 1 },
      ],
    };
    const spec =
      chart.kind === 'pie'
        ? {
            pieChart: {
              domain: { sourceRange: domainRange },
              legendPosition: 'RIGHT_LEGEND',
              series: { sourceRange: seriesRange },
            },
            title: chart.title,
          }
        : {
            basicChart: {
              chartType: chart.kind === 'bar' ? 'BAR' : chart.kind === 'line' ? 'LINE' : 'COLUMN',
              domains: [{ domain: { sourceRange: domainRange } }],
              headerCount: 0,
              legendPosition: 'BOTTOM_LEGEND',
              series: [{ series: { sourceRange: seriesRange }, targetAxis: 'LEFT_AXIS' }],
            },
            title: chart.title,
          };
    const reply = await this.request({
      accessToken,
      body: {
        requests: [
          {
            addChart: {
              chart: {
                position: {
                  overlayPosition: {
                    anchorCell: { columnIndex: 3, rowIndex: 0, sheetId: 0 },
                  },
                },
                spec,
              },
            },
          },
        ],
      },
      method: 'POST',
      schema: z.object({
        replies: z
          .array(
            z.object({
              addChart: z.object({ chart: z.object({ chartId: z.number().int() }) }).optional(),
            }),
          )
          .default([]),
      }),
      ...(signal === undefined ? {} : { signal }),
      url: `${this.sheetsBaseUrl}/spreadsheets/${encodeURIComponent(spreadsheet.spreadsheetId)}:batchUpdate`,
    });
    const chartId = reply.replies[0]?.addChart?.chart.chartId;
    if (chartId === undefined) {
      throw new GoogleSheetsError('GOOGLE_REQUEST_INVALID', 'The data chart was not created.');
    }
    return { chartId, spreadsheetId: spreadsheet.spreadsheetId };
  }

  async createProfessionalDeck(
    accessToken: string,
    inputValue: ProfessionalDeckInput,
    signal?: AbortSignal,
  ): Promise<{ readonly presentationId: string }> {
    const input = z
      .object({
        chart: z
          .object({
            categories: z.array(z.string().trim().min(1).max(60)).min(2).max(12),
            kind: z.enum(['bar', 'column', 'line', 'pie']),
            title: z.string().trim().min(1).max(120),
            values: z.array(z.number().finite()).min(2).max(12),
          })
          .strict()
          .refine((value) => value.categories.length === value.values.length, {
            message: 'Chart categories and values must have the same length.',
          })
          .optional(),
        folderId: GoogleIdSchema.optional(),
        locale: z.enum(['en', 'zh-Hant']),
        slides: z
          .array(
            z
              .object({
                body: z.array(z.string().trim().min(1).max(600)).min(1).max(8),
                imageUrl: HttpsUrlSchema.optional(),
                references: z
                  .array(
                    z
                      .object({
                        label: z.string().trim().min(1).max(160),
                        retrievedAt: z.iso.date(),
                        url: HttpsUrlSchema,
                      })
                      .strict(),
                  )
                  .max(8)
                  .optional(),
                title: z.string().trim().min(1).max(180),
              })
              .strict(),
          )
          .min(3)
          .max(30),
        title: z.string().trim().min(1).max(200),
      })
      .strict()
      .parse(inputValue);
    const created = await this.request({
      accessToken,
      body: { title: input.title },
      method: 'POST',
      schema: PresentationSchema,
      ...(signal === undefined ? {} : { signal }),
      url: `${this.slidesBaseUrl}/presentations`,
    });
    if (input.folderId !== undefined) {
      await this.request({
        accessToken,
        body: {},
        method: 'PATCH',
        schema: z.object({}).passthrough(),
        ...(signal === undefined ? {} : { signal }),
        url: `${this.driveBaseUrl}/files/${encodeURIComponent(
          created.presentationId,
        )}?${new URLSearchParams({
          addParents: input.folderId,
          fields: 'id,parents',
          supportsAllDrives: 'true',
        })}`,
      });
    }
    const chartEmbed =
      input.chart === undefined
        ? undefined
        : await this.createDataChart(accessToken, input.chart, signal);
    const requests: Record<string, unknown>[] = input.slides.flatMap((slide, index) => {
      const slideId = `slide_${String(index + 1).padStart(2, '0')}`;
      const titleId = `${slideId}_title`;
      const bodyId = `${slideId}_body`;
      const referenceText = (slide.references ?? [])
        .map((reference) => `${reference.label} — ${reference.url} (${reference.retrievedAt})`)
        .join('\n');
      const bodyText = [...slide.body.map((line) => `• ${line}`), referenceText]
        .filter(Boolean)
        .join('\n');
      return [
        { createSlide: { objectId: slideId, slideLayoutReference: { predefinedLayout: 'BLANK' } } },
        {
          createShape: {
            elementProperties: {
              pageObjectId: slideId,
              size: {
                height: { magnitude: 56, unit: 'PT' },
                width: { magnitude: 640, unit: 'PT' },
              },
              transform: { scaleX: 1, scaleY: 1, translateX: 36, translateY: 24, unit: 'PT' },
            },
            objectId: titleId,
            shapeType: 'TEXT_BOX',
          },
        },
        { insertText: { objectId: titleId, text: slide.title } },
        {
          updateTextStyle: {
            fields: 'bold,fontFamily,fontSize,foregroundColor',
            objectId: titleId,
            style: {
              bold: true,
              fontFamily: 'Arial',
              fontSize: { magnitude: 25, unit: 'PT' },
              foregroundColor: { opaqueColor: { rgbColor: { blue: 0.18, green: 0.1, red: 0.04 } } },
            },
            textRange: { type: 'ALL' },
          },
        },
        {
          createShape: {
            elementProperties: {
              pageObjectId: slideId,
              size: {
                height: { magnitude: 320, unit: 'PT' },
                width: { magnitude: slide.imageUrl === undefined ? 640 : 390, unit: 'PT' },
              },
              transform: { scaleX: 1, scaleY: 1, translateX: 40, translateY: 95, unit: 'PT' },
            },
            objectId: bodyId,
            shapeType: 'TEXT_BOX',
          },
        },
        { insertText: { objectId: bodyId, text: bodyText } },
        ...(slide.imageUrl === undefined
          ? []
          : [
              {
                createImage: {
                  elementProperties: {
                    pageObjectId: slideId,
                    size: {
                      height: { magnitude: 220, unit: 'PT' },
                      width: { magnitude: 230, unit: 'PT' },
                    },
                    transform: {
                      scaleX: 1,
                      scaleY: 1,
                      translateX: 445,
                      translateY: 120,
                      unit: 'PT',
                    },
                  },
                  objectId: `${slideId}_image`,
                  url: slide.imageUrl,
                },
              },
            ]),
      ];
    });
    if (chartEmbed !== undefined && input.chart !== undefined) {
      const chartSlideId = 'slide_chart';
      const chartTitleId = `${chartSlideId}_title`;
      requests.push(
        {
          createSlide: {
            objectId: chartSlideId,
            slideLayoutReference: { predefinedLayout: 'BLANK' },
          },
        },
        {
          createShape: {
            elementProperties: {
              pageObjectId: chartSlideId,
              size: {
                height: { magnitude: 56, unit: 'PT' },
                width: { magnitude: 640, unit: 'PT' },
              },
              transform: { scaleX: 1, scaleY: 1, translateX: 36, translateY: 24, unit: 'PT' },
            },
            objectId: chartTitleId,
            shapeType: 'TEXT_BOX',
          },
        },
        { insertText: { objectId: chartTitleId, text: input.chart.title } },
        {
          createSheetsChart: {
            chartId: chartEmbed.chartId,
            elementProperties: {
              pageObjectId: chartSlideId,
              size: {
                height: { magnitude: 300, unit: 'PT' },
                width: { magnitude: 640, unit: 'PT' },
              },
              transform: { scaleX: 1, scaleY: 1, translateX: 36, translateY: 96, unit: 'PT' },
            },
            linkingMode: 'NOT_LINKED_IMAGE',
            objectId: `${chartSlideId}_chart`,
            spreadsheetId: chartEmbed.spreadsheetId,
          },
        },
      );
    }
    await this.request({
      accessToken,
      body: { requests },
      method: 'POST',
      schema: z.object({}).passthrough(),
      ...(signal === undefined ? {} : { signal }),
      url: `${this.slidesBaseUrl}/presentations/${encodeURIComponent(created.presentationId)}:batchUpdate`,
    });
    return { presentationId: created.presentationId };
  }

  async deploySafeAppsScript(
    accessToken: string,
    input: {
      readonly deployment: SafeAppsScriptDeployment;
      readonly parentId?: string;
      readonly template: SafeAppsScriptTemplate;
      readonly title: string;
    },
    signal?: AbortSignal,
  ): Promise<{
    readonly deploymentId: string;
    readonly requiredScopes: readonly string[];
    readonly scriptId: string;
    readonly versionNumber: number;
  }> {
    const parsed = z
      .object({
        deployment: z.literal('api_executable'),
        parentId: GoogleIdSchema.optional(),
        template: z.enum(['email-order-summary', 'sheet-cost-summary', 'slides-executive-report']),
        title: z.string().trim().min(1).max(200),
      })
      .strict()
      .parse(input);
    const template = safeScriptTemplate(parsed.template, parsed.deployment);
    const project = await this.request({
      accessToken,
      body: {
        ...(parsed.parentId === undefined ? {} : { parentId: parsed.parentId }),
        title: parsed.title,
      },
      method: 'POST',
      schema: ScriptProjectSchema,
      ...(signal === undefined ? {} : { signal }),
      url: `${this.appsScriptBaseUrl}/projects`,
    });
    await this.request({
      accessToken,
      body: { files: template.files },
      method: 'PUT',
      schema: z.object({}).passthrough(),
      ...(signal === undefined ? {} : { signal }),
      url: `${this.appsScriptBaseUrl}/projects/${encodeURIComponent(project.scriptId)}/content`,
    });
    const version = await this.request({
      accessToken,
      body: { description: `AI Workflow Studio approved template: ${parsed.template}` },
      method: 'POST',
      schema: ScriptVersionSchema,
      ...(signal === undefined ? {} : { signal }),
      url: `${this.appsScriptBaseUrl}/projects/${encodeURIComponent(project.scriptId)}/versions`,
    });
    const deployment = await this.request({
      accessToken,
      body: {
        description: `AI Workflow Studio approved template: ${parsed.template}`,
        manifestFileName: 'appsscript',
        versionNumber: version.versionNumber,
      },
      method: 'POST',
      schema: DeploymentSchema,
      ...(signal === undefined ? {} : { signal }),
      url: `${this.appsScriptBaseUrl}/projects/${encodeURIComponent(project.scriptId)}/deployments`,
    });
    return {
      deploymentId: deployment.deploymentId,
      requiredScopes: template.requiredScopes,
      scriptId: project.scriptId,
      versionNumber: version.versionNumber,
    };
  }

  private async request<T>(input: {
    readonly accessToken: string;
    readonly body?: unknown;
    readonly method: 'GET' | 'PATCH' | 'POST' | 'PUT';
    readonly schema: z.ZodType<T>;
    readonly signal?: AbortSignal;
    readonly url: string;
  }): Promise<T> {
    const body = input.body === undefined ? undefined : JSON.stringify(input.body);
    if (body !== undefined && new TextEncoder().encode(body).byteLength > MAX_REQUEST_BYTES) {
      throw new GoogleSheetsError('GOOGLE_REQUEST_INVALID', 'Google request exceeds size limits.');
    }
    let response: Response;
    try {
      response = await this.fetchTransport(input.url, {
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${input.accessToken}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        method: input.method,
        ...(body === undefined ? {} : { body }),
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      });
    } catch (error) {
      throw new GoogleSheetsError(
        'GOOGLE_REQUEST_FAILED',
        'Google Workspace could not be reached.',
        {
          cause: error,
          retryable: true,
        },
      );
    }
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
      throw new GoogleSheetsError(
        'GOOGLE_RESPONSE_INVALID',
        'Google response exceeds size limits.',
      );
    }
    if (!response.ok) {
      throw new GoogleSheetsError(
        response.status === 429 ? 'GOOGLE_RATE_LIMITED' : 'GOOGLE_REQUEST_FAILED',
        'Google Workspace rejected the request.',
        { retryable: response.status === 429 || response.status >= 500 },
      );
    }
    let json: unknown;
    try {
      json = text === '' ? {} : JSON.parse(text);
    } catch (error) {
      throw new GoogleSheetsError('GOOGLE_RESPONSE_INVALID', 'Google returned invalid JSON.', {
        cause: error,
      });
    }
    const parsed = input.schema.safeParse(json);
    if (!parsed.success) {
      throw new GoogleSheetsError(
        'GOOGLE_RESPONSE_INVALID',
        'Google returned an invalid response.',
      );
    }
    return parsed.data;
  }
}
