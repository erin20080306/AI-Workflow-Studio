import type { WorkspaceContext } from '@/lib/auth/context';

type WebsiteExportAccessContext = Pick<WorkspaceContext, 'platformAdmin' | 'subscription'>;

export function canDownloadWebsiteExport(context: WebsiteExportAccessContext): boolean {
  if (context.platformAdmin) return true;
  return (
    context.subscription.plan !== 'free' &&
    ['active', 'past_due'].includes(context.subscription.status)
  );
}

export function canPublishWebsiteToGithub(
  context: WebsiteExportAccessContext & {
    readonly actor: { readonly role: 'admin' | 'editor' | 'owner' | 'viewer' };
  },
): boolean {
  return ['owner', 'admin'].includes(context.actor.role) && canDownloadWebsiteExport(context);
}

export function canManageWebsiteIntegrations(
  context: WebsiteExportAccessContext & {
    readonly actor: { readonly role: 'admin' | 'editor' | 'owner' | 'viewer' };
  },
): boolean {
  return ['owner', 'admin'].includes(context.actor.role) && canDownloadWebsiteExport(context);
}
