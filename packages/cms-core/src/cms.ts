import { AccessControl } from './access.js';
import { EventBus } from './events.js';
import type { FieldType } from './field-type.js';
import { createFieldRegistry } from './fields/index.js';
import { PublishChecks } from './checks.js';
import { PluginHost } from './plugin.js';
import type { Clock, EntryRepository, IdGenerator, PluginStore, SchemaRepository } from './ports.js';
import { InMemoryPluginStore } from './testing/in-memory.js';
import type { Registry } from './registry.js';
import { ContentService } from './services/content-service.js';
import { MediaService, type MediaServiceOptions } from './services/media-service.js';
import { PreviewService, type PreviewServiceOptions } from './services/preview-service.js';
import { SchemaService } from './services/schema-service.js';

export interface CmsOptions {
  readonly entries: EntryRepository;
  readonly types: SchemaRepository;
  /** Defaults to the built-in field types. */
  readonly fields?: Registry<FieldType>;
  /** Where uploaded images are kept, and where they are served from. Without storage there are no uploads. */
  readonly media?: MediaServiceOptions;
  /** The secret that signs preview links, and the language of the pages at a type's `urlPattern`. Without a secret there are no previews. */
  readonly previews?: PreviewServiceOptions;
  readonly clock?: Clock;
  readonly ids?: IdGenerator;
  /**
   * Where plugins keep their settings and whether each is switched on. Without one they are
   * kept in memory and forgotten when the server stops, which only suits tests.
   */
  readonly pluginStore?: PluginStore;
  /** Told of every plugin failure, for the server's log. */
  readonly onPluginFault?: (plugin: string, error: unknown) => void;
}

/** The CMS, wired together. Everything outside the core reaches it through this object. */
export interface Cms {
  readonly schema: SchemaService;
  readonly content: ContentService;
  readonly media: MediaService;
  readonly previews: PreviewService;
  readonly fields: Registry<FieldType>;
  readonly events: EventBus;
  readonly access: AccessControl;
  /** The site's plugins. A host calls `plugins.load` once, before it serves anything. */
  readonly plugins: PluginHost;
}

const systemClock: Clock = { now: () => new Date().toISOString() };
const randomIds: IdGenerator = { next: () => globalThis.crypto.randomUUID() };

/**
 * Builds the services from the adapters they need. This is the one place that knows how the
 * parts fit, so a test or a host can swap any of them.
 */
export function createCms(options: CmsOptions): Cms {
  const fields = options.fields ?? createFieldRegistry();
  const clock = options.clock ?? systemClock;
  const ids = options.ids ?? randomIds;
  const access = new AccessControl();
  const events = new EventBus();
  const schema = new SchemaService(options.types, fields, access, events, clock, ids);
  const checks = new PublishChecks();
  const content = new ContentService(options.entries, schema, fields, access, events, clock, ids, checks);
  const media = new MediaService(access, events, clock, options.media);
  const previews = new PreviewService(content, schema, clock, options.previews);
  const plugins = new PluginHost({ fields, events, checks, store: options.pluginStore ?? new InMemoryPluginStore(), ids, schema, content, access, clock, ...(options.onPluginFault && { onFault: options.onPluginFault }) });
  return { schema, content, media, previews, fields, events, access, plugins };
}
