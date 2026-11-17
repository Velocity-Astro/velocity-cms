import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'node', include: ['packages/*/src/**/*.test.ts'] } },
      {
        // Components are tested in a browser-like page.
        test: {
          name: 'ui',
          include: ['packages/cms-ui/src/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['packages/cms-ui/src/testing/setup.ts'],
        },
      },
    ],
  },
});
