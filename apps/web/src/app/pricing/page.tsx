import type { Metadata } from 'next';

import { PricingContent } from '@/components/pricing-content';

export const metadata: Metadata = {
  description: 'AI Workflow Studio plans for individuals and teams.',
  title: '方案與費率',
};

export default function PricingPage() {
  return <PricingContent />;
}
