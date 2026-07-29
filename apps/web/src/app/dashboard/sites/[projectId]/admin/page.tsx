import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { WebsiteAdminDashboard } from '@/components/sites/website-admin-dashboard';
import { requireWorkspaceContext } from '@/lib/auth/context';
import { getWebsiteAdminDashboard } from '@/lib/website-admin-server';
import { getActiveWebsitePublication } from '@/lib/website-publication-server';
import { websiteSiteUrl } from '@/lib/website-site-host';
import { getWebsiteSpecGeneration } from '@/lib/website-spec-server';
import { getWebsiteProject, WebsiteStudioError } from '@/lib/website-studio-server';

export const metadata: Metadata = {
  title: '網站後台',
};

const ParamsSchema = z.object({ projectId: z.string().uuid() }).strict();

export default async function WebsiteAdminPage({
  params,
}: Readonly<{
  params: Promise<{ projectId: string }>;
}>) {
  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const context = await requireWorkspaceContext();
  try {
    const project = await getWebsiteProject(context, parsed.data.projectId);
    const [dashboard, generation, publication] = await Promise.all([
      getWebsiteAdminDashboard(context, project.id),
      getWebsiteSpecGeneration(context, project.id),
      getActiveWebsitePublication(context, project.id),
    ]);
    return (
      <WebsiteAdminDashboard
        canManage={context.actor.role !== 'viewer'}
        initialDashboard={dashboard}
        pages={generation?.spec.pages.map((page) => ({ slug: page.slug, title: page.title })) ?? []}
        projectId={project.id}
        projectName={project.name}
        {...(publication === undefined ? {} : { publicUrl: websiteSiteUrl(publication.slug) })}
      />
    );
  } catch (error) {
    if (error instanceof WebsiteStudioError && error.code === 'WEBSITE_NOT_FOUND') {
      notFound();
    }
    throw error;
  }
}

export const dynamic = 'force-dynamic';
