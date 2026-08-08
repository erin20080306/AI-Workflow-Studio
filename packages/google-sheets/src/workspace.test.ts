import { describe, expect, it } from 'vitest';

import { GoogleWorkspaceClient } from './workspace';
import type { GoogleFetch } from './types';

const ACCESS_TOKEN = 'workspace-access-token-fixture';

function response(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  });
}

describe('GoogleWorkspaceClient', () => {
  it('reads bounded Gmail metadata and Google Forms responses with bearer credentials only', async () => {
    const calls: { readonly authorization: string | null; readonly url: string }[] = [];
    const fetchTransport: GoogleFetch = async (input, init) => {
      const url = String(input);
      calls.push({
        authorization: new Headers(init?.headers).get('authorization'),
        url,
      });
      if (url.includes('/messages?')) return response({ messages: [{ id: 'message_12345678' }] });
      if (url.includes('/messages/message_12345678')) {
        return response({
          id: 'message_12345678',
          labelIds: ['INBOX'],
          payload: {
            body: {
              data: Buffer.from('Order body with three line items', 'utf8').toString('base64url'),
            },
            headers: [
              { name: 'From', value: 'orders@example.com' },
              { name: 'To', value: 'team@example.com' },
              { name: 'Subject', value: 'Order summary' },
              { name: 'Date', value: 'Sat, 01 Aug 2026 08:00:00 +0800' },
            ],
            mimeType: 'text/plain',
          },
          snippet: 'Three new orders',
          threadId: 'thread_12345678',
        });
      }
      return response({
        responses: [
          {
            answers: { item: { textAnswers: { answers: [{ value: 'Notebook' }] } } },
            lastSubmittedTime: '2026-08-01T01:00:00.000Z',
            responseId: 'response_12345678',
          },
        ],
      });
    };
    const client = new GoogleWorkspaceClient({
      fetchTransport,
      formsBaseUrl: 'https://forms.example.test/v1',
      gmailBaseUrl: 'https://gmail.example.test/v1',
    });

    await expect(
      client.listMessagesSince(ACCESS_TOKEN, {
        after: '2026-08-01T00:00:00.000Z',
        before: '2026-08-02T00:00:00.000Z',
        includeBodies: true,
        maxMessages: 10,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        from: 'orders@example.com',
        body: 'Order body with three line items',
        subject: 'Order summary',
        threadId: 'thread_12345678',
      }),
    ]);
    await expect(
      client.listFormResponses(ACCESS_TOKEN, 'form_12345678', {
        maxResponses: 10,
        submittedSince: '2026-08-01T00:00:00.000Z',
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        responseId: 'response_12345678',
        submittedAt: '2026-08-01T01:00:00.000Z',
      }),
    ]);
    expect(calls.every((call) => call.authorization === `Bearer ${ACCESS_TOKEN}`)).toBe(true);
    expect(calls.every((call) => !call.url.includes(ACCESS_TOKEN))).toBe(true);
  });

  it('creates a draft by default and sends only through the explicit send endpoint', async () => {
    const calls: { readonly body: string; readonly url: string }[] = [];
    const client = new GoogleWorkspaceClient({
      fetchTransport: async (input, init) => {
        const url = String(input);
        calls.push({ body: String(init?.body ?? ''), url });
        return url.endsWith('/drafts')
          ? response({
              id: 'draft_12345678',
              message: { threadId: 'thread_12345678' },
            })
          : response({ id: 'message_12345678', threadId: 'thread_12345678' });
      },
      gmailBaseUrl: 'https://gmail.example.test/v1',
    });

    await expect(
      client.createEmailDraft(ACCESS_TOKEN, {
        html: '<p>Approved report</p>',
        subject: 'Daily report',
        to: 'owner@example.com',
      }),
    ).resolves.toEqual({ id: 'draft_12345678', threadId: 'thread_12345678' });
    await expect(
      client.sendEmail(ACCESS_TOKEN, {
        html: '<p>Approved report</p>',
        subject: 'Daily report',
        to: 'owner@example.com',
      }),
    ).resolves.toEqual({ id: 'message_12345678', threadId: 'thread_12345678' });
    expect(calls.map((call) => call.url)).toEqual([
      'https://gmail.example.test/v1/users/me/drafts',
      'https://gmail.example.test/v1/users/me/messages/send',
    ]);
    expect(calls[0]?.body).not.toContain('Approved report');
  });

  it('builds professional slides and deploys only an allowlisted Apps Script template', async () => {
    const calls: { readonly body: string; readonly method: string; readonly url: string }[] = [];
    const fetchTransport: GoogleFetch = async (input, init) => {
      const url = String(input);
      calls.push({ body: String(init?.body ?? ''), method: String(init?.method), url });
      if (url.endsWith('/presentations'))
        return response({ presentationId: 'presentation_12345678' });
      if (url.endsWith('/projects')) return response({ scriptId: 'script_12345678' });
      if (url.endsWith('/versions')) return response({ versionNumber: 1 });
      if (url.endsWith('/deployments')) return response({ deploymentId: 'deployment_12345678' });
      return response({});
    };
    const client = new GoogleWorkspaceClient({
      appsScriptBaseUrl: 'https://script.example.test/v1',
      fetchTransport,
      slidesBaseUrl: 'https://slides.example.test/v1',
    });

    await expect(
      client.createProfessionalDeck(ACCESS_TOKEN, {
        locale: 'zh-Hant',
        slides: [
          { body: ['營運摘要'], title: '摘要' },
          { body: ['訂單增加'], title: '發現' },
          {
            body: ['優先處理高價值訂單'],
            references: [
              {
                label: 'Source',
                retrievedAt: '2026-08-01',
                url: 'https://example.com/report',
              },
            ],
            title: '建議',
          },
        ],
        title: '專業營運簡報',
      }),
    ).resolves.toEqual({ presentationId: 'presentation_12345678' });
    await expect(
      client.deploySafeAppsScript(ACCESS_TOKEN, {
        deployment: 'api_executable',
        template: 'sheet-cost-summary',
        title: 'Approved cost summary',
      }),
    ).resolves.toMatchObject({
      deploymentId: 'deployment_12345678',
      scriptId: 'script_12345678',
      versionNumber: 1,
    });
    const slideBatch = calls.find((call) => call.url.includes(':batchUpdate'));
    expect(slideBatch?.body).toContain('營運摘要');
    const scriptContent = calls.find((call) => call.url.endsWith('/content'));
    expect(scriptContent?.body).toContain('refreshApprovedCostSummary');
    expect(scriptContent?.body).not.toContain('eval(');
    const contentPayload = JSON.parse(scriptContent?.body ?? '{}') as {
      readonly files?: readonly { readonly name?: unknown; readonly source?: unknown }[];
    };
    const manifestSource = contentPayload.files?.find((file) => file.name === 'appsscript')?.source;
    expect(typeof manifestSource).toBe('string');
    const manifest = JSON.parse(
      typeof manifestSource === 'string' ? manifestSource : '{}',
    ) as unknown;
    expect(manifest).toMatchObject({ executionApi: { access: 'MYSELF' } });
    expect(JSON.stringify(manifest)).not.toContain('ANYONE');
    expect(JSON.stringify(manifest)).not.toContain('webapp');
    expect(calls.every((call) => call.method === 'POST' || call.method === 'PUT')).toBe(true);
  });

  it('rejects an unsupported web app deployment before creating a script project', async () => {
    let requests = 0;
    const client = new GoogleWorkspaceClient({
      appsScriptBaseUrl: 'https://script.example.test/v1',
      fetchTransport: async () => {
        requests += 1;
        return response({});
      },
    });
    const unsupported = {
      deployment: 'web_app',
      template: 'sheet-cost-summary',
      title: 'Unsupported public deployment',
    } as unknown as Parameters<GoogleWorkspaceClient['deploySafeAppsScript']>[1];

    await expect(client.deploySafeAppsScript(ACCESS_TOKEN, unsupported)).rejects.toThrow();
    expect(requests).toBe(0);
  });
});
