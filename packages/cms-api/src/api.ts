import type { Cms, ContentTypeChanges, FieldArrangement, FieldChanges, FieldSection, NewField, Role } from '@velocity/cms-core';
import { z } from 'zod';
import type { ApiSession, Authenticator } from './authenticator.js';
import { ApiError, errorResponse, isFault, json } from './http.js';
import type { People } from './people.js';
import { Router } from './router.js';

export interface CmsApiOptions {
  readonly cms: Cms;
  readonly authenticator: Authenticator;
  /** Who can sign in. Without it the API has nothing under `/people`. */
  readonly people?: People;
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
const contentTypeOf = (request: Request): string => (request.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';

const entryList = z.object({
  type: z.string().min(1),
  locale: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
const data = z.record(z.string(), z.unknown());
const newEntry = z.strictObject({ type: z.string().min(1), locale: z.string().min(1).optional(), slug: z.string(), data });
const entryChanges = z.strictObject({ slug: z.string(), data, expectedRevision: z.number().int().positive() });
const newPerson = z.strictObject({ email: z.string(), name: z.string(), role: z.string() });
const roleChange = z.strictObject({ role: z.string() });
const words = z.record(z.string(), z.string());
const settings = z.record(z.string(), z.unknown());
const newType = z.strictObject({ key: z.string(), kind: z.enum(['collection', 'single']), label: words, urlPattern: z.string().optional() });
const path = z.array(z.string()).min(1);
const typeChanges = z.strictObject({
  label: words.optional(),
  urlPattern: z.string().nullable().optional(),
  titlePath: path.nullable().optional(),
  list: z.strictObject({ imagePath: path.optional(), fieldPaths: z.array(path).optional() }).nullable().optional(),
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
    const { schema, content, fields, media, previews } = options.cms;
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
        return json({ items: fields.list().map(({ type, editor }) => ({ type, editor })) });
      })
      .add('GET', '/images', async (call) => {
        const items = await media.images(actor(call));
        return json({ items, upload: media.takesUploads ? { maxBytes: media.maxUploadBytes } : null });
      })
      .add('POST', '/images', this.#upload)
      .add('GET', '/entries', async (call) => {
        const query = parse(entryList, Object.fromEntries(call.url.searchParams));
        const type = await schema.getByKey(query.type);
        const page = await content.find(actor(call), {
          typeId: type.id,
          order: 'updated',
          limit: query.limit,
          offset: query.offset,
          ...(query.locale !== undefined && { locale: query.locale }),
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
      .add('POST', '/entries/:id/unpublish', async (call) => json(await content.unpublish(actor(call), param(call, 'id'))));

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
          const { role } = parse(roleChange, await this.#body(call.request));
          return json(await people.changeRole(who, param(call, 'id'), role as Role));
        })
        .add('DELETE', '/people/:id', async (call) => {
          await people.remove(actor(call), param(call, 'id'));
          return json({});
        });
    }
  }

  /** Answers one request. Never throws: whatever goes wrong becomes a response. */
  readonly handle = async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      const inside = url.pathname === this.#basePath || url.pathname.startsWith(`${this.#basePath}/`);
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
  async #bytes(request: Request, limit: number): Promise<Uint8Array> {
    const megabytes = (limit / 1_000_000).toFixed(1).replace(/\.0$/, '');
    const tooLarge = new ApiError(413, 'too_large', `The file is more than the ${megabytes} MB an upload can be. Make it smaller first.`);
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
    if (Number(request.headers.get('content-length') ?? 0) > limit) throw tooLarge;
    const text = await request.text();
    if (new TextEncoder().encode(text).length > limit) throw tooLarge;
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
