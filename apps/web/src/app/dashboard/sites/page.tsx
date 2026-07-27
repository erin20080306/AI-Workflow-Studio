import type { Metadata } from 'next';

import { WebsiteStudioHome } from '@/components/sites/website-studio-home';
import { requireWorkspaceContext } from '@/lib/auth/context';
import { listWebsiteProjects } from '@/lib/website-studio-server';

export const metadata: Metadata = {
  title: '網站工作室',
};

export default async function WebsiteStudioPage() {
  const context = await requireWorkspaceContext();
  return <WebsiteStudioHome initialProjects={await listWebsiteProjects(context)} />;
}

export const dynamic = 'force-dynamic';
