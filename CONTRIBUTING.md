# Contributing to Velocity CMS

Thank you for helping. This page says how to set up, what a pull request needs, and how decisions are made.

## Before you start

- **A bug:** open an issue with what you did, what you expected and what happened. A failing test is the best report there is.
- **A small fix:** send the pull request; no issue is needed.
- **A feature or a change to an API:** open an issue first. The plugin API and the template API are promises to other people, so they change on purpose and slowly.
- **A security problem:** do not open an issue. See [SECURITY.md](SECURITY.md).

## Set up

Node 22.23.4 or newer and pnpm 10.

```sh
pnpm install
pnpm validate   # lint, build, test: what CI runs
```

| Task | Command |
|---|---|
| Build and type-check | `pnpm build` |
| Tests | `pnpm test` |
| One test file | `pnpm exec vitest run packages/cms-core/src/cms.test.ts` |
| Lint, including package boundaries and the design system's rules | `pnpm lint` |
| The starter site, from an empty database | `pnpm --filter velocity-cms-starter check` |
| The design system's showcase | `pnpm --filter @velocity-astro/cms-ui storybook` |
| The editor against an in-memory server | `pnpm --filter @velocity-astro/cms-admin dev` |

## The rules of the code

[`AGENTS.md`](AGENTS.md) is the guide, for people and for coding agents. Lint enforces most of it and says how to fix what it finds. The ones people meet first:

- Every write goes through a service: permission, validation, save with history, event.
- `cms-core` imports nothing but Zod. The outside world comes in through `ports.ts`.
- Screens are built only from `cms-ui` parts, and every word a person reads lives in `messages/en.ts`.
- A new part of the design system has six files, tests for keyboard and pointer, and stories that pass WCAG 2.1 AA in light and dark.
- Migrations only move forward.
- Errors are written for the person who will read them: what happened and what to do.

## A pull request

- One change per pull request, with tests for it.
- `pnpm validate` passes.
- The description says what changed and why, and names anything left out on purpose.
- If you changed a rule or added a part of the code people need to find, update `AGENTS.md` in the same pull request.
- A change to the plugin surface (`PluginContext`, `plugin-ui.ts`) or to what a template calls needs an issue and a maintainer's yes first.

## Sign your commits off

This project uses the [Developer Certificate of Origin](https://developercertificate.org). It is a statement that you wrote the change, or otherwise have the right to submit it under the project's licence. You make it by adding a line to each commit:

```
Signed-off-by: Your Name <you@example.com>
```

`git commit -s` adds it for you. There is no contributor agreement to sign.

## Licence

By contributing you agree that your contribution is licensed under the [MIT licence](LICENSE).
