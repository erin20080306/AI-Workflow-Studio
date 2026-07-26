import { builtinModules } from 'node:module';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const nodeBuiltins = new Set(builtinModules);

export default defineConfig({
  build: {
    emptyOutDir: true,
    lib: {
      entry: resolve(import.meta.dirname, 'src/main/index.ts'),
      fileName: () => 'main.cjs',
      formats: ['cjs'],
    },
    outDir: 'dist/main',
    rolldownOptions: {
      external: (id) =>
        id === 'electron' ||
        id === 'electron-updater' ||
        id.startsWith('node:') ||
        nodeBuiltins.has(id),
    },
    target: 'node22',
  },
});
