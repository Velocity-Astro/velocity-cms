# Velocity CMS — Agent Guide

Instructions for AI coding agents and people working in this repo.

## Stack

TypeScript (strict) · Zod 4 · Drizzle + libSQL (SQLite) · Astro 7 · Vitest · Node ≥22.23.4 · pnpm 10

## Commands

| Task | Command |
|---|---|
| Everything, before a commit | `pnpm validate` (lint → build → test) |
| Build and type-check | `pnpm build` |
| Tests | `pnpm test` (builds first: packages import each other's `dist`) |
| Lint | `pnpm lint` |
| New migration | `pnpm --filter @velocity/cms-db migrations:generate` |

## Where things live

- `packages/cms-core/src/model.ts` — the content model as plain data. No methods.
- `packages/cms-core/src/field-type.ts`, `fields/` — the `FieldType` base class and the built-in types.
- `packages/cms-core/src/services/` — `SchemaService` and `ContentService`. Every write goes through one of these.
- `packages/cms-core/src/ports.ts` — the interfaces adapters implement.
- `packages/cms-core/src/testing/` — in-memory adapters and the contract tests for real ones.
- `packages/cms-db/src/tables.ts` — the tables. `migrations/` is generated from it.
- `packages/cms-astro/src/live-loader.ts` — the live loader, for pages rendered on demand. The default way a site reads content.
- `packages/cms-astro/src/loader.ts` — the Content Layer loader, for sites that choose a fully static build.
- `prototypes/` — phase 0 experiments. Scripts here may be rough; packages may not.

## Rules

- **Dependencies point inward.** `cms-core` imports Zod and nothing else: no Node built-ins, no Drizzle, no Astro. Need the outside world? Add an interface to `ports.ts` and implement it in an adapter package. `eslint.config.js` enforces this; add a boundary block when you add a package.
- **Every write follows four steps, in order:** permission check, validation, save with history, event. Don't write to a repository from anywhere but a service.
- **Classes for behaviour, plain objects for data.** Don't add methods to `Entry`, `ContentTypeDef` or `FieldDef`. They are stored, sent to the browser and compared.
- **Field ids are permanent.** Entry data is keyed by field id, never by key. A rename changes the key only. A removed field is marked `deletedAt` and its data is kept.
- **No switch on field type.** Behaviour that differs by field type is a method on `FieldType`.
- **A new adapter must pass the contract tests** in `@velocity/cms-core/testing`. Add a case there when you find behaviour an adapter could get wrong.
- **Migrations only move forward.** Never edit a generated migration that has shipped.
- **Errors are for people.** Throw a `CmsError` subclass with a message that says what happened and what to do, naming fields by key.
- **No `any`** and no hardcoded user-facing strings outside error messages.
- **Live by default.** A published change must be visible at once. Pages that show CMS content are rendered on demand, cached with `Astro.cache.set()` under the tags the live loader provides, and cleared by tag on publish. Never add a rebuild step to the publish path.
- **Zod** is a peer dependency pinned to the range Astro ships, so the same schemas serve the CMS and Astro's collections.
