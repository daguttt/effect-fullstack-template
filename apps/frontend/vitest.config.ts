import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '#modules': path.resolve(dirname, './src/modules'),
      '#routes': path.resolve(dirname, './src/routes'),
      '#': path.resolve(dirname, './src'),
    },
  },
  envDir: '../../',
  test: {
    // `node` by default; files that need browser APIs opt in with a
    // `// @vitest-environment jsdom` pragma.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // `env.ts` validates at module scope, so suites that reach it need these
    // before any test module evaluates, even in a checkout without `.env.local`.
    env: {
      VITE_CONVEX_URI: 'https://test.convex.cloud',
      VITE_WORKOS_CLIENT_ID: 'client_test',
    },
  },
});
