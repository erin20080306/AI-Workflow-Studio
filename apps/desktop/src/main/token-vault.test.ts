import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { TokenVault, type SecureCipher } from './token-vault';

const temporaryDirectories: string[] = [];

const cipher: SecureCipher = {
  async decrypt(encrypted) {
    return {
      result: Buffer.from(encrypted.toString('utf8'), 'base64').toString('utf8'),
      shouldReEncrypt: false,
    };
  },
  async encrypt(plainText) {
    return Buffer.from(Buffer.from(plainText, 'utf8').toString('base64'), 'utf8');
  },
  async isAvailable() {
    return true;
  },
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('TokenVault', () => {
  it('persists an encrypted session without plaintext token material', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aiws-vault-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'session.enc');
    const vault = new TokenVault(path, cipher);
    const session = {
      agentBaseUrl: 'https://agent.example.invalid',
      deviceId: '10000000-0000-4000-8000-000000000801',
      deviceName: 'Finance Mac',
      deviceToken: `dvt_${'A'.repeat(43)}`,
      expiresAt: '2026-10-24T06:00:00.000Z',
      tenantId: '10000000-0000-4000-8000-000000000802',
    };

    await vault.save(session);
    const disk = await readFile(path, 'utf8');
    expect(disk).not.toContain(session.deviceToken);
    expect(disk).not.toContain(session.deviceName);
    await expect(vault.load()).resolves.toEqual(session);

    await vault.clear();
    await expect(vault.load()).resolves.toBeUndefined();
  });

  it('fails closed when operating-system encryption is unavailable', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aiws-vault-'));
    temporaryDirectories.push(directory);
    const vault = new TokenVault(join(directory, 'session.enc'), {
      ...cipher,
      async isAvailable() {
        return false;
      },
    });

    await expect(
      vault.save({
        agentBaseUrl: 'https://agent.example.invalid',
        deviceId: '10000000-0000-4000-8000-000000000801',
        deviceName: 'Finance Mac',
        deviceToken: `dvt_${'A'.repeat(43)}`,
        expiresAt: '2026-10-24T06:00:00.000Z',
        tenantId: '10000000-0000-4000-8000-000000000802',
      }),
    ).rejects.toThrow('secure storage is unavailable');
  });
});
