import type { AccessControl, Actor, Permission } from './access.js';
import type { PublishCheck, PublishChecks } from './checks.js';
import { defineFields, type NewField } from './define-fields.js';
import { CmsError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors.js';
import { EVENT_NEEDS, type CmsEvents, type EventBus } from './events.js';
import type { FieldType } from './field-type.js';
import type { PageHeadRule, PageHeads, PageRedirectRule } from './pages.js';
import { liveFields, type EntryData, type FieldDef, type LocalizedText, type Timestamp } from './model.js';
import { isPrivateAddress } from './net.js';
import type { Clock, IdGenerator, NameLookup, PluginStore } from './ports.js';
import type { Registry } from './registry.js';
import { SecretSeal } from './seal.js';
import { toPublicData, validateData } from './schema-builder.js';
import type { ContentService } from './services/content-service.js';
import type { SchemaService } from './services/schema-service.js';

/** The version of the plugin surface this CMS offers. A plugin says which one it was written for. */
export const PLUGIN_API_VERSION = 1;

/** What a plugin may ask for. People are never a plugin's to manage, and neither are other plugins. */
export const PLUGIN_PERMISSIONS: readonly Permission[] = ['schema:write', 'entry:read', 'entry:write', 'entry:publish', 'submission:read', 'contact:read'];

const NAME = /^[a-z][a-z0-9-]{0,39}$/;

/**
 * A plugin, as its package describes it. Plain data and one function: write it with
 * `definePlugin`, and name its file or package in the site's `plugins`.
 *
 * ```ts
 * export default definePlugin({
 *   name: 'ratings',
 *   apiVersion: 1,
 *   label: { en: 'Ratings' },
 *   setup(cms) {
 *     cms.fields.register(new RatingField());
 *   },
 * });
 * ```
 */
export interface PluginDefinition {
  /** What the plugin is called everywhere: lower-case letters, digits and dashes, starting with a letter. */
  readonly name: string;
  /** The plugin surface it was written for. See `PLUGIN_API_VERSION`. */
  readonly apiVersion: number;
  /** Its name as people read it. */
  readonly label: LocalizedText;
  readonly description?: LocalizedText;
  /** The plugin's own version, shown beside its name. */
  readonly version?: string;
  /** What it does to content, as itself. Leave out for a plugin that changes nothing. */
  readonly permissions?: readonly Permission[];
  /**
   * What an owner can set, described as fields are. The editor draws the form, and the plugin
   * reads the answers with `cms.settings.get()`. A key or a password does not belong here: name
   * it in `secrets`.
   */
  readonly settings?: readonly NewField[];
  /**
   * The keys and passwords an owner gives the plugin, such as another service's API key. Each is
   * kept sealed, is never sent back to the editor once saved, and is read with
   * `cms.secrets.get(key)`.
   */
  readonly secrets?: readonly PluginSecretDef[];
  /**
   * Whether it runs before an owner has chosen. A plugin a developer named in the site's config
   * does, which is the default. A plugin that ships with the CMS says `false`: it is listed as
   * available, and an owner activates it in the editor.
   */
  readonly enabledByDefault?: boolean;
  /**
   * What the plugin adds to the editor, as the text of one prebuilt JavaScript module. The site
   * serves it at `/admin/plugins/<name>.js` while the plugin is on, and the editor runs its
   * default export with `{ React, ui, client, register }`. It must bring no React of its own:
   * it uses the one it is handed. In a site's own plugin, `import editor from './editor.js?raw'`.
   */
  readonly editor?: string;
  /** Runs when the plugin is switched on: at the site's start, or when an owner activates it. Whatever it throws switches the plugin off. */
  setup(cms: PluginContext): void | Promise<void>;
}

/** A key or a password a plugin asks an owner for. */
export interface PluginSecretDef {
  readonly key: string;
  readonly label: LocalizedText;
  readonly help?: LocalizedText;
}

/** A secret as the editor is told of it: whether one is saved, never what it is. */
export interface PluginSecretInfo extends PluginSecretDef {
  readonly isSet: boolean;
}

/** `waiting`: to be tried, or tried again. `done`: it worked. `failed`: given up on after the last try. */
export type PluginTaskStatus = 'waiting' | 'done' | 'failed';

/** One piece of work a plugin asked to have done, as an owner sees it. What it carried is never shown. */
export interface PluginTask {
  readonly id: string;
  /** The kind of work, as the plugin named it. */
  readonly kind: string;
  /** What it is, in the plugin's words, such as the address something is sent to. Never anyone's data. */
  readonly label?: string;
  readonly status: PluginTaskStatus;
  /** How many times it has been tried. */
  readonly attempts: number;
  readonly createdAt: Timestamp;
  /** When it is tried next, while it waits. */
  readonly nextAt?: Timestamp;
  readonly finishedAt?: Timestamp;
  /** Why the last try failed. */
  readonly lastError?: string;
  /** Whether an owner can have a failed one tried again: what it carried is still kept. */
  readonly canRetry: boolean;
}

/** Does one piece of work. Whatever it throws counts as a failed try, and the work is tried again later. */
export type PluginTaskRunner = (payload: unknown, task: { readonly id: string; readonly attempt: number }) => void | Promise<void>;

/** How long after each failed try the next one waits. After the last, the work is given up on. */
export const TASK_RETRY_AFTER_MS: readonly number[] = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000];
/** How long a failed piece of work keeps what it carried, so an owner can have it tried again. */
export const TASK_KEPT_MS = 7 * 24 * 3_600_000;
/** How many finished pieces of work a plugin's history shows. */
export const TASK_HISTORY = 50;

/** Gives a plugin's description its type, and nothing else. */
export function definePlugin(plugin: PluginDefinition): PluginDefinition {
  return plugin;
}

/**
 * What a plugin is handed in `setup`: the CMS's public surface, and no more. Everything a plugin
 * changes goes through the same services as the editor, as `actor`.
 */
export interface PluginContext {
  readonly name: string;
  /** Who the plugin is when it calls a service. It holds the permissions the plugin declared. */
  readonly actor: Actor;
  /** Adds a kind of field. It registers exactly as the built-in ones do. */
  readonly fields: { register(type: FieldType): void };
  /** Listens to what happens. A listener that fails is caught and noted; the change it heard of stands. */
  readonly events: { on<K extends keyof CmsEvents>(event: K, listener: (payload: CmsEvents[K]) => void | Promise<void>): () => void };
  /**
   * Adds a rule an entry must pass before it is published. It answers with what is wrong, by
   * field key, and the editor shows each on its field. A check that fails by accident is caught
   * and noted, and does not hold the publish back.
   */
  readonly checks: { add(when: 'publish', check: PublishCheck): () => void };
  /** What the owner set, by field key. Read it when it is needed, not once in `setup`: it can change. */
  readonly settings: { get(): Promise<Record<string, unknown>> };
  /**
   * Small values of the plugin's own, kept in the site's database. No other plugin can read them.
   * `list` gives every value whose key starts with `prefix`, by key.
   */
  readonly store: {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
    remove(key: string): Promise<void>;
    list(prefix: string): Promise<Record<string, unknown>>;
  };
  /** What the owner saved under one of the plugin's `secrets`, or `undefined` when nothing is. Read it when it is needed. */
  readonly secrets: { get(key: string): Promise<string | undefined> };
  /**
   * The world outside the site. `isPublic` says whether a host's name leads only to public
   * addresses: ask before sending anything to an address a person typed, since a public name can
   * point at a machine beside the site. A site that cannot look names up answers yes; a name that
   * leads nowhere, or anywhere private, answers no.
   */
  readonly net: { isPublic(host: string): Promise<boolean> };
  /**
   * Work that must not be lost when it fails once, such as sending something to another service.
   * `define` names a kind of work and what does it; `add` asks for one piece of it. It is tried
   * at once, and when the runner throws, again after a minute, then at longer waits for about a
   * day, before it is given up on. An owner sees each piece under Plugins, by its `label`, and
   * can have a failed one tried again. What it carries (`payload`, anything JSON can hold) is
   * kept in the site's database until the work is done. A piece of work may run twice, so give
   * the other side its `id` to tell.
   */
  readonly tasks: {
    define(kind: string, run: PluginTaskRunner): void;
    add(kind: string, payload: unknown, options?: { readonly label?: string }): Promise<void>;
  };
  /**
   * The site's pages. `head` adds a rule that changes what a page says about itself to search
   * engines and to the sites it is shared on: its title, its description, whether it is listed,
   * its share picture, the codes that prove who owns the site, and the ids it is measured with.
   * A rule that fails is caught and noted, and the page is drawn without it. `redirect` adds a
   * rule that sends a visitor from an address that has no page to another. `changed` tells the
   * site that pages would now come out differently, so it stops showing the ones it kept.
   */
  readonly pages: { head(rule: PageHeadRule): () => void; redirect(rule: PageRedirectRule): () => void; changed(): Promise<void> };
  /**
   * Answers requests at `/api/cms/plugins/<name><path>`, for the plugin's screens in the editor.
   * Only signed-in people reach it, and only those who hold `requires` (reading content, unless
   * it says otherwise). Whatever the handler returns is sent as JSON.
   */
  readonly routes: { add(method: PluginRouteMethod, path: string, handler: PluginRouteHandler, options?: { readonly requires?: Permission }): void };
  readonly schema: SchemaService;
  readonly content: ContentService;
}

export type PluginRouteMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

/** A request to one of a plugin's own addresses. */
export interface PluginRequest {
  /** The person who asked. Pass it to a service to act as them, with what they may do. */
  readonly actor: Actor;
  /** The parts of the address the path named, such as `id` for `/items/:id`. */
  readonly params: Readonly<Record<string, string>>;
  readonly query: Readonly<Record<string, string>>;
  /** What was sent, already read from JSON. Check its shape before using it. */
  readonly body: unknown;
}

export type PluginRouteHandler = (request: PluginRequest) => unknown;

/** A plugin failed while answering a request. The person is told that much, and the owner sees the rest under Plugins. */
export class PluginFailedError extends CmsError {
  readonly code = 'plugin_failed';
}

/**
 * `on`: running. `off`: available, and not switched on. `failed`: its setup threw.
 * `unsupported`: written for a plugin surface this CMS does not have. `invalid`: not a plugin, or misnamed.
 */
export type PluginStatus = 'on' | 'off' | 'failed' | 'unsupported' | 'invalid';

/** A plugin's settings: the fields the editor draws, and what is set, by field id as entry data is. */
export interface PluginSettings {
  readonly fields: readonly FieldDef[];
  readonly values: EntryData;
  /** The keys and passwords it asks for, and whether each is saved. */
  readonly secrets: readonly PluginSecretInfo[];
}

/** Something a running plugin got wrong after it started. */
export interface PluginFault {
  readonly at: Timestamp;
  /** Where it happened, such as `entry.published`. */
  readonly where: string;
  readonly message: string;
}

/** What a running plugin has added on the server. Empty for one that is off. */
export interface PluginAdds {
  /** The kinds of field it brought, by name. */
  readonly fieldTypes: readonly string[];
  /** How many rules it checks before a publish. */
  readonly checks: number;
  /** Whether it changes what pages say about themselves: to search engines, social sites and analytics. */
  readonly pageHead: boolean;
  /** Whether it moves visitors from addresses that have no page. */
  readonly redirects: boolean;
  /** What it listens for, such as `entry.published`. */
  readonly events: readonly string[];
  /** The kinds of work it has that are tried again when they fail. */
  readonly tasks: readonly string[];
}

/** A plugin that adds to the editor, as the editor needs to know it to load its file. */
export interface PluginEditorInfo {
  readonly name: string;
  readonly label: LocalizedText;
}

const NOTHING_ADDED: PluginAdds = { fieldTypes: [], checks: 0, pageHead: false, redirects: false, events: [], tasks: [] };

/** A plugin as the Plugins screen shows it. */
export interface PluginInfo {
  readonly name: string;
  readonly label: LocalizedText;
  readonly description?: LocalizedText;
  readonly version?: string;
  readonly permissions: readonly Permission[];
  readonly status: PluginStatus;
  /** Whether it has settings for an owner to fill in. */
  readonly hasSettings: boolean;
  /** Whether it adds anything to the editor: screens, panels on an entry, controls. */
  readonly hasEditor: boolean;
  /** What it does on the server while it is on, so an owner can see what activating it means. */
  readonly adds: PluginAdds;
  /** Why it is not on, and what to do about it. */
  readonly problem?: string;
  /** How many times it has failed since the site started, and the last time. */
  readonly faults: number;
  readonly lastFault?: PluginFault;
}

export interface PluginHostParts {
  readonly fields: Registry<FieldType>;
  readonly events: EventBus;
  readonly checks: PublishChecks;
  readonly pages: PageHeads;
  readonly store: PluginStore;
  readonly ids: IdGenerator;
  readonly schema: SchemaService;
  readonly content: ContentService;
  readonly access: AccessControl;
  readonly clock: Clock;
  /** The site's secret. What an owner saves under a plugin's `secrets` is sealed with it; without one, none can be saved. */
  readonly secret?: string;
  /** How the site looks a host's name up, where it can. See `PluginContext.net`. */
  readonly lookup?: NameLookup;
  /** Told of every plugin failure, for the server's log. */
  readonly onFault?: (plugin: string, error: unknown) => void;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const segmentsOf = (path: string) => path.split('/').filter(Boolean);

/** Where the host keeps its own notes about a plugin. A plugin's own keys sit under `data:`, so they can never be one of these. */
const ENABLED = 'enabled';
const SETTINGS = 'settings';
const FIELDS = 'fields';
const SECRET = 'secret:';
const TASK = 'task:';
const OWN = 'data:';
/** How often waiting work is looked for, and how much of it one look takes on. */
const WORK_EVERY_MS = 30_000;
const WORK_AT_ONCE = 5;
const LONGEST_SECRET = 2000;
const LONGEST_TASK_ERROR = 300;

/** A piece of work as it is kept: what an owner sees, and what it carries. */
interface StoredTask extends Omit<PluginTask, 'canRetry'> {
  readonly payload?: unknown;
}

const isTask = (value: unknown): value is StoredTask => isRecord(value) && typeof value['id'] === 'string' && typeof value['kind'] === 'string' && typeof value['status'] === 'string';
const shown = ({ payload, ...task }: StoredTask): PluginTask => ({ ...task, canRetry: task.status === 'failed' && payload !== undefined });
/** How long one running copy of the site may go without asking whether a plugin was switched on or off elsewhere. */
const SYNC_EVERY_MS = 5000;

interface PluginRoute {
  readonly method: PluginRouteMethod;
  readonly segments: readonly string[];
  readonly handler: PluginRouteHandler;
  readonly requires: Permission;
}

/** Everything the host holds about one plugin. `info` is the part that is shown. */
interface Held {
  info: PluginInfo;
  readonly definition?: PluginDefinition;
  /** What undoes each thing the plugin began: a listener, a check. */
  stops: (() => void)[];
  routes: PluginRoute[];
  /** Its settings as stored fields. A field keeps its id by key, as a content type's does. */
  fields: FieldDef[];
  /** The field types it has registered, which stay registered while the site runs. */
  readonly registered: Set<string>;
  /** What does each kind of work it defined. */
  readonly runners: Map<string, PluginTaskRunner>;
}

/**
 * Starts a site's plugins and keeps track of how each is doing. A plugin that cannot start is
 * switched off and the site carries on without it: one bad plugin never takes the editor or the
 * pages down with it.
 *
 * Whether a plugin is on is kept in the database, so an owner switches it in the editor and
 * every running copy of the site follows within a few seconds, with no rebuild.
 */
export class PluginHost {
  readonly #parts: PluginHostParts;
  readonly #plugins = new Map<string, Held>();
  #syncedAt = 0;
  #syncing: Promise<void> | null = null;
  #workedAt = 0;
  #working: Promise<void> | null = null;
  readonly #seal: SecretSeal;

  constructor(parts: PluginHostParts) {
    this.#parts = parts;
    this.#seal = new SecretSeal(parts.secret, 'velocity-cms plugin secrets');
  }

  /**
   * Takes in each plugin, in order, and runs the `setup` of those that are switched on. What it
   * is given comes from the site's own files, so anything may be in it: each is checked before
   * it is trusted with a name.
   */
  async load(plugins: readonly unknown[]): Promise<void> {
    for (const [index, plugin] of plugins.entries()) {
      const held = this.#take(plugin, index);
      if (!held?.definition) continue;
      const chosen = await this.#parts.store.get(held.info.name, ENABLED);
      if (typeof chosen === 'boolean' ? chosen : held.definition.enabledByDefault !== false) await this.#run(held);
      else held.info = { ...held.info, status: 'off' };
      await this.#describeSettings(held);
    }
    this.#syncedAt = Date.now();
  }

  /** Every plugin the site has, by name, whether or not it is running. Owners only. */
  async list(actor: Actor): Promise<PluginInfo[]> {
    this.#parts.access.require(actor, 'plugin:manage');
    await this.#sync();
    await this.work();
    return [...this.#plugins.values()].map((held) => held.info).sort((a, b) => a.name.localeCompare(b.name));
  }

  /** The running plugins that add to the editor, for anyone signed in: the editor loads each one's file. */
  async editors(actor: Actor): Promise<PluginEditorInfo[]> {
    this.#parts.access.require(actor, 'entry:read');
    await this.#sync();
    return [...this.#plugins.values()]
      .filter((held) => held.info.status === 'on' && held.info.hasEditor)
      .map((held) => ({ name: held.info.name, label: held.info.label }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** The text of a running plugin's editor file, or `null` when there is none to serve. */
  async editorFile(name: string): Promise<string | null> {
    await this.#sync();
    const held = this.#plugins.get(name);
    return held?.info.status === 'on' && held.info.hasEditor ? (held.definition?.editor ?? null) : null;
  }

  /** Switches a plugin on or off, for every running copy of the site. Owners only. */
  async setEnabled(actor: Actor, name: string, enabled: boolean): Promise<PluginInfo> {
    this.#parts.access.require(actor, 'plugin:manage');
    const held = this.#held(name);
    if (!held.definition) throw new ConflictError(held.info.problem ?? `The plugin "${name}" cannot be switched on.`);
    await this.#parts.store.set(name, ENABLED, enabled);
    await this.#apply(held, enabled);
    await this.#parts.events.emit('plugin.changed', { plugin: name, actor });
    return held.info;
  }

  /** A plugin's settings, to fill in. Owners only. */
  async settings(actor: Actor, name: string): Promise<PluginSettings> {
    this.#parts.access.require(actor, 'plugin:manage');
    const held = this.#held(name);
    return { fields: liveFields(held.fields), values: await this.#stored(name), secrets: await this.#secrets(held) };
  }

  /**
   * Saves one of a plugin's secrets, or with `null` takes it away. It is sealed with the site's
   * secret before it is kept, and nothing ever sends it back. Owners only.
   */
  async setSecret(actor: Actor, name: string, key: string, value: string | null): Promise<PluginSettings> {
    this.#parts.access.require(actor, 'plugin:manage');
    const held = this.#held(name);
    if (!(held.definition?.secrets ?? []).some((secret) => secret.key === key)) throw new NotFoundError('Plugin secret', `${name}/${key}`);
    if (value === null) await this.#parts.store.remove(name, `${SECRET}${key}`);
    else {
      const text = value.trim();
      if (text === '' || text.length > LONGEST_SECRET) {
        throw new ValidationError(`"${key}" cannot be saved: ${text === '' ? 'it is empty. Paste the key or password, or remove the one that is saved.' : `it is longer than ${LONGEST_SECRET} characters.`}`, [{ path: [key], message: text === '' ? 'Fill this in.' : 'This is too long.' }]);
      }
      await this.#parts.store.set(name, `${SECRET}${key}`, await this.#seal.seal(text));
    }
    await this.#parts.events.emit('plugin.changed', { plugin: name, actor });
    return this.settings(actor, name);
  }

  /** A plugin's work, newest first: what waits, what was done and what was given up on. Owners only. */
  async tasks(actor: Actor, name: string): Promise<PluginTask[]> {
    this.#parts.access.require(actor, 'plugin:manage');
    const held = this.#held(name);
    await this.work();
    return (await this.#tasksOf(held.info.name)).reverse().map(shown);
  }

  /** Has a piece of work that was given up on tried again, now. Owners only. */
  async retryTask(actor: Actor, name: string, id: string): Promise<PluginTask> {
    this.#parts.access.require(actor, 'plugin:manage');
    const held = this.#held(name);
    const task = await this.#parts.store.get(name, `${TASK}${id}`);
    if (!isTask(task)) throw new NotFoundError('Plugin task', id);
    if (task.status !== 'failed' || task.payload === undefined) throw new ConflictError('Only work that was given up on, and whose content is still kept, can be tried again.');
    if (held.info.status !== 'on') throw new ConflictError(`The plugin "${name}" is switched off. Activate it, then try again.`);
    const { finishedAt: _gone, ...rest } = task;
    return shown(await this.#attempt(held, { ...rest, status: 'waiting', attempts: 0 }));
  }

  /**
   * Tries the work that is due, for every running plugin. It is called wherever plugins are used,
   * at most every half minute; a host with a clock of its own (a scheduled job) may call it too,
   * with `now` to look whenever it asks.
   */
  async work(options: { readonly now?: boolean } = {}): Promise<void> {
    if (options.now !== true && Date.now() - this.#workedAt < WORK_EVERY_MS) return;
    this.#working ??= (async () => {
      try {
        const now = this.#parts.clock.now();
        for (const held of this.#plugins.values()) {
          if (held.info.status !== 'on' || held.runners.size === 0) continue;
          const tasks = await this.#tasksOf(held.info.name);
          for (const task of tasks.filter((candidate) => candidate.status === 'waiting' && (candidate.nextAt ?? '') <= now).slice(0, WORK_AT_ONCE)) await this.#attempt(held, task);
          await this.#tidy(held.info.name, tasks, now);
        }
      } catch (error) {
        // Work that could not be looked for is looked for again next time.
        this.#parts.onFault?.('tasks', error);
      } finally {
        this.#workedAt = Date.now();
        this.#working = null;
      }
    })();
    await this.#working;
  }

  /** Saves a plugin's settings, checked as an entry's fields are when it is published. Owners only. */
  async saveSettings(actor: Actor, name: string, values: unknown): Promise<PluginSettings> {
    this.#parts.access.require(actor, 'plugin:manage');
    const held = this.#held(name);
    let checked: EntryData;
    try {
      checked = validateData(liveFields(held.fields), values, { fields: this.#parts.fields, mode: 'publish' });
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
      // The same problems, in words about settings: `validateData` speaks of an entry.
      throw new ValidationError(`These settings cannot be saved yet: ${error.issues[0]?.message ?? 'something is not filled in correctly.'}`, error.issues.map((issue) => (issue.message === 'Fill this in before publishing.' ? { ...issue, message: 'Fill this in.' } : issue)));
    }
    await this.#parts.store.set(name, SETTINGS, checked);
    await this.#parts.events.emit('plugin.changed', { plugin: name, actor });
    return { fields: liveFields(held.fields), values: checked, secrets: await this.#secrets(held) };
  }

  /**
   * Hands a request to one of a plugin's own addresses, as the person who asked. A plugin that
   * is off has no addresses. A refusal the plugin raises on purpose (a `CmsError`) keeps its
   * words; anything else it throws is the plugin's fault, noted, and answered without detail.
   */
  async call(actor: Actor, name: string, method: string, path: string, input: { readonly query: Readonly<Record<string, string>>; readonly body: unknown }): Promise<unknown> {
    await this.#sync();
    const held = this.#plugins.get(name);
    if (!held || held.info.status !== 'on') throw new NotFoundError('Plugin', name);
    const segments = segmentsOf(path);
    for (const route of held.routes) {
      if (route.method !== method) continue;
      const params = capture(route.segments, segments);
      if (!params) continue;
      this.#parts.access.require(actor, route.requires);
      try {
        return await route.handler({ actor, params, query: input.query, body: input.body });
      } catch (error) {
        if (error instanceof CmsError) throw error;
        this.#fault(name, `${method} ${path}`, error);
        throw new PluginFailedError(`The plugin "${name}" could not answer. An owner can see what went wrong under Plugins.`);
      }
    }
    throw new NotFoundError('Plugin address', `${method} /${name}/${segments.join('/')}`);
  }

  /** A plugin's work as it is kept, oldest first. */
  async #tasksOf(name: string): Promise<StoredTask[]> {
    return (await this.#parts.store.list(name, TASK)).map(([, value]) => value).filter(isTask);
  }

  /** Tries one piece of work, and keeps how it went. */
  async #attempt(held: Held, task: StoredTask): Promise<StoredTask> {
    const { name } = held.info;
    const attempts = task.attempts + 1;
    const { nextAt: _was, lastError: _before, ...rest } = task;
    let next: StoredTask;
    try {
      const run = held.runners.get(task.kind);
      if (!run) throw new Error(`The plugin no longer does "${task.kind}".`);
      await run(task.payload, { id: task.id, attempt: attempts });
      // Done: what it carried is not kept a moment longer.
      const { payload: _sent, ...done } = rest;
      next = { ...done, status: 'done', attempts, finishedAt: this.#parts.clock.now() };
    } catch (error) {
      const lastError = messageOf(error).slice(0, LONGEST_TASK_ERROR);
      const wait = TASK_RETRY_AFTER_MS[attempts - 1];
      if (wait === undefined) {
        next = { ...rest, status: 'failed', attempts, lastError, finishedAt: this.#parts.clock.now() };
        this.#fault(name, `task ${task.kind}`, error);
      } else {
        next = { ...rest, status: 'waiting', attempts, lastError, nextAt: new Date(Date.parse(this.#parts.clock.now()) + wait).toISOString() };
      }
    }
    await this.#parts.store.set(name, `${TASK}${task.id}`, next);
    return next;
  }

  /** Forgets finished work beyond what the history shows, and what failed work carried once it is too old to try again. */
  async #tidy(name: string, tasks: readonly StoredTask[], now: Timestamp): Promise<void> {
    const finished = tasks.filter((task) => task.status !== 'waiting');
    for (const task of finished.slice(0, Math.max(0, finished.length - TASK_HISTORY))) await this.#parts.store.remove(name, `${TASK}${task.id}`);
    const before = new Date(Date.parse(now) - TASK_KEPT_MS).toISOString();
    for (const task of finished.slice(-TASK_HISTORY)) {
      if (task.status !== 'failed' || task.payload === undefined || (task.finishedAt ?? now) > before) continue;
      const { payload: _old, ...kept } = task;
      await this.#parts.store.set(name, `${TASK}${task.id}`, kept);
    }
  }

  async #secrets(held: Held): Promise<PluginSecretInfo[]> {
    const saved = new Set((await this.#parts.store.list(held.info.name, SECRET)).map(([key]) => key.slice(SECRET.length)));
    return (held.definition?.secrets ?? []).map((secret) => ({ ...secret, isSet: saved.has(secret.key) }));
  }

  #held(name: string): Held {
    const held = this.#plugins.get(name);
    if (!held) throw new NotFoundError('Plugin', name);
    return held;
  }

  async #stored(name: string): Promise<EntryData> {
    const stored = await this.#parts.store.get(name, SETTINGS);
    return isRecord(stored) ? stored : {};
  }

  /** Checks what was handed over and gives it a row, runnable or not. */
  #take(plugin: unknown, index: number): Held | null {
    const given = isRecord(plugin) ? plugin : {};
    const name = typeof given['name'] === 'string' && NAME.test(given['name']) ? given['name'] : null;
    // Something without a usable name still gets a row, so the owner sees that it was left out.
    const fallback = `plugin-${index + 1}`;
    const label = isRecord(given['label']) ? (given['label'] as LocalizedText) : { en: name ?? fallback };
    const refuse = (status: PluginStatus, problem: string, as = name ?? fallback) => {
      this.#plugins.set(as, { info: { name: as, label, permissions: [], status, hasSettings: false, hasEditor: false, adds: NOTHING_ADDED, problem, faults: 0 }, stops: [], routes: [], fields: [], registered: new Set(), runners: new Map() });
      this.#parts.onFault?.(as, new Error(problem));
      return null;
    };

    if (name === null) {
      return refuse('invalid', 'This is not a plugin with a usable name. Its file must export `definePlugin({ name, apiVersion, label, setup })` as its default, and the name may hold lower-case letters, digits and dashes.');
    }
    if (this.#plugins.has(name)) {
      return refuse('invalid', `Another plugin is already called "${name}". Remove one of them from the site's \`plugins\`.`, `${name}-${index + 1}`);
    }
    if (typeof given['setup'] !== 'function') {
      return refuse('invalid', `The plugin "${name}" has no \`setup\` function. Write it with \`definePlugin\`.`);
    }
    if (given['apiVersion'] !== PLUGIN_API_VERSION) {
      return refuse(
        'unsupported',
        `The plugin "${name}" was written for plugin API version ${String(given['apiVersion'])}, and this CMS offers version ${PLUGIN_API_VERSION}. Install a version of the plugin made for it.`,
      );
    }
    const definition = plugin as PluginDefinition;
    const asked = definition.permissions ?? [];
    const refused = asked.filter((permission) => !PLUGIN_PERMISSIONS.includes(permission));
    if (refused.length > 0) {
      return refuse('invalid', `The plugin "${name}" asks for ${refused.map((permission) => `"${permission}"`).join(', ')}, which no plugin may have. A plugin may ask for: ${PLUGIN_PERMISSIONS.join(', ')}.`);
    }

    const held: Held = {
      info: {
        name,
        label,
        ...(definition.description !== undefined && { description: definition.description }),
        ...(definition.version !== undefined && { version: definition.version }),
        permissions: [...asked],
        status: 'off',
        hasSettings: false,
        hasEditor: typeof definition.editor === 'string' && definition.editor.length > 0,
        adds: NOTHING_ADDED,
        faults: 0,
      },
      definition,
      stops: [],
      routes: [],
      fields: [],
      registered: new Set(),
      runners: new Map(),
    };
    this.#plugins.set(name, held);
    return held;
  }

  /** Runs a plugin's `setup`. One that throws is left switched off, with the reason. */
  async #run(held: Held): Promise<void> {
    const { definition } = held;
    if (!definition) return;
    const { problem: _before, ...info } = held.info;
    held.info = { ...info, status: 'on', adds: { ...NOTHING_ADDED, fieldTypes: [...held.registered] } };
    try {
      await definition.setup(this.#context(held, definition.permissions ?? []));
    } catch (error) {
      this.#stop(held);
      held.info = { ...held.info, status: 'failed', problem: `The plugin "${held.info.name}" could not start, so it is switched off: ${messageOf(error)}` };
      this.#parts.onFault?.(held.info.name, error);
    }
  }

  /** Undoes what a plugin began to listen to, check and answer. A field type it registered stays, so content that uses it keeps working. */
  #stop(held: Held): void {
    for (const stop of held.stops) stop();
    held.stops = [];
    held.routes = [];
    held.runners.clear();
    held.info = { ...held.info, adds: NOTHING_ADDED };
  }

  /** Makes this running copy match what the owner chose. */
  async #apply(held: Held, enabled: boolean): Promise<void> {
    if (enabled && held.info.status !== 'on') {
      await this.#run(held);
      await this.#describeSettings(held);
    } else if (!enabled && held.info.status !== 'off') {
      this.#stop(held);
      const { problem: _gone, ...info } = held.info;
      held.info = { ...info, status: 'off' };
    }
  }

  /**
   * Another running copy of the site may have switched a plugin since this one last looked.
   * Asked at most every few seconds, and only where a plugin is about to be used or shown.
   */
  async #sync(): Promise<void> {
    if (Date.now() - this.#syncedAt < SYNC_EVERY_MS) return;
    this.#syncing ??= (async () => {
      try {
        for (const held of this.#plugins.values()) {
          if (!held.definition) continue;
          const chosen = await this.#parts.store.get(held.info.name, ENABLED);
          const enabled = typeof chosen === 'boolean' ? chosen : held.definition.enabledByDefault !== false;
          // One that failed to start is not tried again on every look: an owner switches it on again.
          if (enabled ? held.info.status === 'off' : held.info.status !== 'off') await this.#apply(held, enabled);
        }
      } finally {
        this.#syncedAt = Date.now();
        this.#syncing = null;
      }
    })();
    await this.#syncing;
  }

  /** Stores the plugin's settings as fields. A setting keeps its id by key, so a renamed label or a new setting loses nothing. */
  async #describeSettings(held: Held): Promise<void> {
    const described = held.definition?.settings ?? [];
    const { name } = held.info;
    try {
      const stored = await this.#parts.store.get(name, FIELDS);
      const previous = Array.isArray(stored) ? (stored as FieldDef[]) : [];
      const keys = new Set(described.map((field) => field.key));
      const fields = defineFields(described, previous, { fields: this.#parts.fields, ids: this.#parts.ids, now: this.#parts.clock.now() }).filter((field) => keys.has(field.key));
      if (JSON.stringify(fields) !== JSON.stringify(previous)) await this.#parts.store.set(name, FIELDS, fields);
      held.fields = fields;
    } catch (error) {
      held.fields = [];
      this.#fault(name, 'settings', error);
    }
    held.info = { ...held.info, hasSettings: liveFields(held.fields).length > 0 || (held.definition?.secrets ?? []).length > 0 };
  }

  #context(held: Held, permissions: readonly Permission[]): PluginContext {
    const { fields, events, checks, pages, store, schema, content, clock, ids } = this.#parts;
    const { name } = held.info;
    /** Whether the plugin still runs here, asked just before it is used. */
    const isOn = async () => {
      await this.#sync();
      return held.info.status === 'on';
    };
    return {
      name,
      // The role grants nothing by itself here: a plugin holds exactly what it declared.
      actor: { kind: 'plugin', id: name, role: 'author', permissions },
      fields: {
        register: (type) => {
          // Switched on a second time, the type it registered the first time is already there.
          if (held.registered.has(type.type)) return;
          fields.register(type);
          held.registered.add(type.type);
          held.info = { ...held.info, adds: { ...held.info.adds, fieldTypes: [...held.registered] } };
        },
      },
      events: {
        on: (event, listener) => {
          const needed = EVENT_NEEDS[event];
          if (needed !== undefined && !permissions.includes(needed)) {
            throw new ForbiddenError(`The plugin "${name}" listens for "${event}", which carries personal data. Declare "${needed}" in its permissions.`);
          }
          const stop = events.on(event, async (payload) => {
            try {
              if (await isOn()) await listener(payload);
            } catch (error) {
              this.#fault(name, event, error);
            }
          });
          held.stops.push(stop);
          if (!held.info.adds.events.includes(event)) held.info = { ...held.info, adds: { ...held.info.adds, events: [...held.info.adds.events, event] } };
          return stop;
        },
      },
      checks: {
        add: (when, check) => {
          const stop = checks.add(async (input) => {
            try {
              return (await isOn()) ? await check(input) : [];
            } catch (error) {
              this.#fault(name, `check before ${when}`, error);
              return [];
            }
          });
          held.stops.push(stop);
          held.info = { ...held.info, adds: { ...held.info.adds, checks: held.info.adds.checks + 1 } };
          return stop;
        },
      },
      settings: {
        get: async () => toPublicData(liveFields(held.fields), await this.#stored(name), { fields, mode: 'publish' }),
      },
      store: {
        get: (key) => store.get(name, `${OWN}${key}`),
        set: (key, value) => store.set(name, `${OWN}${key}`, value),
        remove: (key) => store.remove(name, `${OWN}${key}`),
        list: async (prefix) => Object.fromEntries((await store.list(name, `${OWN}${prefix}`)).map(([key, value]) => [key.slice(OWN.length), value])),
      },
      secrets: {
        get: async (key) => this.#seal.open(await store.get(name, `${SECRET}${key}`)),
      },
      net: {
        isPublic: async (host) => {
          const { lookup } = this.#parts;
          if (!lookup) return true;
          try {
            const addresses = await lookup(host);
            return addresses.length > 0 && !addresses.some(isPrivateAddress);
          } catch {
            return false;
          }
        },
      },
      tasks: {
        define: (kind, run) => {
          held.runners.set(kind, run);
          if (!held.info.adds.tasks.includes(kind)) held.info = { ...held.info, adds: { ...held.info.adds, tasks: [...held.info.adds.tasks, kind] } };
        },
        add: async (kind, payload, options) => {
          if (!held.runners.has(kind)) throw new ConflictError(`The plugin "${name}" has not defined the work "${kind}". Call \`tasks.define\` in setup first.`);
          const now = clock.now();
          // Ids sort by when the work was asked for, so the history reads in order.
          const id = `${now.replace(/\D/g, '')}-${ids.next()}`;
          await this.#attempt(held, { id, kind, ...(options?.label !== undefined && { label: options.label.slice(0, 200) }), status: 'waiting', attempts: 0, createdAt: now, nextAt: now, payload });
          await this.work();
        },
      },
      pages: {
        head: (rule) => {
          const stop = pages.add(async (page, head) => {
            try {
              return (await isOn()) ? await rule(page, head) : undefined;
            } catch (error) {
              this.#fault(name, 'page head', error);
              return undefined;
            }
          });
          held.stops.push(stop);
          held.info = { ...held.info, adds: { ...held.info.adds, pageHead: true } };
          return stop;
        },
        redirect: (rule) => {
          const stop = pages.addRedirect(async (path) => {
            try {
              return (await isOn()) ? await rule(path) : undefined;
            } catch (error) {
              this.#fault(name, 'redirect', error);
              return undefined;
            }
          });
          held.stops.push(stop);
          held.info = { ...held.info, adds: { ...held.info.adds, redirects: true } };
          return stop;
        },
        changed: () => events.emit('pages.changed', { plugin: name }),
      },
      routes: {
        add: (method, path, handler, options) => void held.routes.push({ method, segments: segmentsOf(path), handler, requires: options?.requires ?? 'entry:read' }),
      },
      schema,
      content,
    };
  }

  #fault(name: string, where: string, error: unknown): void {
    const held = this.#plugins.get(name);
    if (!held) return;
    held.info = { ...held.info, faults: held.info.faults + 1, lastFault: { at: this.#parts.clock.now(), where, message: messageOf(error) } };
    this.#parts.onFault?.(name, error);
  }
}

/** The named parts of an address when it fits a route's pattern, or `null` when it does not. */
function capture(pattern: readonly string[], segments: readonly string[]): Record<string, string> | null {
  if (pattern.length !== segments.length) return null;
  const params: Record<string, string> = {};
  for (const [index, expected] of pattern.entries()) {
    const actual = segments[index] ?? '';
    if (expected.startsWith(':')) params[expected.slice(1)] = actual;
    else if (expected !== actual) return null;
  }
  return params;
}
