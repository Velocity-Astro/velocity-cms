import type { ContentTypeDef, Entry, EntryData } from '@velocity-astro/cms-core';
import * as React from 'react';
import { createContext, useContext, useEffect, useSyncExternalStore, type ComponentType, type ReactNode } from 'react';
import type { AdminClient } from '../client/admin-client.js';
import { useClient } from '../client/client-context.js';
import { usePluginEditorList } from '../client/queries.js';
import type { FieldControl, FieldControls } from '../fields/field-control.js';
import { useFieldControls } from '../fields/field-control.js';
import { paths } from '../app/paths.js';
import { pluginUi, type PluginUi } from './plugin-ui.js';

/** A plugin's way to its own addresses on the server, `/api/cms/plugins/<name>/…`, as the person signed in. */
export interface PluginEditorClient {
  get(path: string, query?: Readonly<Record<string, string>>): Promise<unknown>;
  post(path: string, body?: unknown): Promise<unknown>;
  put(path: string, body?: unknown): Promise<unknown>;
  delete(path: string, body?: unknown): Promise<unknown>;
}

/** A screen of a plugin's own, with a place in the sidebar. */
export interface PluginScreen {
  /** Its part of the address: lower-case letters, digits and dashes. */
  readonly id: string;
  /** Its name in the sidebar and at the top of the screen. */
  readonly label: string;
  /** A sentence under the name, on what the screen is for. */
  readonly description?: string;
  readonly Component: ComponentType;
}

/** What a panel on an entry is given. */
export interface PluginEntryPanelProps {
  readonly type: ContentTypeDef;
  /** The saved entry, or `null` for one that has not been saved yet. */
  readonly entry: Entry | null;
  /** What is in the form now, by field id, saved or not. */
  readonly data: EntryData;
}

/** A card of a plugin's own beside an entry's fields. */
export interface PluginEntryPanel {
  readonly id: string;
  readonly title: string;
  /** The content types it shows on, by key. Left out, it shows on every entry. */
  readonly types?: readonly string[];
  /** Shows only on entries that have a page of their own on the site, never on a menu or the settings. */
  readonly pagesOnly?: boolean;
  readonly Component: ComponentType<PluginEntryPanelProps>;
}

/**
 * What a plugin's editor file is handed. This is the whole of what a plugin may use in the
 * editor, and every addition is a promise to plugin authors, so add to it deliberately.
 */
export interface PluginEditorApi {
  readonly name: string;
  /** The editor's own React. A plugin's file brings none: two would not share state. */
  readonly React: typeof React;
  /** The editor's design system, so a plugin's screens look and behave like the rest. */
  readonly ui: PluginUi;
  readonly client: PluginEditorClient;
  /** Addresses in the editor, for a `ui.Link`. */
  readonly links: { entry(typeKey: string, entryId: string): string };
  readonly register: {
    /** The control for a kind of field the plugin brought, under the name its field type gives as `editor`. */
    control(control: FieldControl): void;
    screen(screen: PluginScreen): void;
    entryPanel(panel: PluginEntryPanel): void;
  };
}

/** A plugin's editor file: its default export is run once, when the editor starts or the plugin is activated. */
export interface PluginEditorModule {
  readonly default: (editor: PluginEditorApi) => void;
}

/** Fetches a plugin's editor file by the plugin's name. */
export type PluginEditorLoader = (name: string) => Promise<PluginEditorModule>;

/** Loads the file the site serves beside the editor. */
export function sitePluginEditors(adminPath: string): PluginEditorLoader {
  const base = adminPath.endsWith('/') ? adminPath.slice(0, -1) : adminPath;
  return (name) => import(/* @vite-ignore */ new URL(`${base}/plugins/${encodeURIComponent(name)}.js`, location.origin).href) as Promise<PluginEditorModule>;
}

const PART = /^[a-z][a-z0-9-]{0,39}$/;

export interface PlacedScreen extends PluginScreen {
  readonly plugin: string;
}
export interface PlacedPanel extends PluginEntryPanel {
  readonly plugin: string;
}

interface Extensions {
  readonly screens: readonly PlacedScreen[];
  readonly panels: readonly PlacedPanel[];
  /** Why a plugin's editor file added nothing, by plugin. */
  readonly problems: ReadonlyMap<string, string>;
  /** The plugins whose file has been run, or has failed. */
  readonly settled: ReadonlySet<string>;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Everything plugins have added to this editor. One per app. */
export class PluginExtensions {
  #state: Extensions = { screens: [], panels: [], problems: new Map(), settled: new Set() };
  readonly #started = new Set<string>();
  readonly #listeners = new Set<() => void>();

  readonly subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => void this.#listeners.delete(listener);
  };

  readonly snapshot = () => this.#state;

  #set(next: Partial<Extensions>): void {
    this.#state = { ...this.#state, ...next };
    for (const listener of this.#listeners) listener();
  }

  /** Runs each named plugin's editor file once, and takes away what plugins no longer named had added. */
  follow(names: readonly string[], parts: { loader: PluginEditorLoader; client: AdminClient; controls: FieldControls }): void {
    const wanted = new Set(names);
    const gone = [...this.#started].filter((name) => !wanted.has(name));
    if (gone.length > 0) {
      for (const name of gone) this.#started.delete(name);
      this.#set({
        screens: this.#state.screens.filter((screen) => wanted.has(screen.plugin)),
        panels: this.#state.panels.filter((panel) => wanted.has(panel.plugin)),
        problems: new Map([...this.#state.problems].filter(([name]) => wanted.has(name))),
        settled: new Set([...this.#state.settled].filter((name) => wanted.has(name))),
      });
    }
    for (const name of names) {
      if (this.#started.has(name)) continue;
      this.#started.add(name);
      void this.#run(name, parts);
    }
  }

  async #run(name: string, { loader, client, controls }: { loader: PluginEditorLoader; client: AdminClient; controls: FieldControls }): Promise<void> {
    const screens: PlacedScreen[] = [];
    const panels: PlacedPanel[] = [];
    const named = (what: string, id: unknown) => {
      if (typeof id !== 'string' || !PART.test(id)) throw new Error(`A ${what} needs an id of lower-case letters, digits and dashes, and "${String(id)}" is not one.`);
    };
    const api: PluginEditorApi = {
      name,
      React,
      ui: pluginUi,
      client: {
        get: (path, query) => client.callPlugin(name, 'GET', path, query ? { query } : {}),
        post: (path, body) => client.callPlugin(name, 'POST', path, { body }),
        put: (path, body) => client.callPlugin(name, 'PUT', path, { body }),
        delete: (path, body) => client.callPlugin(name, 'DELETE', path, { body }),
      },
      links: { entry: (typeKey, entryId) => paths.entry(typeKey, entryId) },
      register: {
        // A control registered before, when the plugin was last active, is still there.
        control: (control) => void (controls.has(control.type) || controls.register(control)),
        screen: (screen) => {
          named('screen', screen.id);
          screens.push({ ...screen, plugin: name });
        },
        entryPanel: (panel) => {
          named('panel', panel.id);
          panels.push({ ...panel, plugin: name });
        },
      },
    };
    let problem: string | null = null;
    try {
      const module = await loader(name);
      if (typeof module.default !== 'function') throw new Error('Its editor file has no default export to run.');
      module.default(api);
    } catch (error) {
      problem = messageOf(error);
    }
    // Switched off while its file was on the way: nothing of it is shown.
    if (!this.#started.has(name)) return;
    this.#set({
      // A file that failed part of the way adds nothing, so a plugin is never half there.
      ...(problem === null && { screens: [...this.#state.screens, ...screens], panels: [...this.#state.panels, ...panels] }),
      ...(problem !== null && { problems: new Map([...this.#state.problems, [name, problem]]) }),
      settled: new Set([...this.#state.settled, name]),
    });
  }
}

const ExtensionsContext = createContext<{ extensions: PluginExtensions; loader: PluginEditorLoader } | null>(null);

export interface PluginExtensionsProviderProps {
  readonly extensions: PluginExtensions;
  readonly loader: PluginEditorLoader;
  readonly children: ReactNode;
}

export function PluginExtensionsProvider({ extensions, loader, children }: PluginExtensionsProviderProps) {
  return <ExtensionsContext value={{ extensions, loader }}>{children}</ExtensionsContext>;
}

function useExtensionsContext() {
  const context = useContext(ExtensionsContext);
  if (!context) throw new Error('Plugin extensions were asked for outside <AdminApp>. Render the screen inside it.');
  return context;
}

/** What plugins have added to the editor so far. */
export function usePluginExtensions(): Extensions {
  const { extensions } = useExtensionsContext();
  return useSyncExternalStore(extensions.subscribe, extensions.snapshot, extensions.snapshot);
}

/**
 * Loads the editor file of every running plugin that has one, for the person signed in. Answers
 * whether they have all been run, so the frame can wait a moment and no screen is drawn before
 * a plugin's control for one of its fields is there. A plugin whose file fails is left out, and
 * the editor carries on.
 */
export function useLoadPluginEditors(isSignedIn: boolean): boolean {
  const { extensions, loader } = useExtensionsContext();
  const client = useClient();
  const controls = useFieldControls();
  const editors = usePluginEditorList(isSignedIn);
  const { settled } = usePluginExtensions();
  const names = editors.data?.map((editor) => editor.name);
  const key = names?.join(',');

  useEffect(() => {
    if (key !== undefined) extensions.follow(key === '' ? [] : key.split(','), { loader, client, controls });
  }, [key, extensions, loader, client, controls]);

  // The list itself failing must not keep anyone out of the editor.
  if (!isSignedIn || editors.isError) return true;
  return names !== undefined && names.every((name) => settled.has(name));
}
