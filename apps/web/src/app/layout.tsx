import { PRODUCT } from '@ai-workflow-studio/shared/product';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  description:
    'Turn natural-language instructions into safe, validated spreadsheet automation workflows.',
  title: {
    default: PRODUCT.displayName,
    template: `%s · ${PRODUCT.displayName}`,
  },
};

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f7f8f5',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
