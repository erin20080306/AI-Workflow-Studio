import { describe, expect, it } from 'vitest';

import {
  selectAutomaticFolderAliasId,
  selectTrustedFolderAliasIds,
  selectWorkflowPlanningContext,
} from './workflow-planning-context';

const OFFLINE_DEVICE_ID = '00000000-0000-4000-8000-000000000701';
const ONLINE_DEVICE_ID = '00000000-0000-4000-8000-000000000702';
const FOLDER_ID = '00000000-0000-4000-8000-000000000703';
const DOWNLOADS_FOLDER_ID = '00000000-0000-4000-8000-000000000704';
const TEMP_FOLDER_ID = '00000000-0000-4000-8000-000000000705';

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

  it('honors a requested online device only after matching it to the server list', () => {
    const result = selectWorkflowPlanningContext(
      [
        {
          deviceId: ONLINE_DEVICE_ID,
          deviceName: 'First online Agent',
          folderAliases: [],
          status: 'online',
        },
        {
          deviceId: OFFLINE_DEVICE_ID,
          deviceName: 'Selected online Agent',
          folderAliases: [
            {
              displayName: 'Downloads',
              id: DOWNLOADS_FOLDER_ID,
              permissions: { read: true, watch: true, write: true },
            },
          ],
          status: 'online',
        },
      ],
      { deviceId: OFFLINE_DEVICE_ID, type: 'desktop' },
    );

    expect(result).toMatchObject({
      allowedFolderAliasIds: [DOWNLOADS_FOLDER_ID],
      executionTarget: { deviceId: OFFLINE_DEVICE_ID, type: 'desktop' },
    });
  });
});

describe('selectTrustedFolderAliasIds', () => {
  it('keeps only explicitly requested server-approved folder aliases', () => {
    expect(
      selectTrustedFolderAliasIds(
        [FOLDER_ID, '00000000-0000-4000-8000-000000000704'],
        [FOLDER_ID, '00000000-0000-4000-8000-000000000799'],
      ),
    ).toEqual([FOLDER_ID]);
  });

  it('fails closed when no approved folder was explicitly selected', () => {
    expect(selectTrustedFolderAliasIds([FOLDER_ID], [])).toEqual([]);
  });
});

describe('selectAutomaticFolderAliasId', () => {
  const target = {
    deviceId: ONLINE_DEVICE_ID,
    deviceName: 'Online Agent',
    folderAliases: [
      {
        displayName: 'aiws-temp',
        id: TEMP_FOLDER_ID,
        permissions: { read: true, watch: true, write: true },
      },
      {
        displayName: 'Downloads',
        id: DOWNLOADS_FOLDER_ID,
        permissions: { read: true, watch: true, write: true },
      },
    ],
    status: 'online' as const,
  };

  it('selects the approved Downloads alias for a visible download request', () => {
    expect(selectAutomaticFolderAliasId(target, '下載到下載項目資料夾')).toBe(DOWNLOADS_FOLDER_ID);
  });

  it('prefers the only non-temporary read-write folder', () => {
    expect(selectAutomaticFolderAliasId(target, '整理 Excel')).toBe(DOWNLOADS_FOLDER_ID);
  });

  it('fails closed when multiple stable folders are ambiguous', () => {
    expect(
      selectAutomaticFolderAliasId(
        {
          ...target,
          folderAliases: [
            target.folderAliases[1]!,
            {
              displayName: 'Reports',
              id: FOLDER_ID,
              permissions: { read: true, watch: false, write: true },
            },
          ],
        },
        '整理 Excel',
      ),
    ).toBeUndefined();
  });

  it('does not substitute another folder when Downloads was requested', () => {
    expect(
      selectAutomaticFolderAliasId(
        {
          ...target,
          folderAliases: [
            {
              displayName: 'Reports',
              id: FOLDER_ID,
              permissions: { read: true, watch: false, write: true },
            },
          ],
        },
        '下載到下載項目資料夾',
      ),
    ).toBeUndefined();
  });
});
