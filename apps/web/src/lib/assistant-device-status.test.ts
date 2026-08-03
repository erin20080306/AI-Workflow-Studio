import { describe, expect, it } from 'vitest';

import {
  effectiveAssistantDeviceStatus,
  isAssistantAgentVersionCompatible,
  MINIMUM_ASSISTANT_AGENT_VERSION,
} from './assistant-device-status';

const NOW = new Date('2026-08-03T00:00:00.000Z');

describe('effectiveAssistantDeviceStatus', () => {
  it('keeps a recently seen online agent available', () => {
    expect(effectiveAssistantDeviceStatus('online', '2026-08-02T23:59:30.000Z', NOW)).toBe(
      'online',
    );
  });

  it('fails closed for stale, missing, or already-offline agents', () => {
    expect(effectiveAssistantDeviceStatus('online', '2026-08-02T23:58:29.999Z', NOW)).toBe(
      'offline',
    );
    expect(effectiveAssistantDeviceStatus('online', null, NOW)).toBe('offline');
    expect(effectiveAssistantDeviceStatus('offline', '2026-08-02T23:59:59.000Z', NOW)).toBe(
      'offline',
    );
  });

  it('rejects timestamps beyond the bounded clock-skew allowance', () => {
    expect(effectiveAssistantDeviceStatus('online', '2026-08-03T00:00:30.001Z', NOW)).toBe(
      'offline',
    );
  });
});

describe('isAssistantAgentVersionCompatible', () => {
  it('accepts the minimum stable Agent and later semantic versions', () => {
    expect(MINIMUM_ASSISTANT_AGENT_VERSION).toBe('0.2.0');
    expect(isAssistantAgentVersionCompatible('0.2.0')).toBe(true);
    expect(isAssistantAgentVersionCompatible('0.2.0+macos.arm64')).toBe(true);
    expect(isAssistantAgentVersionCompatible('0.2.1')).toBe(true);
    expect(isAssistantAgentVersionCompatible('1.0.0')).toBe(true);
  });

  it('fails closed for old, prerelease, missing, or malformed versions', () => {
    expect(isAssistantAgentVersionCompatible('0.1.99')).toBe(false);
    expect(isAssistantAgentVersionCompatible('0.2.0-beta.1')).toBe(false);
    expect(isAssistantAgentVersionCompatible('0.2')).toBe(false);
    expect(isAssistantAgentVersionCompatible('0.2.0-01')).toBe(false);
    expect(isAssistantAgentVersionCompatible(null)).toBe(false);
    expect(isAssistantAgentVersionCompatible(undefined)).toBe(false);
  });
});
