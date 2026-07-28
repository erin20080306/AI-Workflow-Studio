import { describe, expect, it } from 'vitest';

import { selectWorkflowPlanningContext } from './workflow-planning-context';

const OFFLINE_DEVICE_ID = '00000000-0000-4000-8000-000000000701';
const ONLINE_DEVICE_ID = '00000000-0000-4000-8000-000000000702';
const FOLDER_ID = '00000000-0000-4000-8000-000000000703';

describe('selectWorkflowPlanningContext', () => {
  it('uses a safe cloud target when no Desktop Agent is paired', () => {
    expect(selectWorkflowPlanningContext([])).toEqual({
      allowedFolderAliasIds: [],
      executionTarget: { type: 'cloud' },
    });
  });

  it('prefers an online agent and forwards only trusted folder alias IDs', () => {
    const result = selectWorkflowPlanningContext([
      {
        deviceId: OFFLINE_DEVICE_ID,
        deviceName: 'Offline Agent',
        folderAliases: [],
        status: 'offline',
      },
      {
        deviceId: ONLINE_DEVICE_ID,
        deviceName: 'Online Agent',
        folderAliases: [
          {
            displayName: 'Orders',
            id: FOLDER_ID,
            permissions: { read: true, watch: false, write: true },
          },
        ],
        status: 'online',
      },
    ]);

    expect(result).toMatchObject({
      allowedFolderAliasIds: [FOLDER_ID],
      executionTarget: { deviceId: ONLINE_DEVICE_ID, type: 'desktop' },
      selectedTarget: { deviceName: 'Online Agent' },
    });
  });
});
