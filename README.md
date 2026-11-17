# Velocity CMS

A content management system for [Velocity](https://github.com/southwellmedia/velocity) sites: a visual editor at `/admin`, a lightweight SQLite database, and a site that stays static and rebuilds when you publish.

> **Status: phase 0, prototypes.** Nothing here is ready to use. The repository is private until the first beta.

## What's here

| Package | What it owns |
|---|---|
| [`@velocity/cms-core`](packages/cms-core) | The content model and every rule about it: content types, fields, entries, permissions, events. Knows nothing about a database, Astro or HTTP. |
| [`@velocity/cms-db`](packages/cms-db) | SQLite and libSQL storage: tables, migrations, and the repositories the core asks for. |
| [`@velocity/cms-astro`](packages/cms-astro) | The Astro side. For now, the Content Layer loader that feeds published entries to a static build. |

`prototypes/` holds the phase 0 experiments and their measured results.

## How the code is organised

Five rules shape everything. `AGENTS.md` has the detail.

1. **Dependencies point inward.** Outer packages depend on the core. The core depends on Zod and nothing else. A lint rule fails the build if a package imports against this.
2. **One path for every change.** The editor, the API, the CLI and plugins all go through the same services, so permissions, validation, history and events are written once.
3. **Interfaces at every edge.** Storage is an interface in `cms-core/src/ports.ts`. An adapter is finished when it passes the contract tests in `@velocity/cms-core/testing`.
4. **We build on our own extension points.** Built-in field types register exactly as a plugin's do.
5. **Classes for behaviour, plain objects for data.** Field types and services are classes. Entries and content types are plain typed objects.

## Working on it

Node 22.23.4 or newer, pnpm 10.

```sh
pnpm install
pnpm validate   # lint, build, test
```

| Task | Command |
|---|---|
| Type-check and build | `pnpm build` |
| Tests | `pnpm test` |
| Lint, including package boundaries | `pnpm lint` |
| New database migration, after editing `packages/cms-db/src/tables.ts` | `pnpm --filter @velocity/cms-db migrations:generate` |

## Adding a field type

```ts
import { z } from 'zod';
import { FieldType } from '@velocity/cms-core';

class RatingField extends FieldType<number, { max: number }> {
  readonly type = 'rating';
  readonly editor = 'rating-input';
  readonly options = z.object({ max: z.number().int().positive().default(5) });

  schema({ max }: { max: number }) {
    return z.number().int().min(1).max(max);
  }
}

cms.fields.register(new RatingField());
```

## Licence

MIT.
