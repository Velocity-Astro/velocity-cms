# @velocity/cms-ui

The Velocity CMS editor's design system: tokens, components and patterns. Every screen of the
editor, and every plugin, is built from these parts and nothing else.

```tsx
import '@velocity/cms-ui/styles.css';
import { Button, Stack, TextField } from '@velocity/cms-ui';

<Stack as="form" gap={4}>
  <TextField label="Title" isRequired />
  <Button type="submit">Save</Button>
</Stack>;
```

## How it is built

| Layer | Where | What it may use |
|---|---|---|
| Tokens | `src/tokens/tokens.css` | Nothing. Colours, sizes, radii, shadows and durations, for light and dark. |
| Components | `src/components/` | Tokens. One job each: `Button`, `TextField`, `Stack`. |
| Patterns | `src/patterns/` | Components. A recurring arrangement: a page header, a form field, a confirm dialog. |
| Screens | the `cms-admin` package | Patterns and components. No styling of their own. |

Each part is one folder with the same six files: the component, its variants, its stories, its
tests, its guide and its index. `component-registry.json` lists every part with a description and
an example, for people, the docs and AI agents.

## The rules, and what checks them

| Rule | Checked by |
|---|---|
| One folder, six files; registry and exports in sync | `pnpm check` |
| No `className`, `style` or pass-through props | `pnpm check` |
| Class names only in `*.variants.ts` | `pnpm check` |
| Every class resolves against the theme; no arbitrary values, raw colours or raw sizes | `pnpm check` |
| No imports from the rest of the CMS, the server or Node | ESLint |
| Works with a keyboard and a screen reader | each part's tests |
| WCAG 2.1 AA, including contrast, in light and dark | `pnpm check:stories` |

`pnpm storybook` opens the showcase. The full rules are in the repo's `AGENTS.md`.
