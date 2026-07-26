import { createHmac, randomBytes, randomUUID } from 'node:crypto';

import { AgentProtocolError } from './errors';

const PAIRING_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export interface AgentCryptoOptions {
  readonly pepper: string;
  readonly randomBytes?: (size: number) => Uint8Array;
  readonly randomUuid?: () => string;
}

export class AgentCrypto {
  private readonly pepper: string;
  private readonly randomByteSource: (size: number) => Uint8Array;
  private readonly randomUuidSource: () => string;

  constructor(options: AgentCryptoOptions) {
    if (Buffer.byteLength(options.pepper, 'utf8') < 32) {
      throw new AgentProtocolError(
        'AGENT_REQUEST_INVALID',
        'Agent token pepper must contain at least 32 bytes.',
      );
    }
    this.pepper = options.pepper;
    this.randomByteSource = options.randomBytes ?? randomBytes;
    this.randomUuidSource = options.randomUuid ?? randomUUID;
  }

  createClaimToken(): string {
    return `clm_${Buffer.from(this.randomByteSource(32)).toString('base64url')}`;
  }

  createDeviceToken(): string {
    return `dvt_${Buffer.from(this.randomByteSource(32)).toString('base64url')}`;
  }

  createPairingCode(): string {
    const bytes = this.randomByteSource(12);
    return [...bytes].map((byte) => PAIRING_ALPHABET[byte % PAIRING_ALPHABET.length]).join('');
  }

  hashClaimToken(token: string): string {
    return this.hash('claim-token', token);
  }

  hashDeviceToken(token: string): string {
    return this.hash('device-token', token);
  }

  hashPairingCode(code: string): string {
    return this.hash('pairing-code', code.toUpperCase());
  }

  randomUuid(): string {
    return this.randomUuidSource();
  }

  tokenHint(token: string): string {
    return token.slice(-8);
  }

  private hash(domain: string, value: string): string {
    return createHmac('sha256', this.pepper)
      .update(domain)
      .update('\0')
      .update(value)
      .digest('hex');
  }
}
