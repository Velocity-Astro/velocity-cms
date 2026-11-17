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
    ['packages/cms-api/src/**'],
    [
      '@velocity/cms-db', '@velocity/cms-db/*', '@velocity/cms-astro', '@velocity/cms-astro/*', '@velocity/cms-admin', '@velocity/cms-ui',
      'drizzle-orm', 'drizzle-orm/*', '@libsql/*', 'astro', 'astro/*', 'astro:*', 'react', 'node:*',
    ],
    'cms-api turns HTTP into calls on the services in cms-core, using only web-standard Request and Response. It must not know which database, framework or runtime it is mounted in.',
  ),
  boundary(
    ['packages/cms-auth/src/**'],
    ['@velocity/cms-astro', '@velocity/cms-astro/*', '@velocity/cms-admin', '@velocity/cms-ui', 'astro', 'astro/*', 'astro:*', 'react', 'node:*'],
    'cms-auth is sign-in and nothing else. It must not know which framework or runtime it is mounted in, or anything about the editor.',
  ),
  boundary(
    ['packages/cms-auth/src/client.ts'],
    ['@velocity/*', 'better-auth', 'better-auth/*', '@better-auth/*', 'drizzle-orm', 'drizzle-orm/*', 'node:*'],
    'client.ts runs in the browser. It must import nothing, so the editor never ships server code.',
  ),
  boundary(
    ['packages/cms-ui/src/**'],
    ['@velocity/*', 'drizzle-orm', 'drizzle-orm/*', '@libsql/*', 'astro', 'astro/*', 'astro:*', 'node:*', 'zod'],
    'cms-ui is the design system: tokens, components and patterns. It must not know about content, the API or the server, so that plugins and other apps can use it as it is.',
  ),
  boundary(
    ['packages/cms-admin/src/**'],
    [
      '@velocity/cms-db', '@velocity/cms-db/*', '@velocity/cms-astro', '@velocity/cms-astro/*', '@velocity/cms-api', '@velocity/cms-api/*',
      'drizzle-orm', 'drizzle-orm/*', '@libsql/*', 'astro', 'astro/*', 'astro:*', 'node:*',
      'react-aria-components', 'react-aria', 'react-aria/*', 'class-variance-authority', 'tailwindcss', 'tailwindcss/*',
    ],
    'cms-admin holds the screens. It reaches the server only through AdminClient, and builds its screens only from @velocity/cms-ui. If a part is missing, add it to cms-ui first.',
  ),
  {
    // Screens have no styling, no HTML and no words of their own.
    files: ['packages/cms-admin/src/**/*.tsx'],
    ignores: ['packages/cms-admin/src/**/*.test.tsx', 'packages/cms-admin/src/testing/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name=/^(className|style)$/]",
          message: 'Screens contain no styling. Use a variant of a cms-ui part, or add one there.',
        },
        {
          selector: 'JSXOpeningElement[name.type="JSXIdentifier"][name.name=/^[a-z]/]',
          message: 'Screens contain no HTML elements. Use a cms-ui part (Box, Stack, Text, Button, Link…), or add one there.',
        },
        {
          selector: 'JSXText[value=/\\p{L}/u]',
          message: 'Screens contain no words. Add the text to src/messages/en.ts and read it with useMessages().',
        },
        {
          selector:
            'JSXAttribute[name.name=/^(label|title|description|placeholder|errorMessage|content|closeLabel|confirmLabel|cancelLabel|navLabel|skipLabel|empty)$/] > Literal',
          message: 'Screens contain no words. Add the text to src/messages/en.ts and read it with useMessages().',
        },
      ],
    },
  },
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
