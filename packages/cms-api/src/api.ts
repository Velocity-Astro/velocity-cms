import type { Cms, FormsSettingsChanges, EmailSettingsChanges, StorageSettingsChanges, ContactChanges, ContactImportRow, DealChanges, NewDeal, PipelineChanges, CustomFieldsChanges, ContentTypeChanges, FieldArrangement, FieldChanges, FieldSection, FormChanges, NewContact, NewField, NewForm, Role } from '@velocity-astro/cms-core';
import { z } from 'zod';
import type { ApiSession, Authenticator } from './authenticator.js';
import { ApiError, errorResponse, isFault, json } from './http.js';
import { McpEndpoint } from './mcp.js';
import type { People, Profiles } from './people.js';
import { Router } from './router.js';
import type { Connections } from './connections.js';
import type { Tokens } from './tokens.js';

export interface CmsApiOptions {
  readonly cms: Cms;
  readonly authenticator: Authenticator;
  /** Who can sign in. Without it the API has nothing under `/people`. */
  readonly people?: People;
  /** Each person's own details. Without it the API has nothing under `/profile`. */
  readonly profiles?: Profiles;
  /** Access tokens for agents and scripts. Without it the API has nothing under `/tokens`. */
  readonly tokens?: Tokens;
  /** Apps that connect by themselves, such as Claude given the MCP address. Without it the API has nothing under `/connections`. */
  readonly connections?: Connections;
  /** Where the API is mounted on the site. Defaults to `/api/cms`. */
  readonly basePath?: string;
  /** The language an entry is written in when the request names none. Defaults to `en`. */
  readonly defaultLocale?: string;
  /**
   * Other origins whose pages may change content, such as an editor served from another domain.
   * The site's own origin is always allowed.
   */
  readonly trustedOrigins?: readonly string[];
  /** The largest request body accepted, in bytes. Defaults to 1 MB. */
  readonly maxBodyBytes?: number;
  /** Told about every fault (a 500), which the response itself says nothing about. */
  readonly onFault?: (error: unknown, request: Request) => void;
}

interface Call {
  readonly request: Request;
  readonly url: URL;
  readonly params: Readonly<Record<string, string>>;
  /** Who is asking. Every route but `GET /session` requires someone. */
  readonly session: ApiSession | null;
}

type Handler = (call: Call) => Promise<Response>;

/** What an upload may say it is. What it really is, the media service reads from the file. */
const IMAGE_TYPES: ReadonlySet<string> = new Set(['image/jpeg', 'image/png', 'image/webp']);
/** A plugin's own address: its name, then at least one more part. */
const PLUGIN_ADDRESS = /^\/plugins\/([^/]+)\/(.+)$/;
const PLUGIN_METHODS: ReadonlySet<string> = new Set(['GET', 'POST', 'PUT', 'DELETE']);
const contentTypeOf = (request: Request): string => (request.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';

const entryList = z.object({
  /** Left out, entries of every content type. */
  type: z.string().min(1).optional(),
  locale: z.string().min(1).optional(),
  search: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
const trashList = entryList.omit({ type: true, locale: true, search: true });
const data = z.record(z.string(), z.unknown());
const newEntry = z.strictObject({ type: z.string().min(1), locale: z.string().min(1).optional(), slug: z.string(), data });
const entryChanges = z.strictObject({ slug: z.string(), data, expectedRevision: z.number().int().positive() });
const pluginSwitch = z.strictObject({ enabled: z.boolean() });
// What each setting may hold is the plugin's fields' to say, in the service.
const pluginValues = z.strictObject({ values: z.record(z.string(), z.unknown()) });
// A secret to save, or `null` to take the saved one away.
const pluginSecret = z.strictObject({ value: z.string().nullable() });
const newToken = z.strictObject({ name: z.string().max(200), role: z.string(), publish: z.boolean(), personalData: z.boolean(), days: z.number().int() });
// The query an app's request for approval carried, as the editor's address holds it.
const connectionAsked = z.strictObject({ query: z.string().max(8000) });
const connectionAnswer = z.strictObject({ query: z.string().max(8000), allow: z.boolean(), role: z.string().optional(), publish: z.boolean().optional(), personalData: z.boolean().optional() });
const newPerson = z.strictObject({ email: z.string(), name: z.string(), role: z.string() });
const personChange = z.strictObject({ role: z.string().optional(), name: z.string().max(1000).optional() });
const profileChanges = z.strictObject({ name: z.string().max(1000).optional(), image: z.string().max(200_000).nullable().optional() });
const emailChange = z.strictObject({ email: z.string().max(1000) });
const emailConfirm = z.strictObject({ token: z.string().max(200) });
const words = z.record(z.string(), z.string());
const settings = z.record(z.string(), z.unknown());
const typePlace = z.enum(['content', 'site', 'settings']);
const newType = z.strictObject({ key: z.string(), kind: z.enum(['collection', 'single']), label: words, urlPattern: z.string().optional(), place: typePlace.optional() });
const path = z.array(z.string()).min(1);
const typeChanges = z.strictObject({
  label: words.optional(),
  urlPattern: z.string().nullable().optional(),
  titlePath: path.nullable().optional(),
  list: z.strictObject({ imagePath: path.optional(), fieldPaths: z.array(path).optional() }).nullable().optional(),
  forDeals: z.boolean().optional(),
  place: typePlace.optional(),
});
const sectionList = z.strictObject({
  sections: z.array(z.strictObject({ key: z.string(), label: words, fieldIds: z.array(z.string()), aside: z.boolean().optional() })),
});
const newField = z.strictObject({
  key: z.string(),
  type: z.string(),
  label: words,
  help: words.optional(),
  translated: z.boolean().optional(),
  required: z.boolean().optional(),
  options: settings.optional(),
  /** The key of the section that shows the field. */
  section: z.string().optional(),
});
const fieldChanges = z.strictObject({
  key: z.string().optional(),
  label: words.optional(),
  help: words.nullable().optional(),
  required: z.boolean().optional(),
  translated: z.boolean().optional(),
  options: settings.optional(),
});
const arrangement = z.strictObject({ order: z.array(z.string()), sections: z.record(z.string(), z.array(z.string())).optional(), within: z.array(z.string()).optional() });
const formField = z.strictObject({
  /** The id the field was loaded with, so it keeps what was sent under it through a new key. */
  id: z.string().optional(),
  key: z.string(),
  type: z.string(),
  label: words,
  help: words.optional(),
  required: z.boolean().optional(),
  options: settings.optional(),
});
const formContact = z.strictObject({ name: z.string().optional(), email: z.string().optional(), phone: z.string().optional() });
const newForm = z.strictObject({
  key: z.string(),
  label: words,
  fields: z.array(formField.omit({ id: true })).optional(),
  submitLabel: words.optional(),
  success: words.optional(),
  notify: z.array(z.string()).optional(),
  contact: formContact.optional(),
  fills: z.record(z.string(), z.string()).optional(),
  retentionDays: z.number().optional(),
  startsDeal: z.boolean().optional(),
  open: z.boolean().optional(),
});
const formChanges = z.strictObject({
  key: z.string().optional(),
  label: words.optional(),
  fields: z.array(formField).optional(),
  submitLabel: words.nullable().optional(),
  success: words.nullable().optional(),
  notify: z.array(z.string()).optional(),
  contact: formContact.optional(),
  fills: z.record(z.string(), z.string()).optional(),
  retentionDays: z.number().nullable().optional(),
  startsDeal: z.boolean().optional(),
  open: z.boolean().optional(),
  expectedRevision: z.number().int().positive(),
});
const submissionList = z.object({
  status: z.enum(['new', 'handled', 'spam']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
const submissionMark = z.strictObject({ status: z.enum(['new', 'handled', 'spam']) });
const forgetRequest = z.strictObject({ email: z.string() });
const contactList = z.object({
  search: z.string().max(200).optional(),
  stage: z.string().max(100).optional(),
  /** A person's id, or `none` for the contacts nobody looks after. */
  owner: z.string().max(100).optional(),
  due: z.string().max(10).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
// What each custom field may hold is its field type's to say, in the service.
const customValues = z.record(z.string(), z.unknown());
const newContact = z.strictObject({ email: z.string(), name: z.string().optional(), phone: z.string().optional(), data: customValues.optional() });
const contactImport = z.strictObject({
  rows: z.array(z.strictObject({ email: z.string(), name: z.string().optional(), phone: z.string().optional(), data: z.record(z.string(), z.string()).optional() })),
});
const contactChanges = z.strictObject({
  email: z.string().optional(),
  name: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  stage: z.string().optional(),
  ownerId: z.string().nullable().optional(),
  followUpAt: z.string().nullable().optional(),
  data: customValues.optional(),
  expectedRevision: z.number().int().positive(),
});
const customFieldsChanges = z.strictObject({
  contact: z.array(formField).max(100).optional(),
  deal: z.array(formField).max(100).optional(),
  expectedRevision: z.number().int().min(0),
});
const emailSettingsChanges = z.strictObject({
  provider: z.enum(['resend']).optional(),
  from: z.string().max(1000).optional(),
  senderName: z.string().max(1000).optional(),
  apiKey: z.string().max(2000).nullable().optional(),
  expectedRevision: z.number().int().min(0),
});
const storageSettingsChanges = z.strictObject({
  endpoint: z.string().max(1000),
  bucket: z.string().max(1000),
  region: z.string().max(1000).optional(),
  accessKeyId: z.string().max(1000),
  secretAccessKey: z.string().max(2000).nullable().optional(),
  expectedRevision: z.number().int().min(0),
});
const formsSettingsChanges = z.strictObject({
  provider: z.enum(['turnstile', 'recaptcha']).optional(),
  siteKey: z.string().max(1000),
  secretKey: z.string().max(2000).nullable().optional(),
  postsPerAddress: z.number(),
  expectedRevision: z.number().int().min(0),
});
const generalSettingsChanges = z.strictObject({ siteName: z.string().max(1000), expectedRevision: z.number().int().min(0) });
const pipelineChanges = z.strictObject({
  stages: z.array(z.strictObject({ id: z.string().optional(), label: z.string().optional(), kind: z.enum(['open', 'won', 'lost']), chance: z.number().optional() })).max(50),
  currency: z.string().max(10).optional(),
  assignTo: z.array(z.string()).max(100).optional(),
  monthlyTarget: z.number().nullable().optional(),
  expectedRevision: z.number().int().min(0),
});
const dealSubject = z.strictObject({ typeId: z.string().max(100), entry: z.string().max(100) });
const dealList = z.object({
  contact: z.string().max(100).optional(),
  /** With `aboutEntry`, only deals about that entry. */
  aboutType: z.string().max(100).optional(),
  aboutEntry: z.string().max(100).optional(),
  stage: z.string().max(100).optional(),
  /** A person's id, or `none` for the deals nobody looks after. */
  owner: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
const newDeal = z.strictObject({
  contactId: z.string(),
  title: z.string(),
  about: dealSubject.optional(),
  value: z.number(),
  stage: z.string().optional(),
  ownerId: z.string().optional(),
  closeOn: z.string().optional(),
  data: customValues.optional(),
});
const dealChanges = z.strictObject({
  title: z.string().optional(),
  about: dealSubject.nullable().optional(),
  value: z.number().optional(),
  stage: z.string().optional(),
  ownerId: z.string().nullable().optional(),
  closeOn: z.string().nullable().optional(),
  data: customValues.optional(),
  expectedRevision: z.number().int().positive(),
});
const newNote = z.strictObject({ text: z.string() });
/** A request that says everything in its address. */
/** What an open editor says of itself: where its person is, and the revision its form holds. */
const presenceRequest = z.strictObject({ at: z.string().max(200).optional(), revision: z.number().int().min(0).optional() });
const scheduleRequest = z.strictObject({ at: z.string().max(40), expectedRevision: z.number().int().positive() });
const revertRequest = z.strictObject({ revision: z.number().int().positive(), expectedRevision: z.number().int().positive() });
const publishRequest = z.strictObject({ expectedRevision: z.number().int().positive() });

/**
 * The CMS over HTTP. One object, one method: give `handle` a `Request` and it answers with a
 * `Response`, so it mounts in an Astro endpoint, a Node server or a worker the same way.
 *
 * It holds no rules of its own. Each route checks the shape of what was sent, calls a service in
 * `cms-core` as the person who asked, and turns the result or the refusal into JSON.
 */
export class CmsApi {
  readonly #options: CmsApiOptions;
  readonly #basePath: string;
  readonly #router = new Router<Handler>();

  constructor(options: CmsApiOptions) {
    this.#options = options;
    this.#basePath = `/${(options.basePath ?? '/api/cms').split('/').filter(Boolean).join('/')}`;
    const { schema, content, presence, fields, media, previews, plugins, forms, submissions, contacts, pipeline, deals, customFields, settings } = options.cms;
    const defaultLocale = options.defaultLocale ?? 'en';

    this.#router
      .add('GET', '/session', async ({ session }) => json({ user: session ? { ...session.user, role: session.actor.role } : null }))
      .add('GET', '/content-types', async (call) => {
        actor(call);
        return json({ items: await schema.list() });
      })
      .add('POST', '/content-types', async (call) => {
        const who = actor(call);
        const body = parse(newType, await this.#body(call.request));
        return json(await schema.create(who, given(body)), 201);
      })
      .add('PATCH', '/content-types/:id', async (call) => {
        const who = actor(call);
        const body = parse(typeChanges, await this.#body(call.request));
        return json(await schema.update(who, param(call, 'id'), given<ContentTypeChanges>(body)));
      })
      .add('GET', '/plugins', async (call) => json({ items: await plugins.list(actor(call)) }))
      .add('PATCH', '/plugins/:name', async (call) => {
        const who = actor(call);
        const { enabled } = parse(pluginSwitch, await this.#body(call.request));
        return json(await plugins.setEnabled(who, param(call, 'name'), enabled));
      })
      .add('GET', '/plugin-editors', async (call) => json({ items: await plugins.editors(actor(call)) }))
      .add('GET', '/plugin-settings/:name', async (call) => json(await plugins.settings(actor(call), param(call, 'name'))))
      .add('PUT', '/plugin-settings/:name', async (call) => {
        const who = actor(call);
        const { values } = parse(pluginValues, await this.#body(call.request));
        return json(await plugins.saveSettings(who, param(call, 'name'), values));
      })
      .add('PUT', '/plugin-secrets/:name/:key', async (call) => {
        const who = actor(call);
        const { value } = parse(pluginSecret, await this.#body(call.request));
        return json(await plugins.setSecret(who, param(call, 'name'), param(call, 'key'), value));
      })
      .add('GET', '/plugin-tasks/:name', async (call) => json({ items: await plugins.tasks(actor(call), param(call, 'name')) }))
      .add('POST', '/plugin-tasks/:name/:id/retry', async (call) => json(await plugins.retryTask(actor(call), param(call, 'name'), param(call, 'id'))))
      .add('GET', '/content-types/archived', async (call) => json({ items: await schema.listArchived(actor(call)) }))
      .add('DELETE', '/content-types/:id', async (call) => json(await schema.archive(actor(call), param(call, 'id'))))
      .add('POST', '/content-types/:id/restore', async (call) => json(await schema.restore(actor(call), param(call, 'id'))))
      .add('POST', '/content-types/:id/fields', async (call) => {
        const who = actor(call);
        const { section, ...field } = parse(newField, await this.#body(call.request));
        const place = { within: within(call), ...(section !== undefined && { section }) };
        return json(await schema.addField(who, param(call, 'id'), given<NewField>(field), place), 201);
      })
      .add('PUT', '/content-types/:id/fields', async (call) => {
        const who = actor(call);
        return json(await schema.arrangeFields(who, param(call, 'id'), given<FieldArrangement>(parse(arrangement, await this.#body(call.request)))));
      })
      .add('PUT', '/content-types/:id/sections', async (call) => {
        const who = actor(call);
        const { sections } = parse(sectionList, await this.#body(call.request));
        return json(await schema.setSections(who, param(call, 'id'), sections.map((section) => given<FieldSection>(section))));
      })
      .add('PATCH', '/content-types/:id/fields/:fieldId', async (call) => {
        const who = actor(call);
        const body = parse(fieldChanges, await this.#body(call.request));
        return json(await schema.changeField(who, param(call, 'id'), param(call, 'fieldId'), given<FieldChanges>(body), within(call)));
      })
      .add('DELETE', '/content-types/:id/fields/:fieldId', async (call) =>
        json(await schema.removeField(actor(call), param(call, 'id'), param(call, 'fieldId'), within(call))),
      )
      .add('POST', '/content-types/:id/fields/:fieldId/restore', async (call) =>
        json(await schema.restoreField(actor(call), param(call, 'id'), param(call, 'fieldId'), within(call))),
      )
      .add('GET', '/field-types', async (call) => {
        actor(call);
        return json({ items: fields.list().map(({ type, editor, takesSubmissions }) => ({ type, editor, takesSubmissions })) });
      })
      .add('GET', '/images', async (call) => {
        const items = await media.images(actor(call));
        return json({ items, upload: (await media.takesUploads()) ? { maxBytes: media.maxUploadBytes } : null });
      })
      .add('POST', '/images', this.#upload)
      .add('DELETE', '/images/:name', async (call) => {
        await media.remove(actor(call), param(call, 'name'));
        return json({});
      })
      .add('GET', '/entries', async (call) => {
        const query = parse(entryList, Object.fromEntries(call.url.searchParams));
        const type = query.type === undefined ? null : await schema.getByKey(query.type);
        const page = await content.find(actor(call), {
          order: 'updated',
          limit: query.limit,
          offset: query.offset,
          ...(type !== null && { typeId: type.id }),
          ...(query.locale !== undefined && { locale: query.locale }),
          ...(query.search !== undefined && { search: query.search }),
        });
        return json(page);
      })
      .add('POST', '/entries', async (call) => {
        const who = actor(call);
        const body = parse(newEntry, await this.#body(call.request));
        const type = await schema.getByKey(body.type);
        const entry = await content.create(who, { typeId: type.id, locale: body.locale ?? defaultLocale, slug: body.slug, data: body.data });
        return json(entry, 201);
      })
      .add('GET', '/entries/:id', async (call) => json(await content.get(actor(call), param(call, 'id'))))
      .add('PATCH', '/entries/:id', async (call) => {
        const who = actor(call);
        const changes = parse(entryChanges, await this.#body(call.request));
        return json(await content.update(who, param(call, 'id'), changes));
      })
      .add('POST', '/entries/:id/publish', async (call) => {
        const who = actor(call);
        const { expectedRevision } = parse(publishRequest, await this.#body(call.request));
        return json(await content.publish(who, param(call, 'id'), expectedRevision));
      })
      .add('POST', '/entries/:id/preview', async (call) => json(await previews.link(actor(call), param(call, 'id'))))
      // An open editor says it is still there, every few seconds, and learns who else is and whether the entry moved on.
      .add('POST', '/entries/:id/presence', async (call) => {
        const who = actor(call);
        const said = parse(presenceRequest, await this.#body(call.request));
        return json(await presence.here(who, param(call, 'id'), call.session?.user.name ?? '', { ...(said.at !== undefined && { at: said.at }), ...(said.revision !== undefined && { revision: said.revision }) }));
      })
      .add('POST', '/entries/:id/unpublish', async (call) => json(await content.unpublish(actor(call), param(call, 'id'))))
      .add('DELETE', '/entries/:id', async (call) => json(await content.trash(actor(call), param(call, 'id'))))
      .add('POST', '/entries/:id/duplicate', async (call) => json(await content.duplicate(actor(call), param(call, 'id')), 201))
      .add('POST', '/entries/:id/schedule', async (call) => json(await content.schedule(actor(call), param(call, 'id'), parse(scheduleRequest, await this.#body(call.request)))))
      .add('POST', '/entries/:id/unschedule', async (call) => json(await content.unschedule(actor(call), param(call, 'id'))))
      .add('GET', '/entries/:id/history', async (call) => json({ items: await content.history(actor(call), param(call, 'id')) }))
      .add('POST', '/entries/:id/revert', async (call) => json(await content.revert(actor(call), param(call, 'id'), parse(revertRequest, await this.#body(call.request)))))
      .add('POST', '/entries/:id/restore', async (call) => json(await content.restore(actor(call), param(call, 'id'))))
      .add('GET', '/trash', async (call) => {
        const query = parse(trashList, Object.fromEntries(call.url.searchParams));
        return json(await content.find(actor(call), { trashed: true, order: 'updated', limit: query.limit, offset: query.offset }));
      })
      .add('DELETE', '/trash/:id', async (call) => {
        await content.delete(actor(call), param(call, 'id'));
        return json({});
      })
      .add('GET', '/forms', async (call) => json({ items: await forms.list(actor(call)) }))
      .add('POST', '/forms', async (call) => {
        const who = actor(call);
        const body = parse(newForm, await this.#body(call.request));
        return json(await forms.create(who, deep<NewForm>(body)), 201);
      })
      .add('GET', '/forms/trash', async (call) => json({ items: await forms.listTrashed(actor(call)) }))
      .add('DELETE', '/forms/trash/:id', async (call) => {
        await forms.delete(actor(call), param(call, 'id'));
        return json({});
      })
      .add('PATCH', '/forms/:id', async (call) => {
        const who = actor(call);
        const body = parse(formChanges, await this.#body(call.request));
        return json(await forms.update(who, param(call, 'id'), deep<FormChanges>(body)));
      })
      .add('DELETE', '/forms/:id', async (call) => json(await forms.trash(actor(call), param(call, 'id'))))
      .add('POST', '/forms/:id/restore', async (call) => json(await forms.restore(actor(call), param(call, 'id'))))
      .add('GET', '/forms/:id/submissions', async (call) => {
        const query = parse(submissionList, Object.fromEntries(call.url.searchParams));
        return json(await submissions.find(actor(call), { formId: param(call, 'id'), limit: query.limit, offset: query.offset, ...(query.status !== undefined && { status: query.status }) }));
      })
      .add('GET', '/forms/:id/submission-counts', async (call) => json(await submissions.counts(actor(call), param(call, 'id'))))
      // The file's text inside JSON: every answer here has one shape, and the editor saves it as a file.
      .add('GET', '/forms/:id/export', async (call) => json({ csv: await submissions.export(actor(call), param(call, 'id')) }))
      .add('PATCH', '/submissions/:id', async (call) => {
        const who = actor(call);
        const { status } = parse(submissionMark, await this.#body(call.request));
        return json(await submissions.mark(who, param(call, 'id'), status));
      })
      .add('DELETE', '/submissions/:id', async (call) => {
        await submissions.delete(actor(call), param(call, 'id'));
        return json({});
      })
      .add('POST', '/submissions/forget', async (call) => {
        const who = actor(call);
        const { email } = parse(forgetRequest, await this.#body(call.request));
        return json({ removed: await submissions.erase(who, email) });
      })
      .add('GET', '/settings/email', async (call) => json(await settings.email(actor(call))))
      .add('PUT', '/settings/email', async (call) => {
        const who = actor(call);
        const body = parse(emailSettingsChanges, await this.#body(call.request));
        return json(await settings.saveEmail(who, deep<EmailSettingsChanges>(body)));
      })
      .add('POST', '/settings/email/test', async (call) => {
        await settings.testEmail(actor(call));
        return json({});
      })
      .add('GET', '/settings/general', async (call) => json(await settings.general(actor(call))))
      .add('PUT', '/settings/general', async (call) => {
        const who = actor(call);
        return json(await settings.saveGeneral(who, parse(generalSettingsChanges, await this.#body(call.request))));
      })
      .add('GET', '/settings/storage', async (call) => json(await settings.storage(actor(call))))
      .add('PUT', '/settings/storage', async (call) => {
        const who = actor(call);
        const body = parse(storageSettingsChanges, await this.#body(call.request));
        return json(await settings.saveStorage(who, deep<StorageSettingsChanges>(body)));
      })
      .add('POST', '/settings/storage/test', async (call) => {
        await settings.testStorage(actor(call));
        return json({});
      })
      .add('GET', '/settings/forms', async (call) => json(await settings.forms(actor(call))))
      .add('PUT', '/settings/forms', async (call) => {
        const who = actor(call);
        const body = parse(formsSettingsChanges, await this.#body(call.request));
        return json(await settings.saveForms(who, deep<FormsSettingsChanges>(body)));
      })
      .add('POST', '/settings/forms/test', async (call) => {
        await settings.testForms(actor(call));
        return json({});
      })
      .add('GET', '/pipeline', async (call) => json(await pipeline.get(actor(call))))
      .add('PUT', '/pipeline', async (call) => {
        const who = actor(call);
        const body = parse(pipelineChanges, await this.#body(call.request));
        return json(await pipeline.save(who, deep<PipelineChanges>(body)));
      })
      .add('GET', '/custom-fields', async (call) => json(await customFields.get(actor(call))))
      .add('PUT', '/custom-fields', async (call) => {
        const who = actor(call);
        const body = parse(customFieldsChanges, await this.#body(call.request));
        return json(await customFields.save(who, deep<CustomFieldsChanges>(body)));
      })
      .add('GET', '/deals', async (call) => {
        const query = parse(dealList, Object.fromEntries(call.url.searchParams));
        return json(
          await deals.find(actor(call), {
            limit: query.limit,
            offset: query.offset,
            ...(query.contact !== undefined && { contactId: query.contact }),
            ...(query.aboutType !== undefined && query.aboutEntry !== undefined && { about: { typeId: query.aboutType, entry: query.aboutEntry } }),
            ...(query.stage !== undefined && { stage: query.stage }),
            ...(query.owner !== undefined && { ownerId: query.owner === 'none' ? null : query.owner }),
          }),
        );
      })
      .add('POST', '/deals', async (call) => {
        const who = actor(call);
        const body = parse(newDeal, await this.#body(call.request));
        return json(await deals.create(who, deep<NewDeal>(body)), 201);
      })
      .add('GET', '/deals/forecast', async (call) => json(await deals.forecast(actor(call))))
      .add('GET', '/deals/:id', async (call) => json(await deals.get(actor(call), param(call, 'id'))))
      .add('PATCH', '/deals/:id', async (call) => {
        const who = actor(call);
        const body = parse(dealChanges, await this.#body(call.request));
        return json(await deals.update(who, param(call, 'id'), deep<DealChanges>(body)));
      })
      .add('DELETE', '/deals/:id', async (call) => {
        await deals.delete(actor(call), param(call, 'id'));
        return json({});
      })
      // Who a contact can be given to: names and roles, never an email.
      .add('GET', '/team', async (call) => json({ items: await contacts.owners(actor(call)) }))
      .add('GET', '/contacts', async (call) => {
        const query = parse(contactList, Object.fromEntries(call.url.searchParams));
        return json(
          await contacts.find(actor(call), {
            limit: query.limit,
            offset: query.offset,
            ...(query.search !== undefined && { search: query.search }),
            ...(query.stage !== undefined && { stage: query.stage }),
            ...(query.owner !== undefined && { ownerId: query.owner === 'none' ? null : query.owner }),
            ...(query.due !== undefined && { followUpBy: query.due }),
          }),
        );
      })
      .add('POST', '/contacts', async (call) => {
        const who = actor(call);
        const body = parse(newContact, await this.#body(call.request));
        return json(await contacts.create(who, deep<NewContact>(body)), 201);
      })
      .add('POST', '/contacts/import', async (call) => {
        const who = actor(call);
        const { rows } = parse(contactImport, await this.#body(call.request));
        return json(await contacts.import(who, deep<ContactImportRow[]>(rows)));
      })
      .add('GET', '/contacts/:id', async (call) => json(await contacts.get(actor(call), param(call, 'id'))))
      .add('PATCH', '/contacts/:id', async (call) => {
        const who = actor(call);
        const body = parse(contactChanges, await this.#body(call.request));
        return json(await contacts.update(who, param(call, 'id'), deep<ContactChanges>(body)));
      })
      // Erasing a person: the contact, their notes and everything they sent.
      .add('DELETE', '/contacts/:id', async (call) => json({ removed: await contacts.erase(actor(call), param(call, 'id')) }))
      .add('GET', '/contacts/:id/timeline', async (call) => json({ items: await contacts.timeline(actor(call), param(call, 'id')) }))
      // The file's text inside JSON, as with a form's export: the editor saves it as a file.
      .add('GET', '/contacts/:id/export', async (call) => json({ file: await contacts.export(actor(call), param(call, 'id')) }))
      .add('POST', '/contacts/:id/notes', async (call) => {
        const who = actor(call);
        const { text } = parse(newNote, await this.#body(call.request));
        return json(await contacts.addNote(who, param(call, 'id'), text), 201);
      })
      .add('DELETE', '/contacts/:id/notes/:note', async (call) => {
        await contacts.deleteNote(actor(call), param(call, 'id'), param(call, 'note'));
        return json({});
      });

    // The Model Context Protocol, for AI agents: the same services, as tools. See `mcp.ts`.
    const mcp = new McpEndpoint({ cms: options.cms, defaultLocale });
    this.#router.add('POST', '/mcp', async (call) => {
      // An app that was given only this address learns from the refusal where to sign in.
      if (!call.session && options.connections) {
        throw new ApiError(401, 'unauthenticated', 'Connect this app to the site first, or send an access token.', {
          'www-authenticate': `Bearer resource_metadata="${options.connections.resourceMetadata}"`,
        });
      }
      const who = actor(call);
      const answer = await mcp.handle(who, await this.#body(call.request), call.session?.user.name);
      return answer === null ? new Response(null, { status: 202, headers: { 'cache-control': 'no-store' } }) : json(answer);
    });

    const { tokens } = options;
    if (tokens) {
      this.#router
        .add('GET', '/tokens', async (call) => json({ items: await tokens.listTokens(actor(call)) }))
        .add('POST', '/tokens', async (call) => {
          const who = actor(call);
          const { role, ...token } = parse(newToken, await this.#body(call.request));
          // Which roles a token may take is the tokens' to say, in their own words.
          return json(await tokens.createToken(who, { ...token, role: role as Role }), 201);
        })
        .add('DELETE', '/tokens/:id', async (call) => {
          await tokens.revokeToken(actor(call), param(call, 'id'));
          return json({});
        });
    }

    const { connections } = options;
    if (connections) {
      this.#router
        .add('GET', '/connections', async (call) => json({ items: await connections.listConnections(actor(call)) }))
        .add('POST', '/connections/asked', async (call) => {
          const who = actor(call);
          const { query } = parse(connectionAsked, await this.#body(call.request));
          return json(await connections.asked(who, query));
        })
        .add('POST', '/connections/answer', async (call) => {
          const who = actor(call);
          const { query, role, ...answer } = parse(connectionAnswer, await this.#body(call.request));
          // Which roles an app may take is the connections' to say, in their own words.
          return json(await connections.answer(who, query, answer.allow ? { allow: true, role: (role ?? '') as Role, publish: answer.publish ?? false, personalData: answer.personalData ?? false } : { allow: false }));
        })
        .add('DELETE', '/connections/:id', async (call) => {
          await connections.disconnect(actor(call), param(call, 'id'));
          return json({});
        });
    }

    if (options.profiles) this.#profileRoutes(options.profiles);

    const { people } = options;
    if (people) {
      this.#router
        .add('GET', '/people', async (call) => json({ items: await people.listUsers(actor(call)) }))
        .add('POST', '/people', async (call) => {
          const who = actor(call);
          const { role, ...person } = parse(newPerson, await this.#body(call.request));
          // Which roles there are is the people service's to say, in its own words.
          return json(await people.invite(who, { ...person, role: role as Role }), 201);
        })
        .add('PATCH', '/people/:id', async (call) => {
          const who = actor(call);
          const { role, name } = parse(personChange, await this.#body(call.request));
          const id = param(call, 'id');
          if (name !== undefined && role !== undefined) throw new ApiError(400, 'bad_request', 'Change a person\'s name or their role, one at a time.');
          if (name !== undefined) return json(await people.rename(who, id, name));
          if (role === undefined) throw new ApiError(400, 'bad_request', 'Send the new role or the new name.');
          return json(await people.changeRole(who, id, role as Role));
        })
        .add('DELETE', '/people/:id', async (call) => {
          await people.remove(actor(call), param(call, 'id'));
          return json({});
        });
    }
  }

  /** Each person's own profile. A person changes only their own. */
  #profileRoutes(profiles: Profiles): void {
    this.#router
      .add('GET', '/profile', async (call) => json(await profiles.profile(actor(call))))
      .add('PATCH', '/profile', async (call) => {
        const who = actor(call);
        return json(await profiles.updateProfile(who, deep(parse(profileChanges, await this.#body(call.request)))));
      })
      .add('POST', '/profile/email', async (call) => {
        const who = actor(call);
        const { email } = parse(emailChange, await this.#body(call.request));
        await profiles.askEmailChange(who, email);
        return json({});
      })
      .add('POST', '/profile/email/confirm', async (call) => {
        const who = actor(call);
        const { token } = parse(emailConfirm, await this.#body(call.request));
        return json(await profiles.confirmEmailChange(who, token));
      });
  }

  /** Answers one request. Never throws: whatever goes wrong becomes a response. */
  readonly handle = async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      const inside = url.pathname === this.#basePath || url.pathname.startsWith(`${this.#basePath}/`);
      // A plugin's own addresses: `/plugins/<name>/<whatever it added>`. Which there are is the plugin's to say.
      const own = inside ? PLUGIN_ADDRESS.exec(url.pathname.slice(this.#basePath.length)) : null;
      if (own) return await this.#plugin(request, url, decodeURIComponent(own[1] ?? ''), `/${own[2] ?? ''}`);
      const match = inside ? this.#router.match(request.method, url.pathname.slice(this.#basePath.length)) : { kind: 'none' as const };
      if (match.kind === 'none') throw new ApiError(404, 'not_found', 'There is nothing at this address.');
      if (match.kind === 'wrong-method') {
        throw new ApiError(405, 'method_not_allowed', `This address does not take ${request.method}.`, { allow: match.allowed.join(', ') });
      }
      if (request.method !== 'GET') this.#requireOwnPage(request, url, match.handler === this.#upload ? IMAGE_TYPES : JSON_ONLY);
      const session = await this.#options.authenticator.authenticate(request);
      return await match.handler({ request, url, params: match.params, session });
    } catch (error) {
      if (isFault(error)) this.#options.onFault?.(error, request);
      return errorResponse(error);
    }
  };

  /** Hands a request to a plugin, under the rules every address here keeps: a session, and a change only from the site's own pages. */
  async #plugin(request: Request, url: URL, name: string, path: string): Promise<Response> {
    if (!PLUGIN_METHODS.has(request.method)) {
      throw new ApiError(405, 'method_not_allowed', `This address does not take ${request.method}.`, { allow: [...PLUGIN_METHODS].join(', ') });
    }
    if (request.method !== 'GET') this.#requireOwnPage(request, url, JSON_ONLY);
    const session = await this.#options.authenticator.authenticate(request);
    const who = actor({ request, url, params: {}, session });
    const body = request.method === 'GET' ? undefined : await this.#body(request);
    const answer = await this.#options.cms.plugins.call(who, name, request.method, path, { query: Object.fromEntries(url.searchParams), body });
    return json(answer === undefined ? {} : answer);
  }

  /**
   * Takes one image: the file is the request's body, and `?name=` says what it was called on the
   * person's computer. The one route that is not JSON, since a file inside JSON grows by a third.
   */
  readonly #upload: Handler = async (call) => {
    const who = actor(call);
    const limit = this.#options.cms.media.maxUploadBytes;
    const bytes = await this.#bytes(call.request, limit);
    const image = await this.#options.cms.media.upload(who, { fileName: call.url.searchParams.get('name') ?? '', bytes });
    return json(image, 201);
  };

  /**
   * Refuses a change that another site's page is trying to make with the person's session. A
   * browser always says where such a request comes from, and cannot be made to send JSON or an
   * image as the body across sites without asking first, so both are checked.
   */
  #requireOwnPage(request: Request, url: URL, accepted: ReadonlySet<string>): void {
    const origin = request.headers.get('origin');
    if (origin !== null && origin !== url.origin && !(this.#options.trustedOrigins ?? []).includes(origin)) {
      throw new ApiError(403, 'forbidden', 'This request came from another site, so it was refused.');
    }
    if (!accepted.has(contentTypeOf(request))) {
      throw new ApiError(
        415,
        'unsupported_media_type',
        accepted === IMAGE_TYPES
          ? 'Send the image itself as the request, with the content type image/jpeg, image/png or image/webp.'
          : 'Send the request as JSON, with the content type application/json.',
      );
    }
  }

  /** The request's body as it is. Stops reading as soon as it is more than the limit. */
  async #bytes(request: Request, limit: number, refusal?: ApiError): Promise<Uint8Array> {
    const megabytes = (limit / 1_000_000).toFixed(1).replace(/\.0$/, '');
    const tooLarge = refusal ?? new ApiError(413, 'too_large', `The file is more than the ${megabytes} MB an upload can be. Make it smaller first.`);
    if (Number(request.headers.get('content-length') ?? 0) > limit) throw tooLarge;
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = request.body?.getReader();
    for (let part = await reader?.read(); part && !part.done; part = await reader?.read()) {
      size += part.value.length;
      if (size > limit) {
        await reader?.cancel();
        throw tooLarge;
      }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, at);
      at += chunk.length;
    }
    return bytes;
  }

  /** The request's JSON, or `{}` when it sent none. */
  async #body(request: Request): Promise<unknown> {
    const limit = this.#options.maxBodyBytes ?? 1_000_000;
    const tooLarge = new ApiError(413, 'too_large', `This is more than the ${Math.round(limit / 1000)} kB one request may carry.`);
    // Read with the limit in force, whatever length the request claimed: a body sent in parts says none.
    const text = new TextDecoder().decode(await this.#bytes(request, limit, tooLarge));
    if (text.trim() === '') return {};
    try {
      return JSON.parse(text);
    } catch {
      throw new ApiError(400, 'bad_request', 'The request is not valid JSON.');
    }
  }
}

const JSON_ONLY: ReadonlySet<string> = new Set(['application/json']);

/** Who is asking, for the services to check. Refuses a request nobody is signed in for. */
function actor(call: Call) {
  if (!call.session) throw new ApiError(401, 'unauthenticated', 'Sign in to continue.');
  return call.session.actor;
}

/** What was sent without the properties that were left out, which a service reads as "not given". */
function given<T>(body: object): T {
  return Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined)) as T;
}

/** `given`, for a body that holds a list of objects: what was left out of each is left out too. */
function deep<T>(body: object): T {
  const clean = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(clean)
      : typeof value === 'object' && value !== null
        ? Object.fromEntries(Object.entries(value).filter(([, inner]) => inner !== undefined).map(([key, inner]) => [key, clean(inner)]))
        : value;
  return clean(body) as T;
}

/** The fields that hold the one a request is about, from the top down: `?within=<id>&within=<id>`. None for a type's own field. */
function within(call: Call): string[] {
  return call.url.searchParams.getAll('within');
}

function param(call: Call, name: string): string {
  return call.params[name] ?? '';
}

/** What was sent, checked against the shape a route takes. Names the first thing that is wrong. */
function parse<T>(shape: z.ZodType<T>, value: unknown): T {
  const result = shape.safeParse(value);
  if (result.success) return result.data;
  const first = result.error.issues[0];
  const where = first && first.path.length > 0 ? `"${first.path.join('.')}": ` : '';
  throw new ApiError(400, 'bad_request', `The request is not in the shape this address takes. ${where}${first?.message ?? ''}`.trim());
}
