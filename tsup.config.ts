import { defineConfig } from 'tsup';
import * as dotenv from 'dotenv';

dotenv.config();

const LIBRE_URL = process.env.XVD_LIBRE_URL ?? '';
const LIBRE_KEY = process.env.XVD_LIBRE_KEY ?? '';
const WHISPER_URL = process.env.XVD_WHISPER_URL ?? '';
const WHISPER_KEY = process.env.XVD_WHISPER_KEY ?? '';

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
  external: [],
  esbuildOptions(options) {
    options.jsx = 'automatic';
    options.define = {
      ...options.define,
      __XVD_LIBRE_URL__: JSON.stringify(LIBRE_URL),
      __XVD_LIBRE_KEY__: JSON.stringify(LIBRE_KEY),
      __XVD_WHISPER_URL__: JSON.stringify(WHISPER_URL),
      __XVD_WHISPER_KEY__: JSON.stringify(WHISPER_KEY),
    };
  },
});
