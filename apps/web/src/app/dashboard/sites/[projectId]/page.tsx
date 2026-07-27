import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { WebsiteBriefWorkspace } from '@/components/sites/website-brief-workspace';
import { requireWorkspaceContext } from '@/lib/auth/context';
import { getWebsiteProject, WebsiteStudioError } from '@/lib/website-studio-server';

export const metadata: Metadata = {
  title: '網站需求引導',
};

const ParamsSchema = z.object({ projectId: z.string().uuid() }).strict();

export default async function WebsiteBriefPage({
  params,
}: Readonly<{
  params: Promise<{ projectId: string }>;
}>) {
  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const context = await requireWorkspaceContext();
  try {
    return (
      <WebsiteBriefWorkspace
        initialProject={await getWebsiteProject(context, parsed.data.projectId)}
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
