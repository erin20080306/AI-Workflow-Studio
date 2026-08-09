import { describe, expect, it } from 'vitest';

import {
  selectAutomaticFolderAliasId,
  selectPreferredAssistantDeviceId,
  selectTrustedFolderAliasIds,
  selectWorkflowPlanningContext,
} from './workflow-planning-context';

const OFFLINE_DEVICE_ID = '00000000-0000-4000-8000-000000000701';
const ONLINE_DEVICE_ID = '00000000-0000-4000-8000-000000000702';
const FOLDER_ID = '00000000-0000-4000-8000-000000000703';
const DOWNLOADS_FOLDER_ID = '00000000-0000-4000-8000-000000000704';
const TEMP_FOLDER_ID = '00000000-0000-4000-8000-000000000705';
const COMPATIBLE_AGENT = { agentCompatible: true, agentVersion: '0.2.4' } as const;

describe('selectWorkflowPlanningContext', () => {
  it('uses a safe cloud target when no Desktop Agent is paired', () => {
    expect(selectWorkflowPlanningContext([])).toEqual({
      allowedFolderAliasIds: [],
      executionTarget: { type: 'cloud' },
    });
  });

  it('uses a safe cloud target when every paired Desktop Agent is offline', () => {
    expect(
      selectWorkflowPlanningContext([
        {
          ...COMPATIBLE_AGENT,
          deviceId: OFFLINE_DEVICE_ID,
          deviceName: 'Offline Agent',
          folderAliases: [
            {
              displayName: 'Downloads',
              id: DOWNLOADS_FOLDER_ID,
              permissions: { read: true, watch: true, write: true },
            },
          ],
          status: 'offline',
        },
      ]),
    ).toEqual({
      allowedFolderAliasIds: [],
      executionTarget: { type: 'cloud' },
    });
  });

  it('prefers an online agent and forwards only trusted folder alias IDs', () => {
    const result = selectWorkflowPlanningContext([
      {
        ...COMPATIBLE_AGENT,
        deviceId: OFFLINE_DEVICE_ID,
        deviceName: 'Offline Agent',
        folderAliases: [],
        status: 'offline',
      },
      {
        ...COMPATIBLE_AGENT,
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

  it('does not substitute a Desktop Agent when cloud was explicitly requested', () => {
    expect(
      selectWorkflowPlanningContext(
        [
          {
            ...COMPATIBLE_AGENT,
            deviceId: ONLINE_DEVICE_ID,
            deviceName: 'Online Agent',
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
        { type: 'cloud' },
      ),
    ).toEqual({
      allowedFolderAliasIds: [],
      executionTarget: { type: 'cloud' },
    });
  });

  it('honors a requested online device only after matching it to the server list', () => {
    const result = selectWorkflowPlanningContext(
      [
        {
          ...COMPATIBLE_AGENT,
          deviceId: ONLINE_DEVICE_ID,
          deviceName: 'First online Agent',
          folderAliases: [],
          status: 'online',
        },
        {
          ...COMPATIBLE_AGENT,
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

  it('fails closed when the requested device is offline even if another device is online', () => {
    expect(
      selectWorkflowPlanningContext(
        [
          {
            ...COMPATIBLE_AGENT,
            deviceId: OFFLINE_DEVICE_ID,
            deviceName: 'Selected stale Agent',
            folderAliases: [],
            status: 'offline',
          },
          {
            ...COMPATIBLE_AGENT,
            deviceId: ONLINE_DEVICE_ID,
            deviceName: 'Different online Agent',
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
      ),
    ).toEqual({
      allowedFolderAliasIds: [],
      executionTarget: { type: 'cloud' },
    });
  });

  it('fails closed when the requested online Agent requires an update', () => {
    expect(
      selectWorkflowPlanningContext(
        [
          {
            agentCompatible: false,
            agentVersion: '0.1.0',
            deviceId: OFFLINE_DEVICE_ID,
            deviceName: 'Outdated Agent',
            folderAliases: [
              {
                displayName: 'Downloads',
                id: DOWNLOADS_FOLDER_ID,
                permissions: { read: true, watch: true, write: true },
              },
            ],
            status: 'online',
          },
          {
            ...COMPATIBLE_AGENT,
            deviceId: ONLINE_DEVICE_ID,
            deviceName: 'Different compatible Agent',
            folderAliases: [],
            status: 'online',
          },
        ],
        { deviceId: OFFLINE_DEVICE_ID, type: 'desktop' },
      ),
    ).toEqual({
      allowedFolderAliasIds: [],
      executionTarget: { type: 'cloud' },
    });
  });
});

describe('selectPreferredAssistantDeviceId', () => {
  const targets = [
    {
      ...COMPATIBLE_AGENT,
      deviceId: OFFLINE_DEVICE_ID,
      deviceName: 'Alphabetically first stale Agent',
      folderAliases: [],
      status: 'offline' as const,
    },
    {
      ...COMPATIBLE_AGENT,
      deviceId: ONLINE_DEVICE_ID,
      deviceName: 'Fresh Agent',
      folderAliases: [],
      status: 'online' as const,
    },
  ];

  it('defaults to the first online target instead of the first sorted target', () => {
    expect(selectPreferredAssistantDeviceId(targets)).toBe(ONLINE_DEVICE_ID);
  });

  it('keeps a current online target and replaces an offline target', () => {
    expect(selectPreferredAssistantDeviceId(targets, ONLINE_DEVICE_ID)).toBe(ONLINE_DEVICE_ID);
    expect(selectPreferredAssistantDeviceId(targets, OFFLINE_DEVICE_ID)).toBe(ONLINE_DEVICE_ID);
  });

  it('returns an empty selection when no target is online', () => {
    expect(selectPreferredAssistantDeviceId([targets[0]!])).toBe('');
  });

  it('does not select an online Agent below the minimum compatible version', () => {
    expect(
      selectPreferredAssistantDeviceId([
        {
          agentCompatible: false,
          agentVersion: '0.1.0',
          deviceId: ONLINE_DEVICE_ID,
          deviceName: 'Outdated online Agent',
          folderAliases: [],
          status: 'online',
        },
      ]),
    ).toBe('');
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
    ...COMPATIBLE_AGENT,
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

  it('selects the approved Downloads alias for explicit visible Codex Chrome wording', () => {
    expect(
      selectAutomaticFolderAliasId(
        target,
        '使用可見 Codex 模式開啟 Chrome，下載 Drive Excel 並在電腦安全整合。',
      ),
    ).toBe(DOWNLOADS_FOLDER_ID);
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

  it('fails closed when more than one writable Downloads alias matches', () => {
    expect(
      selectAutomaticFolderAliasId(
        {
          ...target,
          folderAliases: [
            target.folderAliases[1]!,
            {
              displayName: '下載項目',
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
