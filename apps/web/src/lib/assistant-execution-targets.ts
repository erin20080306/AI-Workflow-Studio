import 'server-only';

import { z } from 'zod';

import type { WorkspaceContext } from '@/lib/auth/context';
import { getEnvironment } from '@/lib/env';
import { MOCK_DEVICE_ID, MOCK_FOLDER_ALIAS_ID } from '@/lib/mock-workflows';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

export const AssistantFolderAliasSchema = z
  .object({
    displayName: z.string().min(1).max(120),
    id: z.string().uuid(),
    permissions: z
      .object({
        read: z.boolean(),
        watch: z.boolean(),
        write: z.boolean(),
      })
      .strict(),
  })
  .strict();
export const AssistantExecutionTargetSchema = z
  .object({
    deviceId: z.string().uuid(),
    deviceName: z.string().min(1).max(120),
    folderAliases: z.array(AssistantFolderAliasSchema).max(200),
    status: z.enum(['offline', 'online']),
  })
  .strict();
export type AssistantExecutionTarget = z.infer<typeof AssistantExecutionTargetSchema>;

const DeviceRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  status: z.enum(['offline', 'online']),
});
const FolderRowSchema = z.object({
  device_id: z.string().uuid(),
  display_name: z.string().min(1).max(120),
  id: z.string().uuid(),
  permission_summary: z.unknown(),
});
const PermissionSchema = z
  .object({
    read: z.boolean().default(false),
    watch: z.boolean().default(false),
    write: z.boolean().default(false),
  })
  .passthrough();

export async function listAssistantExecutionTargets(
  context: WorkspaceContext,
): Promise<readonly AssistantExecutionTarget[]> {
  if (getEnvironment().mockMode) {
    return [
      AssistantExecutionTargetSchema.parse({
        deviceId: MOCK_DEVICE_ID,
        deviceName: 'Mock Desktop Agent',
        folderAliases: [
          {
            displayName: 'Approved mock folder',
            id: MOCK_FOLDER_ALIAS_ID,
            permissions: { read: true, watch: true, write: true },
          },
        ],
        status: 'online',
      }),
    ];
  }
  const admin = createSupabaseAdminClient();
  const [deviceResult, folderResult] = await Promise.all([
    admin
      .from('devices')
      .select('id, name, status')
      .eq('tenant_id', context.actor.tenantId)
      .in('status', ['online', 'offline'])
      .order('name'),
    admin
      .from('folder_aliases')
      .select('id, device_id, display_name, permission_summary')
      .eq('tenant_id', context.actor.tenantId)
      .order('display_name'),
  ]);
  if (deviceResult.error !== null || folderResult.error !== null) {
    return [];
  }
  const folders = z.array(FolderRowSchema).parse(folderResult.data);
  return z
    .array(DeviceRowSchema)
    .parse(deviceResult.data)
    .map((device) =>
      AssistantExecutionTargetSchema.parse({
        deviceId: device.id,
        deviceName: device.name,
        folderAliases: folders
          .filter((folder) => folder.device_id === device.id)
          .map((folder) => ({
            displayName: folder.display_name,
            id: folder.id,
            permissions: PermissionSchema.parse(folder.permission_summary),
          })),
        status: device.status,
      }),
    );
}
