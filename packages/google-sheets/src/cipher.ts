import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { z } from 'zod';

import { GoogleSheetsError } from './errors';

const EnvelopeSchema = z
  .object({
    ciphertext: z.string().min(1),
    iv: z.string().min(1),
    keyId: z.string().regex(/^[A-Za-z0-9._-]{1,80}$/),
    tag: z.string().min(1),
    version: z.literal(1),
  })
  .strict();

export type GoogleTokenKind = 'access' | 'refresh';

export interface GoogleTokenContext {
  readonly connectionId: string;
  readonly kind: GoogleTokenKind;
  readonly tenantId: string;
}

function aad(context: GoogleTokenContext): Buffer {
  return Buffer.from(
    `ai-workflow-studio:google:${context.tenantId}:${context.connectionId}:${context.kind}`,
    'utf8',
  );
}

export class GoogleTokenCipher {
  private readonly activeKeyId: string;
  private readonly keys: ReadonlyMap<string, Buffer>;

  constructor(activeKeyId: string, keys: Readonly<Record<string, Uint8Array>>) {
    this.activeKeyId = activeKeyId;
    this.keys = new Map(
      Object.entries(keys).map(([keyId, key]) => {
        const buffer = Buffer.from(key);
        if (buffer.byteLength !== 32) {
          throw new GoogleSheetsError(
            'GOOGLE_NOT_CONFIGURED',
            'Google token encryption keys must contain exactly 32 bytes.',
          );
        }
        return [keyId, buffer] as const;
      }),
    );
    if (!this.keys.has(activeKeyId)) {
      throw new GoogleSheetsError(
        'GOOGLE_NOT_CONFIGURED',
        'The active Google token encryption key is unavailable.',
      );
    }
  }

  static fromBase64(keyId: string, encodedKey: string): GoogleTokenCipher {
    if (!/^[A-Za-z0-9+/]{43}=$/.test(encodedKey)) {
      throw new GoogleSheetsError(
        'GOOGLE_NOT_CONFIGURED',
        'The Google token encryption key is invalid.',
      );
    }
    let key: Buffer;
    try {
      key = Buffer.from(encodedKey, 'base64');
    } catch (error) {
      throw new GoogleSheetsError(
        'GOOGLE_NOT_CONFIGURED',
        'The Google token encryption key is invalid.',
        { cause: error },
      );
    }
    return new GoogleTokenCipher(keyId, { [keyId]: key });
  }

  decrypt(encrypted: Uint8Array, context: GoogleTokenContext): string {
    try {
      const envelope = EnvelopeSchema.parse(
        JSON.parse(Buffer.from(encrypted).toString('utf8')) as unknown,
      );
      const key = this.keys.get(envelope.keyId);
      if (key === undefined) {
        throw new Error('Unknown encryption key.');
      }
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64url'));
      decipher.setAAD(aad(context));
      decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch (error) {
      throw new GoogleSheetsError(
        'GOOGLE_TOKEN_ENCRYPTION_FAILED',
        'The stored Google credential could not be decrypted.',
        { cause: error },
      );
    }
  }

  encrypt(plainText: string, context: GoogleTokenContext): Buffer {
    if (plainText.length === 0 || Buffer.byteLength(plainText, 'utf8') > 20_000) {
      throw new GoogleSheetsError(
        'GOOGLE_TOKEN_ENCRYPTION_FAILED',
        'The Google credential has an invalid size.',
      );
    }
    try {
      const key = this.keys.get(this.activeKeyId);
      if (key === undefined) {
        throw new Error('Active key unavailable.');
      }
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(aad(context));
      const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
      return Buffer.from(
        JSON.stringify({
          ciphertext: ciphertext.toString('base64url'),
          iv: iv.toString('base64url'),
          keyId: this.activeKeyId,
          tag: cipher.getAuthTag().toString('base64url'),
          version: 1,
        }),
        'utf8',
      );
    } catch (error) {
      if (error instanceof GoogleSheetsError) {
        throw error;
      }
      throw new GoogleSheetsError(
        'GOOGLE_TOKEN_ENCRYPTION_FAILED',
        'The Google credential could not be encrypted.',
        { cause: error },
      );
    }
  }
}
