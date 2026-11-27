import { readImage, type EntryPresence, type PresenceSaid, type FormsSettings, type FormsSettingsChanges, type GeneralSettings, type GeneralSettingsChanges, type EmailSettings, type EmailSettingsChanges, type StorageSettings, type StorageSettingsChanges, type ContactImportReport, type ContactImportRow, type CustomFields, type CustomFieldsChanges, type Contact, type ContactChanges, type Deal, type DealChanges, type Forecast, type LikeCount, type NewDeal, type Pipeline, type PipelineChanges, type TeamMember, type ContactNote, type NewContact, type TimelineItem, type Role, type ContentTypeChanges, type ContentTypeDef, type FieldArrangement, type FieldChanges, type FieldSection, type Entry, type NewUpload, type Page, type PluginInfo, type PluginSettings, type PluginTask, type PluginEditorInfo, type PluginRouteMethod, type EntryData, type FormChanges, type FormDef, type NewForm, type PreviewLink, type Revision, type SiteImage, type Submission, type SubmissionStatus } from '@velocity-astro/cms-core';
import type { AccessToken, AdminClient, AskedConnection, ConnectedApp, ConnectionAnswer, MadeAccessToken, NewAccessToken, ContactListQuery, DealListQuery, EntryChanges, EntryListQuery, FieldTypeInfo, ImageList, NewEntry, NewPerson, NewType, NewTypeField, Passkey, Person, PluginCall, Profile, ProfileChanges, SessionUser, SubmissionCounts, SubmissionListQuery, TrashQuery } from './admin-client.js';
import { AdminRequestError, type RequestErrorCode, type RequestIssue } from './errors.js';

/**
 * Signing in and out. This is `cms-auth`'s side of the server, which has its own addresses and,
 * for passkeys, its own conversation with the browser, so the client is handed it ready-made.
 */
export interface AuthClient {
  requestSignInLink(email: string, next?: string): Promise<void>;
  /** Resolves once the browser holds a session. Who it is for is then asked of the API. */
  signInWithPasskey(): Promise<unknown>;
  signOut(): Promise<void>;
  /** Makes a passkey for the signed-in person. */
  registerPasskey(name: string): Promise<void>;
  /** The signed-in person's own passkeys. */
  listPasskeys(): Promise<readonly Passkey[]>;
  /** Removes one of the signed-in person's own passkeys. */
  removePasskey(id: string): Promise<void>;
}

export interface HttpAdminClientOptions {
  readonly auth: AuthClient;
  /** Where the API is mounted. Defaults to `/api/cms`, on the site the editor is served from. */
  readonly baseUrl?: string;
  /** Defaults to the browser's own `fetch`. */
  readonly fetch?: typeof globalThis.fetch;
}

const CODES: ReadonlySet<string> = new Set<RequestErrorCode>(['validation_failed', 'conflict', 'not_found', 'forbidden', 'unauthenticated']);

/** The `AdminClient` the editor uses on a real site: each method is one request to `cms-api`. */
export class HttpAdminClient implements AdminClient {
  readonly #auth: AuthClient;
  readonly #baseUrl: string;
  readonly #fetch: typeof globalThis.fetch;

  constructor(options: HttpAdminClientOptions) {
    this.#auth = options.auth;
    this.#baseUrl = (options.baseUrl ?? '/api/cms').replace(/\/+$/, '');
    // Called through a closure: a browser's `fetch` refuses to run as another object's method.
    this.#fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  }

  async getSession(): Promise<SessionUser | null> {
    return (await this.#get<{ user: SessionUser | null }>('/session')).user;
  }

  requestSignInLink(email: string, next?: string): Promise<void> {
    return this.#auth.requestSignInLink(email, next);
  }

  async signInWithPasskey(): Promise<SessionUser> {
    await this.#auth.signInWithPasskey();
    // Sign-in knows who the person is; the API also knows what they may do.
    const user = await this.getSession();
    if (!user) throw new Error('The passkey was accepted, but no session was started. Try again.');
    return user;
  }

  signOut(): Promise<void> {
    return this.#auth.signOut();
  }

  async listContentTypes(): Promise<readonly ContentTypeDef[]> {
    return (await this.#get<{ items: ContentTypeDef[] }>('/content-types')).items;
  }

  async listArchivedContentTypes(): Promise<readonly ContentTypeDef[]> {
    return (await this.#get<{ items: ContentTypeDef[] }>('/content-types/archived')).items;
  }

  archiveContentType(id: string): Promise<ContentTypeDef> {
    return this.#send('DELETE', `/content-types/${encodeURIComponent(id)}`, {});
  }

  restoreContentType(id: string): Promise<ContentTypeDef> {
    return this.#send('POST', `/content-types/${encodeURIComponent(id)}/restore`, {});
  }

  createContentType(type: NewType): Promise<ContentTypeDef> {
    return this.#send('POST', '/content-types', type);
  }

  updateContentType(id: string, changes: ContentTypeChanges): Promise<ContentTypeDef> {
    return this.#send('PATCH', `/content-types/${encodeURIComponent(id)}`, changes);
  }

  addField(typeId: string, field: NewTypeField, within?: readonly string[]): Promise<ContentTypeDef> {
    return this.#send('POST', `/content-types/${encodeURIComponent(typeId)}/fields${holders(within)}`, field);
  }

  changeField(typeId: string, fieldId: string, changes: FieldChanges, within?: readonly string[]): Promise<ContentTypeDef> {
    return this.#send('PATCH', `/content-types/${encodeURIComponent(typeId)}/fields/${encodeURIComponent(fieldId)}${holders(within)}`, changes);
  }

  removeField(typeId: string, fieldId: string, within?: readonly string[]): Promise<ContentTypeDef> {
    return this.#send('DELETE', `/content-types/${encodeURIComponent(typeId)}/fields/${encodeURIComponent(fieldId)}${holders(within)}`, {});
  }

  restoreField(typeId: string, fieldId: string, within?: readonly string[]): Promise<ContentTypeDef> {
    return this.#send('POST', `/content-types/${encodeURIComponent(typeId)}/fields/${encodeURIComponent(fieldId)}/restore${holders(within)}`, {});
  }

  arrangeFields(typeId: string, arrangement: FieldArrangement): Promise<ContentTypeDef> {
    return this.#send('PUT', `/content-types/${encodeURIComponent(typeId)}/fields`, arrangement);
  }

  setSections(typeId: string, sections: readonly FieldSection[]): Promise<ContentTypeDef> {
    return this.#send('PUT', `/content-types/${encodeURIComponent(typeId)}/sections`, { sections });
  }

  async listFieldTypes(): Promise<readonly FieldTypeInfo[]> {
    return (await this.#get<{ items: FieldTypeInfo[] }>('/field-types')).items;
  }

  listImages(): Promise<ImageList> {
    return this.#get('/images');
  }

  uploadImage(upload: NewUpload): Promise<SiteImage> {
    // The file travels as it is. If it is no image at all, the server says so in its own words.
    const type = readImage(upload.bytes)?.contentType ?? 'image/jpeg';
    return this.#request(`/images?${new URLSearchParams({ name: upload.fileName })}`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': type },
      body: upload.bytes as BodyInit,
    });
  }

  async removeImage(name: string): Promise<void> {
    await this.#send('DELETE', `/images/${encodeURIComponent(name)}`, {});
  }

  listEntries(query: EntryListQuery): Promise<Page<Entry>> {
    const search = new URLSearchParams();
    if (query.type !== undefined) search.set('type', query.type);
    if (query.locale !== undefined) search.set('locale', query.locale);
    if (query.search !== undefined && query.search !== '') search.set('search', query.search);
    if (query.limit !== undefined) search.set('limit', String(query.limit));
    if (query.offset !== undefined) search.set('offset', String(query.offset));
    return this.#get(`/entries?${search}`);
  }

  getEntry(id: string): Promise<Entry> {
    return this.#get(`/entries/${encodeURIComponent(id)}`);
  }

  createEntry(entry: NewEntry): Promise<Entry> {
    return this.#send('POST', '/entries', entry);
  }

  updateEntry(id: string, changes: EntryChanges): Promise<Entry> {
    return this.#send('PATCH', `/entries/${encodeURIComponent(id)}`, changes);
  }

  publishEntry(id: string, expectedRevision: number): Promise<Entry> {
    return this.#send('POST', `/entries/${encodeURIComponent(id)}/publish`, { expectedRevision });
  }

  unpublishEntry(id: string): Promise<Entry> {
    return this.#send('POST', `/entries/${encodeURIComponent(id)}/unpublish`, {});
  }

  duplicateEntry(id: string): Promise<Entry> {
    return this.#send('POST', `/entries/${encodeURIComponent(id)}/duplicate`, {});
  }

  scheduleEntry(id: string, input: { readonly at: string; readonly expectedRevision: number }): Promise<Entry> {
    return this.#send('POST', `/entries/${encodeURIComponent(id)}/schedule`, input);
  }

  unscheduleEntry(id: string): Promise<Entry> {
    return this.#send('POST', `/entries/${encodeURIComponent(id)}/unschedule`, {});
  }

  entryPresence(id: string, said: PresenceSaid = {}): Promise<EntryPresence> {
    return this.#send('POST', `/entries/${encodeURIComponent(id)}/presence`, said);
  }

  async entryHistory(id: string): Promise<Revision[]> {
    return (await this.#get<{ items: Revision[] }>(`/entries/${encodeURIComponent(id)}/history`)).items;
  }

  revertEntry(id: string, input: { readonly revision: number; readonly expectedRevision: number }): Promise<Entry> {
    return this.#send('POST', `/entries/${encodeURIComponent(id)}/revert`, input);
  }

  trashEntry(id: string): Promise<Entry> {
    return this.#send('DELETE', `/entries/${encodeURIComponent(id)}`, {});
  }

  restoreEntry(id: string): Promise<Entry> {
    return this.#send('POST', `/entries/${encodeURIComponent(id)}/restore`, {});
  }

  listTrash(query: TrashQuery = {}): Promise<Page<Entry>> {
    const search = new URLSearchParams();
    if (query.limit !== undefined) search.set('limit', String(query.limit));
    if (query.offset !== undefined) search.set('offset', String(query.offset));
    return this.#get(`/trash?${search}`);
  }

  async deleteEntry(id: string): Promise<void> {
    await this.#send('DELETE', `/trash/${encodeURIComponent(id)}`, {});
  }

  async listForms(): Promise<readonly FormDef[]> {
    return (await this.#get<{ items: FormDef[] }>('/forms')).items;
  }

  createForm(form: NewForm): Promise<FormDef> {
    return this.#send('POST', '/forms', form);
  }

  updateForm(id: string, changes: FormChanges): Promise<FormDef> {
    return this.#send('PATCH', `/forms/${encodeURIComponent(id)}`, changes);
  }

  trashForm(id: string): Promise<FormDef> {
    return this.#send('DELETE', `/forms/${encodeURIComponent(id)}`, {});
  }

  restoreForm(id: string): Promise<FormDef> {
    return this.#send('POST', `/forms/${encodeURIComponent(id)}/restore`, {});
  }

  async listTrashedForms(): Promise<readonly FormDef[]> {
    return (await this.#get<{ items: FormDef[] }>('/forms/trash')).items;
  }

  async deleteForm(id: string): Promise<void> {
    await this.#send('DELETE', `/forms/trash/${encodeURIComponent(id)}`, {});
  }

  listSubmissions(query: SubmissionListQuery): Promise<Page<Submission>> {
    const search = new URLSearchParams();
    if (query.status !== undefined) search.set('status', query.status);
    if (query.limit !== undefined) search.set('limit', String(query.limit));
    if (query.offset !== undefined) search.set('offset', String(query.offset));
    return this.#get(`/forms/${encodeURIComponent(query.formId)}/submissions?${search}`);
  }

  countSubmissions(formId: string): Promise<SubmissionCounts> {
    return this.#get(`/forms/${encodeURIComponent(formId)}/submission-counts`);
  }

  markSubmission(id: string, status: SubmissionStatus): Promise<Submission> {
    return this.#send('PATCH', `/submissions/${encodeURIComponent(id)}`, { status });
  }

  async deleteSubmission(id: string): Promise<void> {
    await this.#send('DELETE', `/submissions/${encodeURIComponent(id)}`, {});
  }

  async exportSubmissions(formId: string): Promise<string> {
    return (await this.#get<{ csv: string }>(`/forms/${encodeURIComponent(formId)}/export`)).csv;
  }

  async forgetSender(email: string): Promise<number> {
    return (await this.#send<{ removed: number }>('POST', '/submissions/forget', { email })).removed;
  }

  listContacts(query: ContactListQuery = {}): Promise<Page<Contact>> {
    const search = new URLSearchParams();
    if (query.search !== undefined && query.search !== '') search.set('search', query.search);
    if (query.stage !== undefined) search.set('stage', query.stage);
    if (query.ownerId !== undefined) search.set('owner', query.ownerId ?? 'none');
    if (query.followUpBy !== undefined) search.set('due', query.followUpBy);
    if (query.limit !== undefined) search.set('limit', String(query.limit));
    if (query.offset !== undefined) search.set('offset', String(query.offset));
    return this.#get(`/contacts?${search}`);
  }

  listDeals(query: DealListQuery = {}): Promise<Page<Deal>> {
    const search = new URLSearchParams();
    if (query.about !== undefined) {
      search.set('aboutType', query.about.typeId);
      search.set('aboutEntry', query.about.entry);
    }
    if (query.contactId !== undefined) search.set('contact', query.contactId);
    if (query.stage !== undefined) search.set('stage', query.stage);
    if (query.ownerId !== undefined) search.set('owner', query.ownerId ?? 'none');
    if (query.limit !== undefined) search.set('limit', String(query.limit));
    if (query.offset !== undefined) search.set('offset', String(query.offset));
    return this.#get(`/deals?${search}`);
  }

  createDeal(input: NewDeal): Promise<Deal> {
    return this.#send('POST', '/deals', input);
  }

  updateDeal(id: string, changes: DealChanges): Promise<Deal> {
    return this.#send('PATCH', `/deals/${encodeURIComponent(id)}`, changes);
  }

  async deleteDeal(id: string): Promise<void> {
    await this.#send('DELETE', `/deals/${encodeURIComponent(id)}`, {});
  }

  getForecast(): Promise<Forecast> {
    return this.#get('/deals/forecast');
  }

  async getLikeCounts(typeId: string): Promise<Readonly<Record<string, number>>> {
    return (await this.#get<{ counts: Record<string, number> }>(`/likes/counts?${new URLSearchParams({ type: typeId })}`)).counts;
  }

  async listMostLiked(query: { readonly limit?: number; readonly since?: string } = {}): Promise<readonly LikeCount[]> {
    const search = new URLSearchParams();
    if (query.limit !== undefined) search.set('limit', String(query.limit));
    if (query.since !== undefined) search.set('since', query.since);
    return (await this.#get<{ items: LikeCount[] }>(`/likes/top?${search}`)).items;
  }

  getEmailSettings(): Promise<EmailSettings> {
    return this.#get('/settings/email');
  }

  saveEmailSettings(changes: EmailSettingsChanges): Promise<EmailSettings> {
    return this.#send('PUT', '/settings/email', changes);
  }

  async sendTestEmail(): Promise<void> {
    await this.#send('POST', '/settings/email/test', {});
  }

  getGeneralSettings(): Promise<GeneralSettings> {
    return this.#get('/settings/general');
  }

  saveGeneralSettings(changes: GeneralSettingsChanges): Promise<GeneralSettings> {
    return this.#send('PUT', '/settings/general', changes);
  }

  getFormsSettings(): Promise<FormsSettings> {
    return this.#get('/settings/forms');
  }

  saveFormsSettings(changes: FormsSettingsChanges): Promise<FormsSettings> {
    return this.#send('PUT', '/settings/forms', changes);
  }

  async testFormsSettings(): Promise<void> {
    await this.#send('POST', '/settings/forms/test', {});
  }

  getStorageSettings(): Promise<StorageSettings> {
    return this.#get('/settings/storage');
  }

  saveStorageSettings(changes: StorageSettingsChanges): Promise<StorageSettings> {
    return this.#send('PUT', '/settings/storage', changes);
  }

  async testStorage(): Promise<void> {
    await this.#send('POST', '/settings/storage/test', {});
  }

  getPipeline(): Promise<Pipeline> {
    return this.#get('/pipeline');
  }

  savePipeline(changes: PipelineChanges): Promise<Pipeline> {
    return this.#send('PUT', '/pipeline', changes);
  }

  getCustomFields(): Promise<CustomFields> {
    return this.#get('/custom-fields');
  }

  saveCustomFields(changes: CustomFieldsChanges): Promise<CustomFields> {
    return this.#send('PUT', '/custom-fields', changes);
  }

  async listTeam(): Promise<readonly TeamMember[]> {
    return (await this.#get<{ items: readonly TeamMember[] }>('/team')).items;
  }

  getContact(id: string): Promise<Contact> {
    return this.#get(`/contacts/${encodeURIComponent(id)}`);
  }

  createContact(input: NewContact): Promise<Contact> {
    return this.#send('POST', '/contacts', input);
  }

  importContacts(rows: readonly ContactImportRow[]): Promise<ContactImportReport> {
    return this.#send('POST', '/contacts/import', { rows });
  }

  updateContact(id: string, changes: ContactChanges): Promise<Contact> {
    return this.#send('PATCH', `/contacts/${encodeURIComponent(id)}`, changes);
  }

  async eraseContact(id: string): Promise<number> {
    return (await this.#send<{ removed: number }>('DELETE', `/contacts/${encodeURIComponent(id)}`, {})).removed;
  }

  async contactTimeline(id: string): Promise<readonly TimelineItem[]> {
    return (await this.#get<{ items: readonly TimelineItem[] }>(`/contacts/${encodeURIComponent(id)}/timeline`)).items;
  }

  addContactNote(id: string, text: string): Promise<ContactNote> {
    return this.#send('POST', `/contacts/${encodeURIComponent(id)}/notes`, { text });
  }

  async deleteContactNote(id: string, noteId: string): Promise<void> {
    await this.#send('DELETE', `/contacts/${encodeURIComponent(id)}/notes/${encodeURIComponent(noteId)}`, {});
  }

  async exportContact(id: string): Promise<string> {
    return (await this.#get<{ file: string }>(`/contacts/${encodeURIComponent(id)}/export`)).file;
  }

  previewEntry(id: string): Promise<PreviewLink> {
    return this.#send('POST', `/entries/${encodeURIComponent(id)}/preview`, {});
  }

  async listPeople(): Promise<readonly Person[]> {
    return (await this.#get<{ items: Person[] }>('/people')).items;
  }

  invitePerson(person: NewPerson): Promise<Person> {
    return this.#send('POST', '/people', person);
  }

  changePersonRole(id: string, role: Role): Promise<Person> {
    return this.#send('PATCH', `/people/${encodeURIComponent(id)}`, { role });
  }

  renamePerson(id: string, name: string): Promise<Person> {
    return this.#send('PATCH', `/people/${encodeURIComponent(id)}`, { name });
  }

  getProfile(): Promise<Profile> {
    return this.#get('/profile');
  }

  saveProfile(changes: ProfileChanges): Promise<Profile> {
    return this.#send('PATCH', '/profile', changes);
  }

  async askEmailChange(email: string): Promise<void> {
    await this.#send('POST', '/profile/email', { email });
  }

  confirmEmailChange(token: string): Promise<Profile> {
    return this.#send('POST', '/profile/email/confirm', { token });
  }

  async removePerson(id: string): Promise<void> {
    await this.#send('DELETE', `/people/${encodeURIComponent(id)}`, {});
  }

  async listTokens(): Promise<readonly AccessToken[]> {
    return (await this.#get<{ items: AccessToken[] }>('/tokens')).items;
  }

  createToken(token: NewAccessToken): Promise<MadeAccessToken> {
    return this.#send('POST', '/tokens', token);
  }

  async revokeToken(id: string): Promise<void> {
    await this.#send('DELETE', `/tokens/${encodeURIComponent(id)}`, {});
  }

  askedConnection(query: string): Promise<AskedConnection> {
    return this.#send('POST', '/connections/asked', { query });
  }

  answerConnection(query: string, answer: ConnectionAnswer): Promise<{ readonly redirect: string }> {
    return this.#send('POST', '/connections/answer', { query, ...answer });
  }

  async listConnections(): Promise<readonly ConnectedApp[]> {
    return (await this.#get<{ items: ConnectedApp[] }>('/connections')).items;
  }

  async disconnect(id: string): Promise<void> {
    await this.#send('DELETE', `/connections/${encodeURIComponent(id)}`, {});
  }

  addPasskey(name: string): Promise<void> {
    return this.#auth.registerPasskey(name);
  }

  async listPlugins(): Promise<readonly PluginInfo[]> {
    return (await this.#get<{ items: PluginInfo[] }>('/plugins')).items;
  }

  async listPluginEditors(): Promise<readonly PluginEditorInfo[]> {
    return (await this.#get<{ items: PluginEditorInfo[] }>('/plugin-editors')).items;
  }

  callPlugin(name: string, method: PluginRouteMethod, path: string, input: PluginCall = {}): Promise<unknown> {
    const query = new URLSearchParams(input.query).toString();
    const address = `/plugins/${encodeURIComponent(name)}${path}${query === '' ? '' : `?${query}`}`;
    return method === 'GET' ? this.#get(address) : this.#send(method, address, input.body ?? {});
  }

  setPluginEnabled(name: string, enabled: boolean): Promise<PluginInfo> {
    return this.#send('PATCH', `/plugins/${encodeURIComponent(name)}`, { enabled });
  }

  getPluginSettings(name: string): Promise<PluginSettings> {
    return this.#get(`/plugin-settings/${encodeURIComponent(name)}`);
  }

  savePluginSettings(name: string, values: EntryData): Promise<PluginSettings> {
    return this.#send('PUT', `/plugin-settings/${encodeURIComponent(name)}`, { values });
  }

  setPluginSecret(name: string, key: string, value: string | null): Promise<PluginSettings> {
    return this.#send('PUT', `/plugin-secrets/${encodeURIComponent(name)}/${encodeURIComponent(key)}`, { value });
  }

  async listPluginTasks(name: string): Promise<readonly PluginTask[]> {
    return (await this.#get<{ items: PluginTask[] }>(`/plugin-tasks/${encodeURIComponent(name)}`)).items;
  }

  retryPluginTask(name: string, id: string): Promise<PluginTask> {
    return this.#send('POST', `/plugin-tasks/${encodeURIComponent(name)}/${encodeURIComponent(id)}/retry`, {});
  }

  listPasskeys(): Promise<readonly Passkey[]> {
    return this.#auth.listPasskeys();
  }

  removePasskey(id: string): Promise<void> {
    return this.#auth.removePasskey(id);
  }

  #get<T>(path: string): Promise<T> {
    return this.#request(path, { headers: { accept: 'application/json' } });
  }

  #send<T>(method: string, path: string, body: unknown): Promise<T> {
    return this.#request(path, {
      method,
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async #request<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      // The session travels as a cookie, which is sent only to the site the editor came from.
      response = await this.#fetch(`${this.#baseUrl}${path}`, { ...init, credentials: 'same-origin' });
    } catch {
      throw new Error('The server could not be reached. Check your connection and try again.');
    }
    const body: unknown = await response.json().catch(() => null);
    if (response.ok) return body as T;
    throw refusal(body, response.status);
  }
}

/** The fields that hold the one a request is about, as the API reads them: `?within=<id>&within=<id>`. */
function holders(within: readonly string[] = []): string {
  return within.length > 0 ? `?${new URLSearchParams(within.map((id) => ['within', id]))}` : '';
}

/** The error for a response that was not a success, in the server's own words when it gave any. */
function refusal(body: unknown, status: number): AdminRequestError {
  const error = typeof body === 'object' && body !== null && 'error' in body ? (body.error as Record<string, unknown> | null) : null;
  const message = typeof error?.['message'] === 'string' ? error['message'] : `The server answered with an error (${status}). Try again in a moment.`;
  const code = typeof error?.['code'] === 'string' && CODES.has(error['code']) ? (error['code'] as RequestErrorCode) : 'unknown';
  return new AdminRequestError(message, code, Array.isArray(error?.['issues']) ? (error['issues'] as RequestIssue[]) : []);
}
