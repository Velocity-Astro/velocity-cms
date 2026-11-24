import type { FormsSettings, FormsSettingsChanges, GeneralSettings, GeneralSettingsChanges, EmailSettings, EmailSettingsChanges, StorageSettings, StorageSettingsChanges, ContactImportReport, ContactImportRow, CustomFields, CustomFieldsChanges, Contact, ContactChanges, Deal, DealChanges, DealSubject, Forecast, NewDeal, Pipeline, PipelineChanges, TeamMember, ContactNote, NewContact, TimelineItem, PluginSettings, PluginTask, PluginInfo, PluginEditorInfo, PluginRouteMethod, ContentTypeChanges, ContentTypeDef, ContentTypeKind, Entry, EntryData, EntryPresence, FieldArrangement, FieldChanges, FieldSection, FormChanges, FormDef, LocalizedText, NewForm, Submission, SubmissionStatus, NewField, NewUpload, Page, PreviewLink, Revision, Role, SiteImage, TypePlace } from '@velocity-astro/cms-core';

/** The person who is signed in. */
export interface SessionUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  /** What they may do. The screens use it to leave out what the server would refuse anyway. */
  readonly role: Role;
  /** Their photo, as a small image in a `data:` address, where they added one. */
  readonly image?: string;
}

/** The signed-in person's own details, which they change on their profile. */
export type Profile = SessionUser;

export interface ProfileChanges {
  readonly name?: string;
  /** A small photo as a `data:` address, or `null` to take it away. Left out, it stays. */
  readonly image?: string | null;
}

/** Someone who can sign in to the editor. */
export interface Person extends SessionUser {
  /** Whether they have ever signed in. `false` for someone invited who has not yet; left out where the site cannot tell. */
  readonly hasSignedIn?: boolean;
}

/** One of the signed-in person's own passkeys, by the name they gave it. */
export interface Passkey {
  readonly id: string;
  readonly name: string;
  /** When it was added, as an ISO date, where the site knows. */
  readonly createdAt?: string;
}

export interface NewPerson {
  readonly email: string;
  readonly name: string;
  readonly role: Role;
}

/** An access token for an agent or a script, as an owner sees it. The token itself is never shown again. */
export interface AccessToken {
  readonly id: string;
  readonly name: string;
  /** Its last four characters, to tell one from another. */
  readonly hint: string;
  readonly role: Role;
  /** Whether it may publish. Without it, what it writes stays a draft. */
  readonly publish: boolean;
  /** Whether it may read and change contacts, deals and what visitors sent. */
  readonly personalData: boolean;
  readonly expiresAt: string;
  readonly lastUsedAt: string | null;
  readonly createdAt: string;
  /** Who made it, by name, or `null` for one made from the command line. */
  readonly madeBy: string | null;
}

export interface NewAccessToken {
  readonly name: string;
  readonly role: Role;
  readonly publish: boolean;
  readonly personalData: boolean;
  /** How many days it works for, from 1 to 365. */
  readonly days: number;
}

/** An app that asks to be connected, as the person who decides is shown it. */
export interface AskedConnection {
  /** What the app calls itself. */
  readonly appName: string;
  /** The host the person is sent back to afterwards, such as `claude.ai`. */
  readonly returnsTo: string;
  /** Whether that is the person's own computer rather than a site. */
  readonly isLocal: boolean;
}

/** What the person decided about an app: no, or yes with what it may do. */
export type ConnectionAnswer = { readonly allow: false } | { readonly allow: true; readonly role: Role; readonly publish: boolean; readonly personalData: boolean };

/** An app an owner connected, such as Claude given the site's MCP address. */
export interface ConnectedApp {
  readonly id: string;
  readonly name: string;
  /** The host it was sent back to when it was connected. */
  readonly returnsTo: string;
  readonly role: Role;
  readonly publish: boolean;
  readonly personalData: boolean;
  readonly lastUsedAt: string | null;
  readonly createdAt: string;
  /** Who connected it, by name. */
  readonly connectedBy: string;
}

/** A token just made: what is shown of it, and the token itself, which is shown this once. */
export interface MadeAccessToken {
  readonly token: AccessToken;
  readonly secret: string;
}

/** A content type as someone starts it: fields are added afterwards, one at a time. */
export interface NewType {
  /** The name code and addresses use, e.g. `testimonials`. It cannot be changed later. */
  readonly key: string;
  readonly kind: ContentTypeKind;
  readonly label: LocalizedText;
  /** Where its entries live on the site, e.g. `/news/[slug]`. Left out, it has no page of its own. */
  readonly urlPattern?: string;
  /** Where the editor lists it. Only a single page can be listed anywhere but with the content. */
  readonly place?: TypePlace;
}

/** A field as someone adds it, and the section that shows it, by key. */
export interface NewTypeField extends NewField {
  readonly section?: string;
}

export interface EntryListQuery {
  /** The content type's key, e.g. `listings`. Left out, entries of every type. */
  readonly type?: string;
  readonly locale?: string;
  /**
   * Words to find, whatever their case, in an entry's working version: its slug or any text it
   * holds, such as a title or an address.
   */
  readonly search?: string;
  /** Defaults to 50. */
  readonly limit?: number;
  readonly offset?: number;
}

export interface TrashQuery {
  /** Defaults to 50. */
  readonly limit?: number;
  readonly offset?: number;
}

/** Which editor control a field type is filled in with. */
export interface FieldTypeInfo {
  /** The field type's name, as a `FieldDef` refers to it: `text`. */
  readonly type: string;
  /** The name of its control: `text-input`. */
  readonly editor: string;
  /** Whether a visitor can fill one in, so a form can ask for it. */
  readonly takesSubmissions: boolean;
}

export interface SubmissionListQuery {
  readonly formId: string;
  /** Left out, submissions of every status. */
  readonly status?: SubmissionStatus;
  /** Defaults to 50. */
  readonly limit?: number;
  readonly offset?: number;
}

/** How many of a form's submissions have each status. */
export interface ContactListQuery {
  /** Words to find in the name, email or phone. */
  readonly search?: string;
  /** Only contacts in this stage of the pipeline. */
  readonly stage?: string;
  /** Only contacts this person looks after, or with `null`, the ones nobody does. */
  readonly ownerId?: string | null;
  /** Only contacts to get back to on or before this day (`2026-03-14`), soonest first. */
  readonly followUpBy?: string;
  /** Defaults to 50. */
  readonly limit?: number;
  readonly offset?: number;
}

export interface DealListQuery {
  readonly contactId?: string;
  readonly stage?: string;
  /** Only deals this person looks after, or with `null`, the ones nobody does. */
  readonly ownerId?: string | null;
  /** Only deals about this entry. */
  readonly about?: DealSubject;
  /** Defaults to 50. */
  readonly limit?: number;
  readonly offset?: number;
}

export type SubmissionCounts = Readonly<Record<SubmissionStatus, number>>;

export interface NewEntry {
  /** The content type's key, e.g. `listings`. */
  readonly type: string;
  /** Left out, the entry is written in the site's default language. */
  readonly locale?: string;
  readonly slug: string;
  /** Field values keyed by field id. */
  readonly data: EntryData;
}

export interface EntryChanges {
  readonly slug: string;
  /** Every field value, keyed by field id. A field left out is emptied. */
  readonly data: EntryData;
  /** The revision that was loaded. The save is refused if someone else saved in between. */
  readonly expectedRevision: number;
}

/** The images an image field chooses from, and whether the site takes new ones. */
export interface ImageList {
  /** Ordered by name. */
  readonly items: readonly SiteImage[];
  /** `null` when the site has nowhere to keep uploads. */
  readonly upload: { /** The largest file the site takes, in bytes. */ readonly maxBytes: number } | null;
}

/**
 * Everything the editor asks of the server. The screens know only this interface: the real
 * implementation talks to the CMS over HTTP, and `MemoryAdminClient` in `./testing` stands in
 * for it in tests and in the development preview.
 *
 * A method that fails rejects with an `Error` whose message can be shown to the person. When the
 * server refused the request, it is an `AdminRequestError`, which also says why.
 */
export interface AdminClient {
  /** Who is signed in, or `null`. */
  getSession(): Promise<SessionUser | null>;
  /**
   * Emails a sign-in link. Resolves the same way whether or not the address belongs to someone,
   * so the screen cannot be used to find out who has an account. `next` is the editor's address
   * the link lands on, for someone who was on their way somewhere; left out, the editor's first screen.
   */
  requestSignInLink(email: string, next?: string): Promise<void>;
  /** Asks the browser for a passkey and signs in with it. */
  signInWithPasskey(): Promise<SessionUser>;
  signOut(): Promise<void>;
  /** Content types ordered by key. */
  listContentTypes(): Promise<readonly ContentTypeDef[]>;
  /** Starts a content type with no fields. Owners only, like every change to a content type. */
  createContentType(type: NewType): Promise<ContentTypeDef>;
  /** Changes what a content type is called, or where its entries live. */
  updateContentType(id: string, changes: ContentTypeChanges): Promise<ContentTypeDef>;
  /** The content types that were archived, ordered by key. Owners only. */
  listArchivedContentTypes(): Promise<readonly ContentTypeDef[]>;
  /** Takes a content type out of the editor and its pages off the site. Its fields and entries are kept. */
  archiveContentType(id: string): Promise<ContentTypeDef>;
  /** Brings an archived content type back, with its entries as they were. */
  restoreContentType(id: string): Promise<ContentTypeDef>;
  /**
   * Adds a field to a content type. Refused when a field already has its key. `within` leads to
   * the field that holds it, by id from the top down, for a field inside a group.
   */
  addField(typeId: string, field: NewTypeField, within?: readonly string[]): Promise<ContentTypeDef>;
  /** Changes a field in place. Its content stays. */
  changeField(typeId: string, fieldId: string, changes: FieldChanges, within?: readonly string[]): Promise<ContentTypeDef>;
  /** Hides a field from the editor and the site. Its content is kept, so it can be restored. */
  removeField(typeId: string, fieldId: string, within?: readonly string[]): Promise<ContentTypeDef>;
  /** Brings a removed field back, with its content. */
  restoreField(typeId: string, fieldId: string, within?: readonly string[]): Promise<ContentTypeDef>;
  /** Puts fields in order: a type's own, saying which section shows which, or those a group holds. */
  arrangeFields(typeId: string, arrangement: FieldArrangement): Promise<ContentTypeDef>;
  /** Says which sections the editor shows for a type, in order, and which fields each shows. */
  setSections(typeId: string, sections: readonly FieldSection[]): Promise<ContentTypeDef>;
  /** The working versions of a type's entries, newest first. */
  listEntries(query: EntryListQuery): Promise<Page<Entry>>;
  /** Every field type the site has, built in or from a plugin, with the control that edits it. */
  listFieldTypes(): Promise<readonly FieldTypeInfo[]>;
  /** The site's images, for an image field to choose from, and whether more can be uploaded. */
  listImages(): Promise<ImageList>;
  /** Adds an image. Refused unless the file is a JPEG, PNG or WebP the site has room for. */
  uploadImage(upload: NewUpload): Promise<SiteImage>;
  /** Removes an uploaded image for good. Refused for an image the site came with. */
  removeImage(name: string): Promise<void>;
  getEntry(id: string): Promise<Entry>;
  /** Creates a draft. Required fields may still be empty: they are checked on publish. */
  createEntry(entry: NewEntry): Promise<Entry>;
  /** Saves the version being worked on. What visitors see does not change. */
  updateEntry(id: string, changes: EntryChanges): Promise<Entry>;
  /** Makes the saved version the one visitors see. Refused while a required field is empty. */
  publishEntry(id: string, expectedRevision: number): Promise<Entry>;
  /** Takes the entry off the site. Its content is kept as a draft. */
  unpublishEntry(id: string): Promise<Entry>;
  /** A copy of an entry as a new draft of its own, under the entry's slug with `-copy` after it. */
  duplicateEntry(id: string): Promise<Entry>;
  /** Sets the working version to go on the site at a time to come (`at`, an ISO time). It must be fit to publish now. */
  scheduleEntry(id: string, input: { readonly at: string; readonly expectedRevision: number }): Promise<Entry>;
  /** Takes an entry off the schedule. It stays as it is. */
  unscheduleEntry(id: string): Promise<Entry>;
  /**
   * Says this editor has the entry open, and answers with the entry's revision now and who else is
   * there: people with it open, and agents that worked on it a moment ago. Asked every few seconds.
   */
  entryPresence(id: string): Promise<EntryPresence>;
  /** Every save of an entry, the latest first. */
  entryHistory(id: string): Promise<Revision[]>;
  /** Brings back what the entry held at an earlier revision, as a new save. What visitors see stays. */
  revertEntry(id: string, input: { readonly revision: number; readonly expectedRevision: number }): Promise<Entry>;
  /** Moves an entry to the trash: off the site and out of the lists, with nothing lost. */
  trashEntry(id: string): Promise<Entry>;
  /** Brings an entry back from the trash, as a draft. */
  restoreEntry(id: string): Promise<Entry>;
  /** The entries in the trash, of every content type, the latest to go there first. */
  listTrash(query?: TrashQuery): Promise<Page<Entry>>;
  /** Deletes an entry in the trash for good, with its history. */
  deleteEntry(id: string): Promise<void>;
  /** The site's forms, by key. */
  listForms(): Promise<readonly FormDef[]>;
  /** Starts a form. Refused when another form has its key. */
  createForm(form: NewForm): Promise<FormDef>;
  /** Changes a form: its fields all at once, in order, or its settings. Refused if someone saved in between. */
  updateForm(id: string, changes: FormChanges): Promise<FormDef>;
  /** Moves a form to the trash: it takes no more submissions, and what was sent is kept. */
  trashForm(id: string): Promise<FormDef>;
  restoreForm(id: string): Promise<FormDef>;
  /** The forms in the trash, by key. */
  listTrashedForms(): Promise<readonly FormDef[]>;
  /** Deletes a form in the trash for good, and with it everything that was sent through it. */
  deleteForm(id: string): Promise<void>;
  /** What a form was sent, newest first. Only for those who may read submissions. */
  listSubmissions(query: SubmissionListQuery): Promise<Page<Submission>>;
  countSubmissions(formId: string): Promise<SubmissionCounts>;
  /** Marks a submission new, handled or spam. */
  markSubmission(id: string, status: SubmissionStatus): Promise<Submission>;
  /** Deletes a submission for good. */
  deleteSubmission(id: string): Promise<void>;
  /** Everything a form was sent, as the text of a CSV file. */
  exportSubmissions(formId: string): Promise<string>;
  /** Deletes everything one person sent, through every form, for good. Answers with how many went. */
  forgetSender(email: string): Promise<number>;
  /** The people who wrote to the site, newest first. Only for those who may read contacts. */
  listContacts(query?: ContactListQuery): Promise<Page<Contact>>;
  /** How the site's email is sent. The provider's key is never part of it. Owners only. */
  getEmailSettings(): Promise<EmailSettings>;
  /** Saves how the site's email is sent. A key left out stays as it is; `null` takes it away. */
  saveEmailSettings(changes: EmailSettingsChanges): Promise<EmailSettings>;
  /** Sends a test email to whoever is signed in, the way the site's email is sent now. */
  sendTestEmail(): Promise<void>;
  /** The site's basics: what it is called. Owners only. */
  getGeneralSettings(): Promise<GeneralSettings>;
  saveGeneralSettings(changes: GeneralSettingsChanges): Promise<GeneralSettings>;
  /** Where the site's uploads are kept. The bucket's secret key is never part of it. Owners only. */
  getStorageSettings(): Promise<StorageSettings>;
  /** Saves the bucket uploads are kept in. A secret key left out stays as it is; `null` takes it away. */
  saveStorageSettings(changes: StorageSettingsChanges): Promise<StorageSettings>;
  /** Tries the saved bucket: keeps a small file there, reads it back and removes it. */
  testStorage(): Promise<void>;
  /** How the site's forms are guarded. The challenge's secret key is never part of it. Owners only. */
  getFormsSettings(): Promise<FormsSettings>;
  /** Saves how the site's forms are guarded. A secret key left out stays as it is; `null` takes it away. */
  saveFormsSettings(changes: FormsSettingsChanges): Promise<FormsSettings>;
  /** Asks the challenge service whether it knows the saved secret key. */
  testFormsSettings(): Promise<void>;
  /** The stages a contact moves through, in order. */
  getPipeline(): Promise<Pipeline>;
  /** Replaces the stages. Contacts in a stage that is removed move to the first. */
  savePipeline(changes: PipelineChanges): Promise<Pipeline>;
  /** The fields this site adds to its contacts and its deals. For those who may read contacts. */
  getCustomFields(): Promise<CustomFields>;
  /** Replaces the custom fields named. A field left out is removed, and what it held is kept. */
  saveCustomFields(changes: CustomFieldsChanges): Promise<CustomFields>;
  /** Who a contact can be given to, by name. For those who may read contacts. */
  listTeam(): Promise<readonly TeamMember[]>;
  /** What contacts may buy, newest first. Only for those who may read contacts. */
  listDeals(query?: DealListQuery): Promise<Page<Deal>>;
  createDeal(input: NewDeal): Promise<Deal>;
  updateDeal(id: string, changes: DealChanges): Promise<Deal>;
  deleteDeal(id: string): Promise<void>;
  /** Where the deals stand, stage by stage. */
  getForecast(): Promise<Forecast>;
  getContact(id: string): Promise<Contact>;
  /** Adds a contact by hand. An email a contact already has is refused, naming the field. */
  createContact(input: NewContact): Promise<Contact>;
  /** Adds the contacts of a file, up to 200 rows at a time. Someone already here only gains what they lack. */
  importContacts(rows: readonly ContactImportRow[]): Promise<ContactImportReport>;
  updateContact(id: string, changes: ContactChanges): Promise<Contact>;
  /** Deletes a contact for good, with their notes and everything they sent. Answers with how many submissions went. */
  eraseContact(id: string): Promise<number>;
  /** What happened with a contact, newest first: what they sent and what the team noted. */
  contactTimeline(id: string): Promise<readonly TimelineItem[]>;
  addContactNote(id: string, text: string): Promise<ContactNote>;
  deleteContactNote(id: string, noteId: string): Promise<void>;
  /** Everything held about one person, as the text of a JSON file. */
  exportContact(id: string): Promise<string>;
  /**
   * A link to the entry's page showing the saved draft, good for a while. Refused when its type
   * has no page of its own, or the site makes no previews.
   */
  previewEntry(id: string): Promise<PreviewLink>;
  /** Everyone who can sign in, by name. Owners only, like every method about people. */
  listPeople(): Promise<readonly Person[]>;
  /** Lets someone in, and emails them a link. Refused for an address that is already here. */
  invitePerson(person: NewPerson): Promise<Person>;
  /** Changes what someone may do. Refused when it would leave the site without an owner. */
  changePersonRole(id: string, role: Role): Promise<Person>;
  /** Takes away someone's access at once. Refused for yourself and for the last owner. */
  removePerson(id: string): Promise<void>;
  /** Changes what someone is called. Owners only. */
  renamePerson(id: string, name: string): Promise<Person>;
  /** The signed-in person's own details. */
  getProfile(): Promise<Profile>;
  /** Changes the signed-in person's own name or photo. */
  saveProfile(changes: ProfileChanges): Promise<Profile>;
  /** Emails a link to a new address. Nothing changes until it is opened. */
  askEmailChange(email: string): Promise<void>;
  /** Uses the token of that link: the new address becomes the person's. */
  confirmEmailChange(token: string): Promise<Profile>;
  /** The access tokens that have not ended, newest first. Owners only. */
  listTokens(): Promise<readonly AccessToken[]>;
  /** Makes an access token. The answer holds the token, which is never shown again. Owners only. */
  createToken(token: NewAccessToken): Promise<MadeAccessToken>;
  /** Takes an access token away, at once. Owners only. */
  revokeToken(id: string): Promise<void>;
  /** What an app asked for, from the query its request for approval carried. Refused when the request is not sound. Owners only. */
  askedConnection(query: string): Promise<AskedConnection>;
  /** Records the person's answer to an app. The answer says where their browser goes next: back to the app. Owners only. */
  answerConnection(query: string, answer: ConnectionAnswer): Promise<{ readonly redirect: string }>;
  /** The apps connected to the site, newest first. Owners only. */
  listConnections(): Promise<readonly ConnectedApp[]>;
  /** Takes a connected app away, at once. Owners only. */
  disconnect(id: string): Promise<void>;
  /** Asks the browser to make a passkey for the signed-in person, called `name` in their list. */
  addPasskey(name: string): Promise<void>;
  /** The plugins the site named in its config, running or not, by name. Owners only. */
  listPlugins(): Promise<readonly PluginInfo[]>;
  /** The running plugins that add to the editor, for anyone signed in. */
  listPluginEditors(): Promise<readonly PluginEditorInfo[]>;
  /**
   * Asks one of a plugin's own addresses, as the person signed in. `path` starts with a slash.
   * A plugin's screens reach their server side this way and no other.
   */
  callPlugin(name: string, method: PluginRouteMethod, path: string, input?: PluginCall): Promise<unknown>;
  /** Switches a plugin on or off, for the whole site. Owners only. */
  setPluginEnabled(name: string, enabled: boolean): Promise<PluginInfo>;
  /** A plugin's settings: the fields to draw, and what is set, by field id. Owners only. */
  getPluginSettings(name: string): Promise<PluginSettings>;
  /** Saves a plugin's settings. Refused, with the settings to look at, when one is not filled in correctly. */
  savePluginSettings(name: string, values: EntryData): Promise<PluginSettings>;
  /**
   * Saves one of a plugin's keys or passwords, or with `null` takes the saved one away. What was
   * saved never comes back: the settings only say that one is there. Owners only.
   */
  setPluginSecret(name: string, key: string, value: string | null): Promise<PluginSettings>;
  /** What a plugin was asked to do that is tried again when it fails, newest first. Owners only. */
  listPluginTasks(name: string): Promise<readonly PluginTask[]>;
  /** Has a piece of a plugin's work that was given up on tried again, now. */
  retryPluginTask(name: string, id: string): Promise<PluginTask>;
  /** The signed-in person's own passkeys, oldest first. */
  listPasskeys(): Promise<readonly Passkey[]>;
  /** Removes one of the signed-in person's own passkeys. That device then signs in with a link. */
  removePasskey(id: string): Promise<void>;
}

/** What goes with a request to a plugin's own address. */
export interface PluginCall {
  readonly query?: Readonly<Record<string, string>>;
  /** Sent as JSON. Left out for a `GET`. */
  readonly body?: unknown;
}
