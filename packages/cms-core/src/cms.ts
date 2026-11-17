import { AccessControl } from './access.js';
import { EventBus } from './events.js';
import type { FieldType } from './field-type.js';
import { createFieldRegistry } from './fields/index.js';
import type { Clock, EntryRepository, IdGenerator, SchemaRepository } from './ports.js';
import type { Registry } from './registry.js';
import { ContentService } from './services/content-service.js';
import { SchemaService } from './services/schema-service.js';

export interface CmsOptions {
  readonly entries: EntryRepository;
  readonly types: SchemaRepository;
  /** Defaults to the built-in field types. */
  readonly fields?: Registry<FieldType>;
  readonly clock?: Clock;
  readonly ids?: IdGenerator;
}

/** The CMS, wired together. Everything outside the core reaches it through this object. */
export interface Cms {
  readonly schema: SchemaService;
  readonly content: ContentService;
  readonly fields: Registry<FieldType>;
  readonly events: EventBus;
  readonly access: AccessControl;
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
  const content = new ContentService(options.entries, schema, fields, access, events, clock, ids);
  return { schema, content, fields, events, access };
}
