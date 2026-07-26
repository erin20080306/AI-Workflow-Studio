import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    emptyOutDir: true,
    lib: {
      entry: resolve(import.meta.dirname, 'src/preload/index.ts'),
      fileName: () => 'preload.cjs',
      formats: ['cjs'],
    },
    outDir: 'dist/preload',
    rolldownOptions: {
      external: ['electron'],
    },
    target: 'node22',
  },
});
