import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'node', include: ['packages/*/src/**/*.test.ts', 'packages/*/bin/**/*.test.mjs'] } },
      {
        // Components and screens are tested in a browser-like page.
        test: {
          name: 'ui',
          include: ['packages/cms-ui/src/**/*.test.tsx', 'packages/cms-admin/src/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['packages/cms-ui/src/testing/setup.ts'],
        },
      },
    ],
  },
});
