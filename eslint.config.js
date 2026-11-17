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
  { ignores: ['**/dist/**', '**/node_modules/**', 'prototypes/**/work/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
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
  {
    // Tests and the shared test helpers may use Node and Vitest.
    files: ['packages/*/src/**/*.test.ts', 'packages/cms-core/src/testing/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['prototypes/**/*.mjs', '*.config.js'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly', performance: 'readonly', fetch: 'readonly', setTimeout: 'readonly', URL: 'readonly' } },
  },
);
