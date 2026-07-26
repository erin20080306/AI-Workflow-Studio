import { z } from 'zod';

import { readPrivateFile, removePrivateFile, writePrivateFile } from './private-files';

const PairingSessionSchema = z
  .object({
    agentBaseUrl: z.string().url(),
    deviceId: z.string().uuid(),
    deviceName: z.string().min(1).max(120),
    deviceToken: z.string().regex(/^dvt_[A-Za-z0-9_-]{40,60}$/),
    expiresAt: z.iso.datetime({ offset: true }),
    tenantId: z.string().uuid(),
  })
  .strict();

export type PairingSession = z.infer<typeof PairingSessionSchema>;

export interface SecureCipher {
  decrypt(encrypted: Buffer): Promise<{
    readonly result: string;
    readonly shouldReEncrypt: boolean;
  }>;
  encrypt(plainText: string): Promise<Buffer>;
  isAvailable(): Promise<boolean>;
}

export class TokenVault {
  constructor(
    private readonly filePath: string,
    private readonly cipher: SecureCipher,
  ) {}

  async clear(): Promise<void> {
    await removePrivateFile(this.filePath);
  }

  async load(): Promise<PairingSession | undefined> {
    const encoded = await readPrivateFile(this.filePath);
    if (encoded === undefined) {
      return undefined;
    }
    if (!(await this.cipher.isAvailable())) {
      throw new Error('Operating-system secure storage is unavailable.');
    }
    const encrypted = Buffer.from(encoded, 'base64');
    const decrypted = await this.cipher.decrypt(encrypted);
    const parsed = PairingSessionSchema.parse(JSON.parse(decrypted.result) as unknown);
    if (decrypted.shouldReEncrypt) {
      await this.save(parsed);
    }
    return parsed;
  }

  async save(input: PairingSession): Promise<void> {
    const session = PairingSessionSchema.parse(input);
    if (!(await this.cipher.isAvailable())) {
      throw new Error('Operating-system secure storage is unavailable.');
    }
    const encrypted = await this.cipher.encrypt(JSON.stringify(session));
    await writePrivateFile(this.filePath, encrypted.toString('base64'));
  }
}
