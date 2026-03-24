import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.tsx'],
  format: ['esm'],
  target: 'node18',
  banner: {
    js: '#!/usr/bin/env node',
  },
  bundle: true,
  splitting: false,
  clean: true,
  minify: false,
  sourcemap: false,
  external: [
    // Node.js built-ins handled automatically by tsup
  ],
  esbuildOptions(options) {
    options.jsx = 'automatic';
  },
});
