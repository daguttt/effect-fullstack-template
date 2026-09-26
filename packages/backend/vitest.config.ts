import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'edge-runtime',
    include: ['src/confect/**/*.test.ts'],
    // Confect's `env` is read at module scope, so the deployment variables the
    // suite relies on must exist before any test module evaluates.
    env: {
      WORKOS_CLIENT_ID: 'client_test',
    },
  },
});
