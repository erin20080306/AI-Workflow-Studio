import type { WorkspaceContext } from '@/lib/auth/context';

type WebsiteExportAccessContext = Pick<WorkspaceContext, 'platformAdmin' | 'subscription'>;

export function canDownloadWebsiteExport(context: WebsiteExportAccessContext): boolean {
  if (context.platformAdmin) return true;
  return (
    context.subscription.plan !== 'free' &&
    ['active', 'past_due'].includes(context.subscription.status)
  );
}
