import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('./env', () => ({
  getEnvironment: () => ({ mockMode: true }),
}));

import {
  createAgentDriveTransferToken,
  verifyAgentDriveTransferToken,
} from './agent-drive-transfer-token';

const JOB_ID = '10000000-0000-4000-8000-000000005001';
const FILE_ID = '1WorkbookResource123456789';
const NODE_HASH = 'a'.repeat(64);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('agent Drive transfer tokens', () => {
  it('accepts only the signed file, job, node, and bounded lifetime', () => {
    vi.stubEnv('AGENT_TOKEN_PEPPER', 'agent-drive-transfer-test-pepper-at-least-thirty-two-bytes');
    const now = Date.now();
    const token = createAgentDriveTransferToken({
      expiresAt: now + 60_000,
      fileId: FILE_ID,
      jobId: JOB_ID,
      mimeType: 'xlsx',
      nodeIdHash: NODE_HASH,
      size: 1024,
    });

    expect(
      verifyAgentDriveTransferToken(
        token,
        { fileId: FILE_ID, jobId: JOB_ID, nodeIdHash: NODE_HASH },
        now,
      ),
    ).toMatchObject({ mimeType: 'xlsx', size: 1024 });
    expect(() =>
      verifyAgentDriveTransferToken(
        token,
        { fileId: `${FILE_ID}x`, jobId: JOB_ID, nodeIdHash: NODE_HASH },
        now,
      ),
    ).toThrowError(expect.objectContaining({ code: 'AGENT_FORBIDDEN' }));
    expect(() =>
      verifyAgentDriveTransferToken(
        token,
        { fileId: FILE_ID, jobId: JOB_ID, nodeIdHash: NODE_HASH },
        now + 60_001,
      ),
    ).toThrowError(expect.objectContaining({ code: 'AGENT_FORBIDDEN' }));
  });

  it('rejects tampered signatures and malformed signed payloads with safe protocol errors', () => {
    vi.stubEnv('AGENT_TOKEN_PEPPER', 'agent-drive-transfer-test-pepper-at-least-thirty-two-bytes');
    const now = Date.now();
    const token = createAgentDriveTransferToken({
      expiresAt: now + 60_000,
      fileId: FILE_ID,
      jobId: JOB_ID,
      mimeType: 'google_sheet',
      nodeIdHash: NODE_HASH,
    });
    const [payload, tokenSignature] = token.split('.');

    expect(() =>
      verifyAgentDriveTransferToken(
        `${payload}.${tokenSignature}x`,
        { fileId: FILE_ID, jobId: JOB_ID, nodeIdHash: NODE_HASH },
        now,
      ),
    ).toThrowError(expect.objectContaining({ code: 'AGENT_FORBIDDEN' }));
    expect(() =>
      verifyAgentDriveTransferToken(
        'not-a-token',
        { fileId: FILE_ID, jobId: JOB_ID, nodeIdHash: NODE_HASH },
        now,
      ),
    ).toThrowError(expect.objectContaining({ code: 'AGENT_REQUEST_INVALID' }));
  });
});
