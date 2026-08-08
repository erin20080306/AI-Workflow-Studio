import type { GoogleConnectionView } from '@ai-workflow-studio/google-sheets';
import { describe, expect, it } from 'vitest';

import { selectPlanningGoogleConnections } from './google-planning-connections';

const CURRENT: GoogleConnectionView = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Current connection',
  requiresReauthorization: false,
  scopes: [],
  status: 'active',
};
const LEGACY: GoogleConnectionView = {
  ...CURRENT,
  id: '10000000-0000-4000-8000-000000000002',
  name: 'Legacy connection',
  requiresReauthorization: true,
};

describe('selectPlanningGoogleConnections', () => {
  it('keeps an active current connection eligible for Apps Script planning', () => {
    expect(selectPlanningGoogleConnections([CURRENT], true)).toEqual({
      connectionIds: [CURRENT.id],
      requiresReauthorization: false,
    });
  });

  it('classifies an active legacy-only connection as requiring reauthorization', () => {
    expect(selectPlanningGoogleConnections([LEGACY], true)).toEqual({
      connectionIds: [],
      requiresReauthorization: true,
    });
  });

  it('does not require Apps Script scopes for non-GAS Google planning', () => {
    expect(selectPlanningGoogleConnections([LEGACY], false)).toEqual({
      connectionIds: [LEGACY.id],
      requiresReauthorization: false,
    });
  });

  it('does not offer or reauthorize revoked connections', () => {
    expect(selectPlanningGoogleConnections([{ ...LEGACY, status: 'revoked' }], true)).toEqual({
      connectionIds: [],
      requiresReauthorization: false,
    });
  });
});
