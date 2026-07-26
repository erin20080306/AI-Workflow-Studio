import { PRODUCT } from '@ai-workflow-studio/shared/product';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { LanguageProvider } from '@/components/language-provider';

import '@xyflow/react/dist/style.css';
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
    <html data-locale="zh-Hant" data-scroll-behavior="smooth" lang="zh-Hant">
      <body>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
