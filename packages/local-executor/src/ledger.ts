import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';

const ReceiptSchema = z
  .object({
    completedAt: z.iso.datetime({ offset: true }),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    inputHashes: z
      .array(z.string().regex(/^[a-f0-9]{64}$/))
      .min(1)
      .max(1_000),
    outputHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
const ReceiptListSchema = z.array(ReceiptSchema).max(10_000);
type ProcessingReceipt = z.infer<typeof ReceiptSchema>;

export type ProcessingClaim = 'claimed' | 'duplicate' | 'in_progress';

function fingerprint(contextKey: string, inputHashes: readonly string[]): string {
  return createHash('sha256')
    .update(contextKey)
    .update('\0')
    .update([...inputHashes].sort().join('\0'))
    .digest('hex');
}

export class ProcessingLedger {
  private readonly active = new Set<string>();
  private operationChain: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async claim(contextKey: string, inputHashes: readonly string[]): Promise<ProcessingClaim> {
    return await this.synchronized(async () => {
      const key = fingerprint(contextKey, inputHashes);
      if (this.active.has(key)) {
        return 'in_progress';
      }
      if ((await this.load()).some((receipt) => receipt.fingerprint === key)) {
        return 'duplicate';
      }
      this.active.add(key);
      return 'claimed';
    });
  }

  async complete(
    contextKey: string,
    inputHashes: readonly string[],
    outputHash: string,
  ): Promise<void> {
    await this.synchronized(async () => {
      const key = fingerprint(contextKey, inputHashes);
      if (!this.active.delete(key)) {
        throw new Error('The processing fingerprint is not actively claimed.');
      }
      const receipts = await this.load();
      const receipt = ReceiptSchema.parse({
        completedAt: new Date().toISOString(),
        fingerprint: key,
        inputHashes: [...inputHashes].sort(),
        outputHash,
      });
      const next = [
        ...receipts.filter((candidate) => candidate.fingerprint !== key),
        receipt,
      ].slice(-10_000);
      await this.save(next);
    });
  }

  release(contextKey: string, inputHashes: readonly string[]): void {
    this.active.delete(fingerprint(contextKey, inputHashes));
  }

  private async synchronized<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.operationChain;
    let unlock: () => void = () => {};
    this.operationChain = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      unlock();
    }
  }

  private async load(): Promise<ProcessingReceipt[]> {
    try {
      return ReceiptListSchema.parse(JSON.parse(await readFile(this.filePath, 'utf8')) as unknown);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private async save(receipts: readonly ProcessingReceipt[]): Promise<void> {
    await mkdir(dirname(this.filePath), { mode: 0o700, recursive: true });
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, JSON.stringify(ReceiptListSchema.parse(receipts)), {
        encoding: 'utf8',
        mode: 0o600,
      });
      await rename(temporaryPath, this.filePath);
    } finally {
      await unlink(temporaryPath).catch(() => undefined);
    }
  }
}
