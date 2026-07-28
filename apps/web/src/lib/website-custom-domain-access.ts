import type { WorkspaceContext } from '@/lib/auth/context';

import { canDownloadWebsiteExport } from './website-static-export-access';

type WebsiteCustomDomainAccessContext = Pick<
  WorkspaceContext,
  'actor' | 'platformAdmin' | 'subscription'
>;

export function canManageWebsiteCustomDomains(context: WebsiteCustomDomainAccessContext): boolean {
  return (
    context.platformAdmin ||
    (canDownloadWebsiteExport(context) && ['owner', 'admin'].includes(context.actor.role))
  );
}
