import { AccessControl } from './access.js';
import { EventBus } from './events.js';
import type { FieldType } from './field-type.js';
import { createFieldRegistry } from './fields/index.js';
import { PublishChecks } from './checks.js';
import { PageHeads } from './pages.js';
import { PluginHost } from './plugin.js';
import type { Clock, ContactRepository, DealRepository, EntryRepository, FormRepository, IdGenerator, NameLookup, PipelineStore, PresenceStore, LikeStore, SettingsStore, CustomFieldsStore, PluginStore, SchemaRepository, SubmissionRepository, Team } from './ports.js';
import { InMemoryContactRepository, InMemoryDealRepository, InMemoryFormRepository, InMemoryPipelineStore, InMemoryPresenceStore, InMemoryLikeStore, InMemorySettingsStore, InMemoryCustomFieldsStore, InMemoryPluginStore, InMemorySubmissionRepository } from './testing/in-memory.js';
import type { Registry } from './registry.js';
import { ContentService } from './services/content-service.js';
import { ContactService } from './services/contact-service.js';
import { DealService } from './services/deal-service.js';
import { PipelineService } from './services/pipeline-service.js';
import { PresenceService } from './services/presence-service.js';
import { LikeService } from './services/like-service.js';
import { SettingsService } from './services/settings-service.js';
import { SecretSeal } from './seal.js';
import { CustomFieldsService } from './services/custom-fields-service.js';
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
  /** What the keys and passwords of plugins and of the site's settings are sealed with. Left out, the previews' secret is used; with neither, none can be saved. */
  readonly secret?: string;
  /**
   * Where forms and what visitors send through them are kept. Without them both are kept in
   * memory and forgotten when the server stops, which only suits tests.
   */
  readonly forms?: FormRepository;
  readonly submissions?: SubmissionRepository;
  /** Where contacts and the team's notes about them are kept. Without one, in memory, as above. */
  readonly contacts?: ContactRepository;
  /** Where deals are kept. Without one, in memory, as above. */
  readonly deals?: DealRepository;
  /** Where the stages of the pipeline are kept once someone changes them. Without one, in memory. */
  readonly pipeline?: PipelineStore;
  /** Where it is kept who has which entry open now. Without one, in memory, which a site on one server could live with. */
  readonly presence?: PresenceStore;
  /** Where visitors' likes are kept. Without one, in memory, which only suits tests. */
  readonly likes?: LikeStore;
  /** Where what an owner sets up in the editor's settings is kept. Without one, in memory. */
  readonly settings?: SettingsStore;
  /** Where the fields a site adds to its contacts and deals are kept. Without one, in memory. */
  readonly customFields?: CustomFieldsStore;
  /** Who is on the team, so a contact can be given to one of them. Without it nobody can be. */
  readonly team?: Team;
  readonly clock?: Clock;
  readonly ids?: IdGenerator;
  /**
   * Where plugins keep their settings and whether each is switched on. Without one they are
   * kept in memory and forgotten when the server stops, which only suits tests.
   */
  readonly pluginStore?: PluginStore;
  /** How the site looks a host's name up, so plugins can refuse a name that leads to a private machine. */
  readonly lookup?: NameLookup;
  /** Told of every plugin failure, for the server's log. */
  readonly onPluginFault?: (plugin: string, error: unknown) => void;
}

/** The CMS, wired together. Everything outside the core reaches it through this object. */
export interface Cms {
  readonly schema: SchemaService;
  readonly content: ContentService;
  readonly media: MediaService;
  /** Who has an entry open now, and which agents just worked on it. */
  readonly presence: PresenceService;
  /** What visitors liked, for the types that take likes. */
  readonly likes: LikeService;
  /** The forms visitors fill in, and what they sent. */
  readonly forms: FormService;
  readonly submissions: SubmissionService;
  /** The people who wrote to the site, what each sent and what the team noted. */
  readonly contacts: ContactService;
  /** The stages a contact moves through. */
  readonly pipeline: PipelineService;
  readonly customFields: CustomFieldsService;
  /** What an owner sets up for the site in the editor, such as how its email is sent. */
  readonly settings: SettingsService;
  /** What contacts may buy, what each is worth and how far along it is. */
  readonly deals: DealService;
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
  const presence = new PresenceService(options.presence ?? new InMemoryPresenceStore(), content, access, clock);
  const likes = new LikeService(options.likes ?? new InMemoryLikeStore(), options.types, options.entries, access, events, clock);
  const media = new MediaService(access, events, clock, options.media);
  const formStore = options.forms ?? new InMemoryFormRepository();
  const submissionStore = options.submissions ?? new InMemorySubmissionRepository();
  const forms = new FormService(formStore, submissionStore, fields, access, events, clock, ids);
  const contactStore = options.contacts ?? new InMemoryContactRepository();
  const dealStore = options.deals ?? new InMemoryDealRepository();
  const pipeline = new PipelineService(options.pipeline ?? new InMemoryPipelineStore(), contactStore, access, events, ids, dealStore, options.team);
  const customFields = new CustomFieldsService(options.customFields ?? new InMemoryCustomFieldsStore(), fields, access, events, clock, ids);
  const contacts = new ContactService(contactStore, submissionStore, formStore, fields, access, events, clock, ids, pipeline, options.team, dealStore, customFields);
  const deals = new DealService(dealStore, contactStore, contacts, pipeline, access, events, clock, ids, customFields, { types: options.types, entries: options.entries });
  const submissions = new SubmissionService(submissionStore, formStore, fields, access, events, clock, ids, contacts, deals);
  const previews = new PreviewService(content, schema, clock, options.previews);
  const sealWith = options.secret ?? options.previews?.secret;
  const plugins = new PluginHost({ fields, events, checks, pages, store: options.pluginStore ?? new InMemoryPluginStore(), ids, schema, content, access, clock, ...(sealWith !== undefined && { secret: sealWith }), ...(options.lookup && { lookup: options.lookup }), ...(options.onPluginFault && { onFault: options.onPluginFault }) });
  const settings = new SettingsService(options.settings ?? new InMemorySettingsStore(), new SecretSeal(sealWith, 'velocity-cms site settings'), access, events);
  return { settings, schema, content, presence, likes, media, forms, submissions, contacts, pipeline, customFields, deals, previews, fields, events, access, plugins, pages };
}
