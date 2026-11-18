import {
  CmsError,
  NotFoundError,
  ValidationError,
  createCms,
  type Actor,
  type Cms,
  type ContactImportReport,
  type ContactImportRow,
  type ContentTypeChanges,
  type ContentTypeDef,
  type FieldArrangement,
  type FieldChanges,
  type FieldSection,
  type Entry,
  type FormChanges,
  type FormDef,
  type NewForm,
  type Submission,
  type Contact,
  type Deal,
  type DealChanges,
  type Forecast,
  type NewDeal,
  type Pipeline,
  type PipelineChanges,
  type TeamMember,
  type ContactChanges,
  type ContactNote,
  type NewContact,
  type TimelineItem,
  type SubmissionStatus,
  type NewUpload,
  type Page,
  type Revision,
  type EntryData,
  type PluginInfo,
  type PluginSettings,
  type CustomFields,
  type CustomFieldsChanges,
  type PluginTask,
  type PluginEditorInfo,
  type PluginRouteMethod,
  type PreviewLink,
  type Role,
  type SiteImage,
} from '@velocity/cms-core';
import {
  InMemoryEntryRepository,
  InMemoryImageLibrary,
  InMemoryMediaRepository,
  InMemoryMediaStore,
  InMemorySchemaRepository,
} from '@velocity/cms-core/in-memory';
import type { AdminClient, ContactListQuery, DealListQuery, EntryChanges, EntryListQuery, FieldTypeInfo, ImageList, NewEntry, NewPerson, NewType, NewTypeField, Passkey, Person, PluginCall, SessionUser, SubmissionCounts, SubmissionListQuery, TrashQuery } from '../client/admin-client.js';
import { MemoryPeople } from './memory-people.js';
import { AdminRequestError, type RequestErrorCode } from '../client/errors.js';

export interface MemoryAdminClientOptions {
  /** Who is signed in at the start. Leave out to start signed out. */
  readonly user?: SessionUser;
  /** Who a passkey signs in. Leave out to make passkeys fail. */
  readonly passkeyUser?: SessionUser;
  readonly contentTypes?: readonly ContentTypeDef[];
  readonly entries?: readonly Entry[];
  /** The site's images, for image fields. */
  readonly images?: readonly SiteImage[];
  /** Whether the site takes uploads. Defaults to `true`. */
  readonly uploads?: boolean;
  /** The site's forms, made before the first request. */
  readonly forms?: readonly NewForm[];
  /** What visitors sent before the first request, oldest first: the form's key and the answers by field key. */
  readonly submissions?: readonly SeedSubmission[];
  /** The site's plugins, started before the first request. */
  readonly plugins?: readonly unknown[];
  /** Everyone who can sign in. Defaults to the person signed in at the start. */
  readonly people?: readonly Person[];
  /** The language new entries are written in. Defaults to `en`. */
  readonly defaultLocale?: string;
  /** Gives each upload an address the browser can show, for the preview: nothing serves the files here. Defaults to `false`. */
  readonly showUploads?: boolean;
  /** How long each signed-in request takes, in milliseconds, to see what a screen shows while it waits. Defaults to none. */
  readonly delay?: number;
}

/** Something a visitor sent, for a test to start with. */
export interface SeedSubmission {
  readonly form: string;
  readonly sent: Readonly<Record<string, unknown>>;
  readonly page?: string;
  /** True for one the spam checks caught. */
  readonly suspected?: boolean;
}

/** Makes the forms and takes the submissions a test starts with, as the site's own code would. */
export async function seedForms(cms: Cms, forms: readonly NewForm[] = [], submissions: readonly SeedSubmission[] = []): Promise<void> {
  for (const form of forms) await cms.forms.create({ kind: 'user', id: 'seed', role: 'owner' }, form);
  for (const { form, sent, page, suspected } of submissions) {
    await cms.submissions.submit(form, sent, { ...(page !== undefined && { page }), ...(suspected !== undefined && { suspected }) });
  }
}

const KNOWN_CODES: ReadonlySet<string> = new Set<RequestErrorCode>(['validation_failed', 'conflict', 'not_found', 'forbidden']);

/**
 * An `AdminClient` with the real CMS behind it and nothing stored: the services and rules of
 * `cms-core`, over repositories that live in memory. It stands in for the server in tests and in
 * the development preview, so a screen that works here meets the same validation, the same
 * conflicts and the same publishing rules as on a site.
 */
/** Signs this stand-in's preview links. Nothing real is behind them. */
const PREVIEW_SECRET = 'memory-admin-client-preview-secret';

export class MemoryAdminClient implements AdminClient {
  /** Every address a sign-in link was asked for, in order. */
  readonly linkRequests: string[] = [];
  readonly #passkeys: Passkey[] = [];
  #passkeysMade = 0;
  /** Set to make the next request fail with this message. */
  failNextWith: string | null = null;

  #user: SessionUser | null;
  readonly #passkeyUser: SessionUser | null;
  readonly #defaultLocale: string;
  readonly #cms: Cms;
  readonly #people: MemoryPeople;
  /** Settles once the content given to the constructor is in place. Every request waits for it. */
  readonly #ready: Promise<void>;
  readonly #delay: number;
  /** Where the browser can show each upload, by name, when `showUploads` is on. */
  readonly #shown: Map<string, string> | null;

  constructor(options: MemoryAdminClientOptions = {}) {
    this.#user = options.user ?? null;
    this.#passkeyUser = options.passkeyUser ?? null;
    this.#defaultLocale = options.defaultLocale ?? 'en';
    this.#delay = options.delay ?? 0;
    this.#shown = options.showUploads === true ? new Map() : null;
    this.#people = new MemoryPeople(options.people ?? (options.user ? [options.user] : []));
    const types = new InMemorySchemaRepository();
    const entries = new InMemoryEntryRepository();
    const storage = { files: new InMemoryMediaRepository(), store: new InMemoryMediaStore() };
    const cms = createCms({ types, entries, team: this.#people, previews: { secret: PREVIEW_SECRET }, ...(options.uploads !== false && { media: { storage } }) });
    this.#cms = cms;
    cms.media.include(new InMemoryImageLibrary(options.images));
    this.#ready = (async () => {
      for (const type of options.contentTypes ?? []) await types.save(type);
      for (const entry of options.entries ?? []) await entries.save(entry, { expectedRevision: null, actorId: 'seed' });
      await seedForms(cms, options.forms, options.submissions);
      await cms.plugins.load(options.plugins ?? []);
    })();
  }

  async getSession(): Promise<SessionUser | null> {
    this.#failIfAsked();
    return this.#user;
  }

  async requestSignInLink(email: string): Promise<void> {
    this.#failIfAsked();
    this.linkRequests.push(email);
  }

  async signInWithPasskey(): Promise<SessionUser> {
    this.#failIfAsked();
    if (!this.#passkeyUser) throw new Error('No passkey was offered.');
    this.#user = this.#passkeyUser;
    return this.#user;
  }

  async signOut(): Promise<void> {
    this.#failIfAsked();
    this.#user = null;
  }

  listContentTypes(): Promise<readonly ContentTypeDef[]> {
    return this.#request(() => this.#cms.schema.list());
  }

  listArchivedContentTypes(): Promise<readonly ContentTypeDef[]> {
    return this.#request((actor) => this.#cms.schema.listArchived(actor));
  }

  archiveContentType(id: string): Promise<ContentTypeDef> {
    return this.#request((actor) => this.#cms.schema.archive(actor, id));
  }

  restoreContentType(id: string): Promise<ContentTypeDef> {
    return this.#request((actor) => this.#cms.schema.restore(actor, id));
  }

  createContentType(type: NewType): Promise<ContentTypeDef> {
    return this.#request((actor) => this.#cms.schema.create(actor, type));
  }

  updateContentType(id: string, changes: ContentTypeChanges): Promise<ContentTypeDef> {
    return this.#request((actor) => this.#cms.schema.update(actor, id, changes));
  }

  addField(typeId: string, { section, ...field }: NewTypeField, within: readonly string[] = []): Promise<ContentTypeDef> {
    return this.#request((actor) => this.#cms.schema.addField(actor, typeId, field, { within, ...(section !== undefined && { section }) }));
  }

  changeField(typeId: string, fieldId: string, changes: FieldChanges, within?: readonly string[]): Promise<ContentTypeDef> {
    return this.#request((actor) => this.#cms.schema.changeField(actor, typeId, fieldId, changes, within));
  }

  removeField(typeId: string, fieldId: string, within?: readonly string[]): Promise<ContentTypeDef> {
    return this.#request((actor) => this.#cms.schema.removeField(actor, typeId, fieldId, within));
  }

  restoreField(typeId: string, fieldId: string, within?: readonly string[]): Promise<ContentTypeDef> {
    return this.#request((actor) => this.#cms.schema.restoreField(actor, typeId, fieldId, within));
  }

  arrangeFields(typeId: string, arrangement: FieldArrangement): Promise<ContentTypeDef> {
    return this.#request((actor) => this.#cms.schema.arrangeFields(actor, typeId, arrangement));
  }

  setSections(typeId: string, sections: readonly FieldSection[]): Promise<ContentTypeDef> {
    return this.#request((actor) => this.#cms.schema.setSections(actor, typeId, sections));
  }

  listFieldTypes(): Promise<readonly FieldTypeInfo[]> {
    return this.#request(async () => this.#cms.fields.list().map(({ type, editor, takesSubmissions }) => ({ type, editor, takesSubmissions })));
  }

  listImages(): Promise<ImageList> {
    const { media } = this.#cms;
    return this.#request(async (actor) => ({
      items: (await media.images(actor)).map((image) => ({ ...image, url: this.#shown?.get(image.name) ?? image.url })),
      upload: media.takesUploads ? { maxBytes: media.maxUploadBytes } : null,
    }));
  }

  uploadImage(upload: NewUpload): Promise<SiteImage> {
    return this.#request(async (actor) => {
      const image = await this.#cms.media.upload(actor, upload);
      if (!this.#shown) return image;
      const url = URL.createObjectURL(new Blob([new Uint8Array(upload.bytes)]));
      this.#shown.set(image.name, url);
      return { ...image, url };
    });
  }

  removeImage(name: string): Promise<void> {
    return this.#request((actor) => this.#cms.media.remove(actor, name));
  }

  listEntries(query: EntryListQuery): Promise<Page<Entry>> {
    return this.#request(async (actor) => {
      const type = await this.#cms.schema.getByKey(query.type);
      return this.#cms.content.find(actor, {
        typeId: type.id,
        order: 'updated',
        limit: query.limit ?? 50,
        offset: query.offset ?? 0,
        ...(query.locale !== undefined && { locale: query.locale }),
      });
    });
  }

  getEntry(id: string): Promise<Entry> {
    return this.#request((actor) => this.#cms.content.get(actor, id));
  }

  createEntry(entry: NewEntry): Promise<Entry> {
    return this.#request(async (actor) => {
      const type = await this.#cms.schema.getByKey(entry.type);
      return this.#cms.content.create(actor, {
        typeId: type.id,
        locale: entry.locale ?? this.#defaultLocale,
        slug: entry.slug,
        data: entry.data,
      });
    });
  }

  updateEntry(id: string, changes: EntryChanges): Promise<Entry> {
    return this.#request((actor) => this.#cms.content.update(actor, id, changes));
  }

  publishEntry(id: string, expectedRevision: number): Promise<Entry> {
    return this.#request((actor) => this.#cms.content.publish(actor, id, expectedRevision));
  }

  unpublishEntry(id: string): Promise<Entry> {
    return this.#request((actor) => this.#cms.content.unpublish(actor, id));
  }

  duplicateEntry(id: string): Promise<Entry> {
    return this.#request((actor) => this.#cms.content.duplicate(actor, id));
  }

  scheduleEntry(id: string, input: { readonly at: string; readonly expectedRevision: number }): Promise<Entry> {
    return this.#request((actor) => this.#cms.content.schedule(actor, id, input));
  }

  unscheduleEntry(id: string): Promise<Entry> {
    return this.#request((actor) => this.#cms.content.unschedule(actor, id));
  }

  entryHistory(id: string): Promise<Revision[]> {
    return this.#request((actor) => this.#cms.content.history(actor, id));
  }

  revertEntry(id: string, input: { readonly revision: number; readonly expectedRevision: number }): Promise<Entry> {
    return this.#request((actor) => this.#cms.content.revert(actor, id, input));
  }

  trashEntry(id: string): Promise<Entry> {
    return this.#request((actor) => this.#cms.content.trash(actor, id));
  }

  restoreEntry(id: string): Promise<Entry> {
    return this.#request((actor) => this.#cms.content.restore(actor, id));
  }

  listTrash(query: TrashQuery = {}): Promise<Page<Entry>> {
    return this.#request((actor) =>
      this.#cms.content.find(actor, { trashed: true, order: 'updated', limit: query.limit ?? 50, offset: query.offset ?? 0 }),
    );
  }

  deleteEntry(id: string): Promise<void> {
    return this.#request((actor) => this.#cms.content.delete(actor, id));
  }

  listForms(): Promise<readonly FormDef[]> {
    return this.#request((actor) => this.#cms.forms.list(actor));
  }

  createForm(form: NewForm): Promise<FormDef> {
    return this.#request((actor) => this.#cms.forms.create(actor, form));
  }

  updateForm(id: string, changes: FormChanges): Promise<FormDef> {
    return this.#request((actor) => this.#cms.forms.update(actor, id, changes));
  }

  trashForm(id: string): Promise<FormDef> {
    return this.#request((actor) => this.#cms.forms.trash(actor, id));
  }

  restoreForm(id: string): Promise<FormDef> {
    return this.#request((actor) => this.#cms.forms.restore(actor, id));
  }

  listTrashedForms(): Promise<readonly FormDef[]> {
    return this.#request((actor) => this.#cms.forms.listTrashed(actor));
  }

  deleteForm(id: string): Promise<void> {
    return this.#request((actor) => this.#cms.forms.delete(actor, id));
  }

  listSubmissions(query: SubmissionListQuery): Promise<Page<Submission>> {
    return this.#request((actor) =>
      this.#cms.submissions.find(actor, { formId: query.formId, limit: query.limit ?? 50, offset: query.offset ?? 0, ...(query.status !== undefined && { status: query.status }) }),
    );
  }

  countSubmissions(formId: string): Promise<SubmissionCounts> {
    return this.#request((actor) => this.#cms.submissions.counts(actor, formId));
  }

  markSubmission(id: string, status: SubmissionStatus): Promise<Submission> {
    return this.#request((actor) => this.#cms.submissions.mark(actor, id, status));
  }

  deleteSubmission(id: string): Promise<void> {
    return this.#request((actor) => this.#cms.submissions.delete(actor, id));
  }

  exportSubmissions(formId: string): Promise<string> {
    return this.#request((actor) => this.#cms.submissions.export(actor, formId));
  }

  forgetSender(email: string): Promise<number> {
    return this.#request((actor) => this.#cms.submissions.erase(actor, email));
  }

  listContacts(query: ContactListQuery = {}): Promise<Page<Contact>> {
    return this.#request((actor) =>
      this.#cms.contacts.find(actor, {
        limit: query.limit ?? 50,
        offset: query.offset ?? 0,
        ...(query.search !== undefined && query.search !== '' && { search: query.search }),
        ...(query.stage !== undefined && { stage: query.stage }),
        ...(query.ownerId !== undefined && { ownerId: query.ownerId }),
        ...(query.followUpBy !== undefined && { followUpBy: query.followUpBy }),
      }),
    );
  }

  listDeals(query: DealListQuery = {}): Promise<Page<Deal>> {
    return this.#request((actor) => this.#cms.deals.find(actor, { ...query, limit: query.limit ?? 50, offset: query.offset ?? 0 }));
  }

  createDeal(input: NewDeal): Promise<Deal> {
    return this.#request((actor) => this.#cms.deals.create(actor, input));
  }

  updateDeal(id: string, changes: DealChanges): Promise<Deal> {
    return this.#request((actor) => this.#cms.deals.update(actor, id, changes));
  }

  deleteDeal(id: string): Promise<void> {
    return this.#request((actor) => this.#cms.deals.delete(actor, id));
  }

  getForecast(): Promise<Forecast> {
    return this.#request((actor) => this.#cms.deals.forecast(actor));
  }

  getPipeline(): Promise<Pipeline> {
    return this.#request((actor) => this.#cms.pipeline.get(actor));
  }

  savePipeline(changes: PipelineChanges): Promise<Pipeline> {
    return this.#request((actor) => this.#cms.pipeline.save(actor, changes));
  }

  getCustomFields(): Promise<CustomFields> {
    return this.#request((actor) => this.#cms.customFields.get(actor));
  }

  saveCustomFields(changes: CustomFieldsChanges): Promise<CustomFields> {
    return this.#request((actor) => this.#cms.customFields.save(actor, changes));
  }

  listTeam(): Promise<readonly TeamMember[]> {
    return this.#request((actor) => this.#cms.contacts.owners(actor));
  }

  getContact(id: string): Promise<Contact> {
    return this.#request((actor) => this.#cms.contacts.get(actor, id));
  }

  createContact(input: NewContact): Promise<Contact> {
    return this.#request((actor) => this.#cms.contacts.create(actor, input));
  }

  importContacts(rows: readonly ContactImportRow[]): Promise<ContactImportReport> {
    return this.#request((actor) => this.#cms.contacts.import(actor, rows));
  }

  updateContact(id: string, changes: ContactChanges): Promise<Contact> {
    return this.#request((actor) => this.#cms.contacts.update(actor, id, changes));
  }

  eraseContact(id: string): Promise<number> {
    return this.#request((actor) => this.#cms.contacts.erase(actor, id));
  }

  contactTimeline(id: string): Promise<readonly TimelineItem[]> {
    return this.#request((actor) => this.#cms.contacts.timeline(actor, id));
  }

  addContactNote(id: string, text: string): Promise<ContactNote> {
    return this.#request((actor) => this.#cms.contacts.addNote(actor, id, text));
  }

  deleteContactNote(id: string, noteId: string): Promise<void> {
    return this.#request((actor) => this.#cms.contacts.deleteNote(actor, id, noteId));
  }

  exportContact(id: string): Promise<string> {
    return this.#request((actor) => this.#cms.contacts.export(actor, id));
  }

  /** Takes what a visitor sends through a form, as the site's public address would. For tests. */
  async visitorSends(formKey: string, sent: Readonly<Record<string, unknown>>): Promise<Submission> {
    await this.#ready;
    return this.#cms.submissions.submit(formKey, sent);
  }

  previewEntry(id: string): Promise<PreviewLink> {
    return this.#request((actor) => this.#cms.previews.link(actor, id));
  }

  listPeople(): Promise<readonly Person[]> {
    return this.#request((actor) => this.#people.listUsers(actor));
  }

  invitePerson(person: NewPerson): Promise<Person> {
    return this.#request((actor) => this.#people.invite(actor, person));
  }

  changePersonRole(id: string, role: Role): Promise<Person> {
    return this.#request((actor) => this.#people.changeRole(actor, id, role));
  }

  removePerson(id: string): Promise<void> {
    return this.#request((actor) => this.#people.remove(actor, id));
  }

  /** The name of every passkey the person has, in the order they were added. */
  get passkeys(): readonly string[] {
    return this.#passkeys.map((passkey) => passkey.name);
  }

  addPasskey(name: string): Promise<void> {
    return this.#request(async () => void this.#passkeys.push({ id: `passkey-${++this.#passkeysMade}`, name, createdAt: new Date().toISOString() }));
  }

  listPlugins(): Promise<readonly PluginInfo[]> {
    return this.#request(async (actor) => this.#cms.plugins.list(actor));
  }

  listPluginEditors(): Promise<readonly PluginEditorInfo[]> {
    return this.#request((actor) => this.#cms.plugins.editors(actor));
  }

  callPlugin(name: string, method: PluginRouteMethod, path: string, input: PluginCall = {}): Promise<unknown> {
    // What a plugin answers crosses the wire as JSON on a real site, so it does here too.
    return this.#request(async (actor) => {
      const answer = await this.#cms.plugins.call(actor, name, method, path, { query: input.query ?? {}, body: method === 'GET' ? undefined : (input.body ?? {}) });
      return answer === undefined ? {} : (JSON.parse(JSON.stringify(answer)) as unknown);
    });
  }

  setPluginEnabled(name: string, enabled: boolean): Promise<PluginInfo> {
    return this.#request((actor) => this.#cms.plugins.setEnabled(actor, name, enabled));
  }

  getPluginSettings(name: string): Promise<PluginSettings> {
    return this.#request((actor) => this.#cms.plugins.settings(actor, name));
  }

  savePluginSettings(name: string, values: EntryData): Promise<PluginSettings> {
    return this.#request((actor) => this.#cms.plugins.saveSettings(actor, name, values));
  }

  setPluginSecret(name: string, key: string, value: string | null): Promise<PluginSettings> {
    return this.#request((actor) => this.#cms.plugins.setSecret(actor, name, key, value));
  }

  listPluginTasks(name: string): Promise<readonly PluginTask[]> {
    return this.#request((actor) => this.#cms.plugins.tasks(actor, name));
  }

  retryPluginTask(name: string, id: string): Promise<PluginTask> {
    return this.#request((actor) => this.#cms.plugins.retryTask(actor, name, id));
  }

  listPasskeys(): Promise<readonly Passkey[]> {
    return this.#request(async () => [...this.#passkeys]);
  }

  removePasskey(id: string): Promise<void> {
    return this.#request(async () => {
      const index = this.#passkeys.findIndex((passkey) => passkey.id === id);
      if (index < 0) throw new NotFoundError('Passkey', id);
      this.#passkeys.splice(index, 1);
    });
  }

  /** Runs one signed-in request against the CMS, and reports a refusal the way a server would. */
  async #request<T>(run: (actor: Actor) => Promise<T>): Promise<T> {
    this.#failIfAsked();
    if (!this.#user) throw new AdminRequestError('Sign in to continue.', 'unauthenticated');
    await this.#ready;
    if (this.#delay > 0) await new Promise((resolve) => setTimeout(resolve, this.#delay));
    try {
      return await run({ kind: 'user', id: this.#user.id, role: this.#user.role });
    } catch (error) {
      if (!(error instanceof CmsError)) throw error;
      const code = KNOWN_CODES.has(error.code) ? (error.code as RequestErrorCode) : 'unknown';
      throw new AdminRequestError(error.message, code, error instanceof ValidationError ? error.issues : []);
    }
  }

  #failIfAsked(): void {
    const message = this.failNextWith;
    this.failNextWith = null;
    if (message !== null) throw new Error(message);
  }
}
