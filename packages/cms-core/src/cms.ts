import { AccessControl } from './access.js';
import { EventBus } from './events.js';
import type { FieldType } from './field-type.js';
import { createFieldRegistry } from './fields/index.js';
import { PublishChecks } from './checks.js';
import { PageHeads } from './pages.js';
import { PluginHost } from './plugin.js';
import type { Clock, ContactRepository, EntryRepository, FormRepository, IdGenerator, PipelineStore, PluginStore, SchemaRepository, SubmissionRepository, Team } from './ports.js';
import { InMemoryContactRepository, InMemoryFormRepository, InMemoryPipelineStore, InMemoryPluginStore, InMemorySubmissionRepository } from './testing/in-memory.js';
import type { Registry } from './registry.js';
import { ContentService } from './services/content-service.js';
import { ContactService } from './services/contact-service.js';
import { PipelineService } from './services/pipeline-service.js';
import { FormService } from './services/form-service.js';
import { SubmissionService } from './services/submission-service.js';
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
  /**
   * Where forms and what visitors send through them are kept. Without them both are kept in
   * memory and forgotten when the server stops, which only suits tests.
   */
  readonly forms?: FormRepository;
  readonly submissions?: SubmissionRepository;
  /** Where contacts and the team's notes about them are kept. Without one, in memory, as above. */
  readonly contacts?: ContactRepository;
  /** Where the stages of the pipeline are kept once someone changes them. Without one, in memory. */
  readonly pipeline?: PipelineStore;
  /** Who is on the team, so a contact can be given to one of them. Without it nobody can be. */
  readonly team?: Team;
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
  /** The forms visitors fill in, and what they sent. */
  readonly forms: FormService;
  readonly submissions: SubmissionService;
  /** The people who wrote to the site, what each sent and what the team noted. */
  readonly contacts: ContactService;
  /** The stages a contact moves through. */
  readonly pipeline: PipelineService;
  readonly previews: PreviewService;
  readonly fields: Registry<FieldType>;
  readonly events: EventBus;
  readonly access: AccessControl;
  /** The site's plugins. A host calls `plugins.load` once, before it serves anything. */
  readonly plugins: PluginHost;
  /** What each page says about itself to search engines, after the plugins' rules. The site asks it as it draws a page. */
  readonly pages: PageHeads;
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
  const pages = new PageHeads();
  const content = new ContentService(options.entries, schema, fields, access, events, clock, ids, checks);
  const media = new MediaService(access, events, clock, options.media);
  const formStore = options.forms ?? new InMemoryFormRepository();
  const submissionStore = options.submissions ?? new InMemorySubmissionRepository();
  const forms = new FormService(formStore, submissionStore, fields, access, events, clock, ids);
  const contactStore = options.contacts ?? new InMemoryContactRepository();
  const pipeline = new PipelineService(options.pipeline ?? new InMemoryPipelineStore(), contactStore, access, events, ids);
  const contacts = new ContactService(contactStore, submissionStore, formStore, fields, access, events, clock, ids, pipeline, options.team);
  const submissions = new SubmissionService(submissionStore, formStore, fields, access, events, clock, ids, contacts);
  const previews = new PreviewService(content, schema, clock, options.previews);
  const plugins = new PluginHost({ fields, events, checks, pages, store: options.pluginStore ?? new InMemoryPluginStore(), ids, schema, content, access, clock, ...(options.onPluginFault && { onFault: options.onPluginFault }) });
  return { schema, content, media, forms, submissions, contacts, pipeline, previews, fields, events, access, plugins, pages };
}
