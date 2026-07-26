import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';

const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ['@ai-workflow-studio/shared'],
  turbopack: {
    root: fileURLToPath(new URL('../..', import.meta.url)),
  },
} satisfies NextConfig;

export default nextConfig;
