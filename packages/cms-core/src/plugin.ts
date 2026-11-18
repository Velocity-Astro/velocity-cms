import type { AccessControl, Actor, Permission } from './access.js';
import type { CmsEvents, EventBus } from './events.js';
import type { FieldType } from './field-type.js';
import type { LocalizedText, Timestamp } from './model.js';
import type { Clock } from './ports.js';
import type { Registry } from './registry.js';
import type { ContentService } from './services/content-service.js';
import type { SchemaService } from './services/schema-service.js';

/** The version of the plugin surface this CMS offers. A plugin says which one it was written for. */
export const PLUGIN_API_VERSION = 1;

/** What a plugin may ask for. People are never a plugin's to manage, and neither are other plugins. */
export const PLUGIN_PERMISSIONS: readonly Permission[] = ['schema:write', 'entry:read', 'entry:write', 'entry:publish'];

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
  /** Runs once when the site starts. Whatever it throws switches the plugin off. */
  setup(cms: PluginContext): void | Promise<void>;
}

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
  readonly schema: SchemaService;
  readonly content: ContentService;
}

/** `on`: running. `failed`: its setup threw. `unsupported`: written for a plugin surface this CMS does not have. `invalid`: not a plugin, or misnamed. */
export type PluginStatus = 'on' | 'failed' | 'unsupported' | 'invalid';

/** Something a running plugin got wrong after it started. */
export interface PluginFault {
  readonly at: Timestamp;
  /** Where it happened, such as `entry.published`. */
  readonly where: string;
  readonly message: string;
}

/** A plugin as the Plugins screen shows it. */
export interface PluginInfo {
  readonly name: string;
  readonly label: LocalizedText;
  readonly description?: LocalizedText;
  readonly version?: string;
  readonly permissions: readonly Permission[];
  readonly status: PluginStatus;
  /** Why it is not on, and what to do about it. */
  readonly problem?: string;
  /** How many times it has failed since the site started, and the last time. */
  readonly faults: number;
  readonly lastFault?: PluginFault;
}

export interface PluginHostParts {
  readonly fields: Registry<FieldType>;
  readonly events: EventBus;
  readonly schema: SchemaService;
  readonly content: ContentService;
  readonly access: AccessControl;
  readonly clock: Clock;
  /** Told of every plugin failure, for the server's log. */
  readonly onFault?: (plugin: string, error: unknown) => void;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/**
 * Starts a site's plugins and keeps track of how each is doing. A plugin that cannot start is
 * switched off and the site carries on without it: one bad plugin never takes the editor or the
 * pages down with it.
 */
export class PluginHost {
  readonly #parts: PluginHostParts;
  readonly #plugins = new Map<string, PluginInfo>();

  constructor(parts: PluginHostParts) {
    this.#parts = parts;
  }

  /**
   * Runs each plugin's `setup`, in order. What it is given comes from the site's own files, so
   * anything may be in it: each is checked before it is trusted with a name.
   */
  async load(plugins: readonly unknown[]): Promise<void> {
    for (const [index, plugin] of plugins.entries()) await this.#start(plugin, index);
  }

  /** Every plugin the site named, by name, whether or not it is running. Owners only. */
  list(actor: Actor): PluginInfo[] {
    this.#parts.access.require(actor, 'plugin:manage');
    return [...this.#plugins.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async #start(plugin: unknown, index: number): Promise<void> {
    const given = isRecord(plugin) ? plugin : {};
    const name = typeof given['name'] === 'string' && NAME.test(given['name']) ? given['name'] : null;
    // Something without a usable name still gets a row, so the owner sees that it was left out.
    const fallback = `plugin-${index + 1}`;
    const label = isRecord(given['label']) ? (given['label'] as LocalizedText) : { en: name ?? fallback };
    const refuse = (status: PluginStatus, problem: string, as = name ?? fallback) => {
      this.#plugins.set(as, { name: as, label, permissions: [], status, problem, faults: 0 });
      this.#parts.onFault?.(as, new Error(problem));
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

    const info: PluginInfo = {
      name,
      label,
      ...(definition.description !== undefined && { description: definition.description }),
      ...(definition.version !== undefined && { version: definition.version }),
      permissions: [...asked],
      status: 'on',
      faults: 0,
    };
    this.#plugins.set(name, info);

    const listening: (() => void)[] = [];
    try {
      await definition.setup(this.#context(name, asked, listening));
    } catch (error) {
      // What it began to listen to is undone. A field type it registered stays, so content that
      // already uses it keeps working.
      for (const stop of listening) stop();
      this.#plugins.set(name, { ...info, status: 'failed', problem: `The plugin "${name}" could not start, so it is switched off: ${messageOf(error)}` });
      this.#parts.onFault?.(name, error);
    }
  }

  #context(name: string, permissions: readonly Permission[], listening: (() => void)[]): PluginContext {
    const { fields, events, schema, content } = this.#parts;
    return {
      name,
      // The role grants nothing by itself here: a plugin holds exactly what it declared.
      actor: { kind: 'plugin', id: name, role: 'author', permissions },
      fields: { register: (type) => void fields.register(type) },
      events: {
        on: (event, listener) => {
          const stop = events.on(event, async (payload) => {
            try {
              await listener(payload);
            } catch (error) {
              this.#fault(name, event, error);
            }
          });
          listening.push(stop);
          return stop;
        },
      },
      schema,
      content,
    };
  }

  #fault(name: string, where: string, error: unknown): void {
    const info = this.#plugins.get(name);
    if (!info) return;
    this.#plugins.set(name, { ...info, faults: info.faults + 1, lastFault: { at: this.#parts.clock.now(), where, message: messageOf(error) } });
    this.#parts.onFault?.(name, error);
  }
}
