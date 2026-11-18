# Velocity CMS — Agent Guide

Instructions for AI coding agents and people working in this repo.

## Stack

TypeScript (strict) · Zod 4 · web-standard `Request`/`Response` · Better Auth · Drizzle + libSQL (SQLite) · Astro 7 · React 19 · React Aria Components · Tailwind CSS v4 · Storybook 10 · Vitest · Node ≥22.23.4 · pnpm 10

## Commands

| Task | Command |
|---|---|
| Everything, before a commit | `pnpm validate` (lint → build → test) |
| Build and type-check | `pnpm build` |
| Tests | `pnpm test` (builds first: packages import each other's `dist`) |
| Lint | `pnpm lint` (ESLint, then the design system's rules) |
| Design system showcase | `pnpm --filter @velocity/cms-ui storybook` |
| Accessibility of every story, light and dark | `pnpm --filter @velocity/cms-ui check:stories` |
| New migration | `pnpm --filter @velocity/cms-db migrations:generate` |

## Where things live

- `packages/cms-core/src/model.ts` — the content model as plain data. No methods.
- `packages/cms-core/src/field-type.ts`, `fields/` — the `FieldType` base class and the built-in types.
- `packages/cms-core/src/services/` — `SchemaService` and `ContentService`. Every write goes through one of these.
- `packages/cms-core/src/plugin.ts` — plugins: `definePlugin`, and `PluginHost`, which starts each one, gives it its own actor and switches off one that cannot start. Whether a plugin is on, its settings and its own small values live in a `PluginStore` (`plugin_data`), so an owner activates it in the editor with no rebuild, and every running copy follows within seconds. A site names its plugins in `velocityCms({ plugins })`; `cms-astro/routes/plugins.ts` hands them over when the server starts.
- `packages/cms-core/src/ports.ts` — the interfaces adapters implement.
- `packages/cms-core/src/testing/` — in-memory adapters and the contract tests for real ones.
- `packages/cms-db/src/search-index.ts` — search in the same database (FTS5). Its table is a hand-written migration.
- `packages/cms-db/src/tables.ts` — the tables. `migrations/` is generated from it.
- `packages/cms-astro/src/live-loader.ts` — the live loader, for pages rendered on demand. The default way a site reads content.
- `packages/cms-astro/src/preview.ts` — preview links: the middleware that turns a signed token into a preview.
- `packages/cms-astro/src/integration.ts` — what `velocityCms()` adds to a site. `routes/` holds the pages it injects: they ship as source and are compiled with the site, because they must see the site's own files. Keep them thin; logic goes in `src/`, where it is type-checked and tested.
- `packages/cms-astro/src/editor.ts` — `EditorHost`: the editor's page (`admin-files.ts`), the API and sign-in wired over the site's one connection. `site-editor.ts` makes the site's one host and decides which address links are made for. `cli.ts` is the `velocity-cms` command (`bin/` only starts it).
- `packages/cms-astro/src/loader.ts` — the Content Layer loader, for sites that choose a fully static build.
- `packages/cms-api/src/api.ts` — the CMS over HTTP: `CmsApi.handle(request)` answers with a `Response`. Routes hold no rules; they check the shape of what was sent and call a service. `authenticator.ts` is how it learns who is asking; `http.ts` maps each refusal to a status and a code.
- `packages/cms-auth/src/auth.ts` — sign-in: `CmsAuth` wraps Better Auth (email links, passkeys) and is the only file that knows it. `client.ts` is the browser's side and imports nothing. `mailer.ts` is how a site delivers the links. Its tables are `auth_*` in `packages/cms-db/src/auth-tables.ts`.
- `packages/cms-ui/` — the editor's design system. `src/tokens/tokens.css` holds every colour, size, radius, shadow and duration; `src/styles.css` turns them into the Tailwind theme and switches Tailwind's own palette off; `src/components/` and `src/patterns/` hold one folder per part; `component-registry.json` lists them all; `scripts/check.mjs` enforces the rules below.
- `packages/cms-admin/` — the editor's screens, a React app. `src/client/admin-client.ts` is the only way to the server (`queries.ts` wraps every request, `http-client.ts` is the one a real site uses); `src/messages/en.ts` holds every word; `src/app/` has the routes, addresses and frame; `src/screens/` has one folder per screen; `src/fields/` has the control for each kind of field, looked up by the name a field type gives as `editor`; `src/fields/settings.tsx` has the form for each field type's settings in the content type builder (`screens/ContentTypes`, `screens/ContentType`), looked up by the field type's name; `src/testing/` has the in-memory server the tests and the preview (`pnpm --filter @velocity/cms-admin dev`) run against.
- `packages/cms-admin/src/plugins/` — what plugins add to the editor. `plugin-editor.tsx` loads each running plugin's editor file (`definePlugin({ editor })`, served by the site at `/admin/plugins/<name>.js`) and hands it `{ React, ui, client, register }`; `plugin-ui.ts` names the design system parts a plugin gets; `PluginBoundary.tsx` keeps a plugin's fault to its own part of the screen.
- `packages/cms-plugins/` — the plugins that come with the CMS (`catalogue`), each in its own folder. `cms-astro/src/site-plugins.ts` loads them on every site after the site's own, switched off until an owner activates one. `seo/` is the first: `analyse.ts` judges an entry, `plugin.ts` is the server side, `editor.ts` the editor's part.
- `prototypes/` — phase 0 experiments. Scripts here may be rough; packages may not.

## Rules

- **Dependencies point inward.** `cms-core` imports Zod and nothing else: no Node built-ins, no Drizzle, no Astro. Need the outside world? Add an interface to `ports.ts` and implement it in an adapter package. `eslint.config.js` enforces this; add a boundary block when you add a package.
- **Every write follows four steps, in order:** permission check, validation, save with history, event. Don't write to a repository from anywhere but a service.
- **Classes for behaviour, plain objects for data.** Don't add methods to `Entry`, `ContentTypeDef` or `FieldDef`. They are stored, sent to the browser and compared.
- **Two versions per entry.** `data` and `slug` are what is being worked on; `published` is what visitors see. A save never changes `published`; only `publish` does. The site reads with `toPublic(type, entry)`, and only a preview passes `'working'`.
- **Drafts never leak.** Anything that shows working versions must check `isPreview()`, must not be cached, and must not feed search, the sitemap or share images.
- **A template's content types are described in code and applied with `schema.define`.** It may run on every deploy: a field keeps its id by key, so content stays, and fields the description leaves out are kept. A type also names the field its entries are called by (`titlePath`) and the sections the editor shows (`sections`).
- **Field ids are permanent.** Entry data is keyed by field id, never by key. A rename changes the key only. A removed field is marked `deletedAt` and its data is kept.
- **A plugin gets the public surface and nothing else.** What `setup` receives is `PluginContext`: add to it deliberately, because every addition is a promise to plugin authors (`PLUGIN_API_VERSION`). A plugin writes through the services as its own actor, with only the permissions it declared, and a failure in one is caught, counted and shown under Plugins; it never stops a save or a publish. A plugin's own addresses live under `/api/cms/plugins/<name>/` and keep every API rule; its settings are fields, drawn by the editor with the controls entries use.
- **In the editor, a plugin gets what it is handed and nothing else.** Its editor file is one prebuilt module with no React of its own. It adds screens, panels on an entry and field controls through `register`, reaches only its own addresses through `client`, and builds from the parts in `plugin-ui.ts`. Each part and each method there is a promise to plugin authors: add on purpose, never remove within one `PLUGIN_API_VERSION`. Whatever a plugin draws is wrapped in `PluginBoundary`, and a file that fails to load leaves the plugin out and the editor running.
- **A plugin that ships is built like any other.** Everything in `cms-plugins` uses only `definePlugin` and what its editor file is handed, says `enabledByDefault: false`, and declares the fewest permissions it can. If one needs something the surface lacks, the surface gains it for everyone, on purpose. Its editor part is a function sent to the browser as text (`fn.toString()`), so it and anything sent with it must stand alone: arguments only, no imports, no helpers from the file.
- **No switch on field type.** Behaviour that differs by field type is a method on `FieldType`.
- **A new adapter must pass the contract tests** in `@velocity/cms-core/testing`. Add a case there when you find behaviour an adapter could get wrong.
- **Migrations only move forward.** Never edit a generated migration that has shipped.
- **Errors are for people.** Throw a `CmsError` subclass with a message that says what happened and what to do, naming fields by key.
- **No `any`** and no hardcoded user-facing strings outside error messages.
- **Live by default.** A published change must be visible at once. Pages that show CMS content are rendered on demand, cached with `Astro.cache.set()` under the tags the live loader provides, and cleared by tag on publish. Never add a rebuild step to the publish path.
- **The editor is served ready-made.** `cms-admin` builds it once (`build:app`, into `app-dist/`), and a site serves those files at `/admin`; the site's own bundler, React and styles never touch it. Its settings are written into the page as JSON. Its page allows scripts only from the site itself.
- **Links are made for the configured site, never for the request's host.** On a deployed site the address comes from `site` or `VELOCITY_CMS_ORIGIN` (`editorOrigin`). Whoever sends a request chooses its `Host` header.
- **A route the integration adds says whether it may be cached.** Sites cache pages rendered on demand by default, so the editor's routes call `cache.set(false)` first: a cached answer would show one person's session or a draft to the next.
- **Zod** is a peer dependency pinned to the range Astro ships, so the same schemas serve the CMS and Astro's collections.

## API rules (`cms-api`)

- **Web standards only.** `Request` in, `Response` out. No Node, no Astro, no framework, so it mounts anywhere the site runs.
- **No rules in a route.** A route parses with Zod (`strictObject`, so an unknown property is refused), calls one service as the person who asked, and returns JSON. A rule that seems to belong in a route belongs in `cms-core`.
- **Every route but `GET /session` needs a session**, and a change must come from the site's own pages as JSON (`#requireOwnPage`).
- **Errors have one shape:** `{ error: { code, message, issues? } }`. A refusal keeps the service's own words. A fault answers 500 with nothing about the inside, and goes to `onFault`.
- **Nothing is cacheable.** Every response is `no-store`: the API serves drafts.
- **A new method on `AdminClient` gets a route here, a method on `HttpAdminClient`, and a case in `adminClientContract`** (`cms-admin/src/testing`), which both clients run.

## Sign-in rules (`cms-auth`)

- **One file knows the library.** Everything else sees `Authenticator`, `handle`, and the methods on `CmsAuth`. Don't import `better-auth` anywhere else, and don't reach into its internals: write to the `auth_*` tables this package owns.
- **No passwords, no sign-up.** People are invited by an owner. The first owner is made by `createFirstOwner`, which refuses once anyone exists.
- **Never email a stranger, and never say who has an account.** A request for a link is answered the same way whoever the address belongs to.
- **A link never leaves the site.** Where a link lands afterwards must be a path here; `#deliver` checks it whatever the library does.
- **The role lives on the person and only an owner changes it.** A role this version does not know grants nothing.
- **`client.ts` imports nothing**, so the editor never ships server code. ESLint enforces it.

## Design system rules (`cms-ui`)

`pnpm lint` fails when one of these is broken, and says which file and how to fix it.

- **Four layers:** tokens → components → patterns → screens. A layer uses only the layers before it. Screens (`cms-admin`) contain no styling and no raw interactive HTML.
- **One folder, six files:** `X.tsx`, `X.variants.ts`, `X.stories.tsx`, `X.test.tsx`, `X.md`, `index.ts`. Nothing else.
- **Parts are closed.** No `className`, no `style`, no props passed through. A new look is a new variant, so every screen gets it.
- **Class names live in `X.variants.ts`** (CVA), never in the component file. Classes that several parts share (a field's label, a floating panel) live in a file at the root of the layer, such as `components/field.ts`, and are checked the same way.
- **Tokens only.** Every class must resolve against the theme in `styles.css`. No arbitrary values (`w-[13px]`), raw colours or raw sizes. A new value is a new token in `tokens.css`, for light and dark.
- **Behaviour comes from React Aria Components.** Don't hand-write focus handling, keyboard handling or ARIA attributes. Style states with its data attributes (`data-hovered:`, `data-focus-visible:`, `data-disabled:`).
- **Motion comes from the `motion-*` utilities** in `styles.css` (`motion-pop`, `motion-sheet`, `motion-float`, `motion-rise`, `motion-press`), which use the duration and easing tokens, so everything of one kind moves the same way and stops for people who ask for less motion. Don't write a one-off animation in a part.
- **Icons are Lucide**, passed as a prop and hidden from screen readers. The words carry the meaning.
- **No words of its own.** A part shows the text it is given; it has no built-in English.
- **Registry in sync.** Add the part to `component-registry.json` (group, description, example, `uses`) and export it from the layer's `index.ts`. The story title is `Components/<group>/<Name>` or `Patterns/<group>/<Name>`.
- **Every part is tested** for what it does with a keyboard and a pointer, and with `expectAccessible()`. Every story must pass WCAG 2.1 AA in light and dark (`check:stories`). A story that shows something open (a dialog, a list, a tooltip) is tagged `['!autodocs', 'overlay']`, so it is checked once open and kept off the docs page.
- **Something missing?** Add it to `cms-ui` first, with its six files, then use it. Don't build a one-off in a screen.

## Screen rules (`cms-admin`)

ESLint fails when one of these is broken.

- **Screens are built only from `@velocity/cms-ui`.** No `className`, no `style`, no HTML elements, no imports of React Aria or Tailwind. If a part is missing, add it to `cms-ui` first.
- **No words in screens.** Every string a person reads lives in `src/messages/en.ts` and is read with `useMessages()`. A message with a value in it is a function.
- **The server is reached only through `AdminClient`,** and screens call it only through the hooks in `client/queries.ts`, so each request has one cache key.
- **Addresses come from `app/paths.ts`.** Don't write a path by hand in a screen. Go to one with `useGo()` (`app/use-go.ts`), so every change of screen moves the same way.
- **A dialog is seen leaving.** One made anew each time it opens closes with `useClosing(onClose)` (`lib/use-closing.ts`) and is taken away once it has gone, not unmounted while open.
- **Every request has three states on screen:** loading, failed (with what went wrong and a way to try again) and done, which includes an empty state. Loading is `LoadingState` with the `shape` of what is on its way (`app/RequestState.tsx`), so the screen keeps its layout; a spinner is only for before there is a layout to keep.
- **No switch on field type here either.** A field is drawn by the control registered under its field type's `editor` name (`fields/controls.tsx`), and set up in the builder by the settings registered under its type (`fields/settings.tsx`). A new kind of field is a new control, registered; a field with no control is shown by name with a note, and its content is kept.
- **A form holds what was typed; the server holds what is saved.** Send `expectedRevision` with every save, show a refusal's `issues` on the fields they name, and never drop what the person typed because a request failed.
- **Screens are tested through the whole app** with `renderApp(path, …)` against `MemoryAdminClient`: find things by role and name, act as a person would, and check what they would see.
