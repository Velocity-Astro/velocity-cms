import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Dependencies point inward: cms-core depends on nothing of ours, and nothing but Zod.
 * Each block below lists what a package must never import. Add a package here when you add one.
 */
const boundary = (files, patterns, message) => ({
  files,
  rules: {
    'no-restricted-imports': ['error', { patterns: [{ group: patterns, message }] }],
  },
});

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'prototypes/**/work/**', 'prototypes/auth/schema.ts', '**/storybook-static/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
  boundary(
    ['packages/cms-core/src/**'],
    ['@velocity/*', 'drizzle-orm', 'drizzle-orm/*', '@libsql/*', 'astro', 'astro/*', 'astro:*', 'react', 'node:*'],
    'cms-core holds the content model and its rules. It must not know about a database, Astro, HTTP or Node. Define an interface in ports.ts and implement it in an adapter package.',
  ),
  boundary(
    ['packages/cms-db/src/**'],
    ['@velocity/cms-astro', '@velocity/cms-astro/*', 'astro', 'astro/*', 'astro:*', 'react'],
    'cms-db implements the storage interfaces from cms-core and nothing else.',
  ),
  boundary(
    ['packages/cms-ui/src/**'],
    ['@velocity/*', 'drizzle-orm', 'drizzle-orm/*', '@libsql/*', 'astro', 'astro/*', 'astro:*', 'node:*', 'zod'],
    'cms-ui is the design system: tokens, components and patterns. It must not know about content, the API or the server, so that plugins and other apps can use it as it is.',
  ),
  {
    // Tests and the shared test helpers may use Node and Vitest.
    files: ['packages/*/src/**/*.test.{ts,tsx}', 'packages/*/src/testing/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['prototypes/**/*.mjs', 'packages/*/scripts/**/*.mjs', '*.config.js'],
    languageOptions: { globals: { document: 'readonly', globalThis: 'readonly', console: 'readonly', process: 'readonly', performance: 'readonly', fetch: 'readonly', setTimeout: 'readonly', URL: 'readonly', Buffer: 'readonly' } },
  },
);
