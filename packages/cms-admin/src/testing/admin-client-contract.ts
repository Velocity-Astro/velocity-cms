import { definePlugin, type ContentTypeDef, type Entry, type SiteImage } from '@velocity/cms-core';
import { tinyJpeg, tinyPng } from '@velocity/cms-core/in-memory';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AdminClient, Person } from '../client/admin-client.js';
import { sampleContentTypes, sampleEntries } from './sample-content.js';

export interface AdminClientSeed {
  readonly contentTypes: readonly ContentTypeDef[];
  readonly entries: readonly Entry[];
  readonly images?: readonly SiteImage[];
  /** Whether the site takes uploads. Defaults to `true`. */
  readonly uploads?: boolean;
  /** Everyone who can sign in. Defaults to the person the client is signed in as. */
  readonly people?: readonly Person[];
  /** The site's plugins, as its config would name them. */
  readonly plugins?: readonly unknown[];
}

/**
 * What the screens rely on from any `AdminClient`. The in-memory client and the HTTP client both
 * run it, so a screen that passes its tests against one behaves the same against the other.
 *
 * @param make Builds a client, signed in, holding the content it is given.
 */
export function adminClientContract(name: string, make: (seed: AdminClientSeed) => Promise<AdminClient>): void {
  describe(`${name} (AdminClient contract)`, () => {
    let client: AdminClient;

    beforeEach(async () => {
      client = await make({
        contentTypes: sampleContentTypes,
        entries: sampleEntries(new Date('2026-11-17T12:00:00.000Z')),
        images: [
          { name: 'porch', url: '/images/porch.jpg' },
          { name: 'kitchen', url: '/images/kitchen.jpg', width: 1200, height: 800 },
        ],
      });
    });

    it('lists content types by key, and the control for each field type', async () => {
      expect((await client.listContentTypes()).map((type) => type.key)).toEqual(['agents', 'listings']);
      expect(await client.listFieldTypes()).toContainEqual({ type: 'number', editor: 'number-input' });
    });

    it("lists the site's images by name, and says how large an upload may be", async () => {
      expect(await client.listImages()).toEqual({
        items: [
          { name: 'kitchen', url: '/images/kitchen.jpg', width: 1200, height: 800 },
          { name: 'porch', url: '/images/porch.jpg' },
        ],
        upload: { maxBytes: 4_000_000 },
      });
    });

    it('takes an uploaded image, names it after its file and lists it with the others', async () => {
      const image = await client.uploadImage({ fileName: 'Front Porch.PNG', bytes: tinyPng(1600, 900) });
      expect(image).toMatchObject({ name: 'front-porch', url: '/media/front-porch.png', width: 1600, height: 900, size: tinyPng(1600, 900).length });
      expect(image.uploadedAt).toBeTypeOf('string');
      // A name the site already has is not taken twice.
      expect((await client.uploadImage({ fileName: 'kitchen.jpg', bytes: tinyJpeg() })).name).toBe('kitchen-2');
      expect((await client.listImages()).items.map((item) => item.name)).toEqual(['front-porch', 'kitchen', 'kitchen-2', 'porch']);
    });

    it('removes an uploaded image for good, and leaves the site\'s own alone', async () => {
      const image = await client.uploadImage({ fileName: 'porch-at-dusk.png', bytes: tinyPng() });
      await client.removeImage(image.name);
      expect((await client.listImages()).items.map((item) => item.name)).toEqual(['kitchen', 'porch']);
      await expect(client.removeImage(image.name)).rejects.toMatchObject({ code: 'not_found' });
      await expect(client.removeImage('kitchen')).rejects.toMatchObject({ code: 'conflict' });
    });

    it('refuses a file that is not an image, in words for the person', async () => {
      const notAnImage = new TextEncoder().encode('<script>alert(1)</script>');
      await expect(client.uploadImage({ fileName: 'photo.jpg', bytes: notAnImage })).rejects.toMatchObject({
        code: 'validation_failed',
        message: 'The file is not an image this site can show. Upload a JPEG, PNG or WebP.',
      });
    });

    it('says so when the site takes no uploads', async () => {
      const closed = await make({ contentTypes: [], entries: [], uploads: false });
      expect((await closed.listImages()).upload).toBeNull();
      await expect(closed.uploadImage({ fileName: 'porch.png', bytes: tinyPng() })).rejects.toMatchObject({ code: 'conflict' });
    });

    it('lists entries most recently saved first, a page at a time', async () => {
      const all = await client.listEntries({ type: 'listings' });
      expect(all.items.map((entry) => entry.id)).toEqual(['e1', 'e2', 'e3', 'e4']);
      expect(all.total).toBe(4);
      const page = await client.listEntries({ type: 'listings', limit: 2, offset: 1 });
      expect(page.items.map((entry) => entry.id)).toEqual(['e2', 'e3']);
      expect(page.total).toBe(4);
      expect((await client.listEntries({ type: 'listings', locale: 'es' })).total).toBe(0);
    });

    it('rejects with a code the screens can act on', async () => {
      await expect(client.getEntry('nope')).rejects.toMatchObject({ name: 'AdminRequestError', code: 'not_found' });
      await expect(client.listEntries({ type: 'unicorns' })).rejects.toMatchObject({ code: 'not_found' });
    });

    it('creates a draft in the default language, then saves changes to it', async () => {
      const created = await client.createEntry({ type: 'agents', slug: 'maria-ortiz', data: { 'f-name': 'María Ortiz' } });
      expect(created).toMatchObject({ locale: 'en', status: 'draft', revision: 1, slug: 'maria-ortiz' });
      const saved = await client.updateEntry(created.id, { slug: 'maria', data: { 'f-name': 'María' }, expectedRevision: 1 });
      expect(saved).toMatchObject({ revision: 2, slug: 'maria', data: { 'f-name': 'María' } });
      expect(await client.getEntry(created.id)).toEqual(saved);
    });

    it('refuses a save made from a revision that has been replaced', async () => {
      const entry = await client.getEntry('e2');
      const changes = { slug: entry.slug, data: entry.data, expectedRevision: entry.revision };
      await client.updateEntry('e2', changes);
      await expect(client.updateEntry('e2', changes)).rejects.toMatchObject({ code: 'conflict' });
    });

    it('names each field that stops a publish, by key', async () => {
      const refused = client.publishEntry('e4', 1);
      await expect(refused).rejects.toMatchObject({
        code: 'validation_failed',
        issues: [{ path: ['title'], message: 'Fill this in before publishing.' }],
      });
    });

    it('reports a slug that cannot be used at the path the form shows it under', async () => {
      await expect(client.createEntry({ type: 'agents', slug: 'Not A Slug', data: {} })).rejects.toMatchObject({
        code: 'validation_failed',
        issues: [{ path: ['$slug'] }],
      });
    });

    it('publishes and unpublishes', async () => {
      const published = await client.publishEntry('e2', 1);
      expect(published).toMatchObject({ status: 'published', published: { slug: '18-alder-court' } });
      const draft = await client.unpublishEntry('e2');
      expect(draft.status).toBe('draft');
      expect(draft).not.toHaveProperty('published');
    });

    it('lists who can sign in, lets people in, changes what they may do and takes access away', async () => {
      expect(await client.listPeople()).toEqual([{ id: 'u1', email: 'dana@example.com', name: 'Dana', role: 'owner' }]);
      const ben = await client.invitePerson({ email: ' Ben@Example.com ', name: 'Ben', role: 'author' });
      expect(ben).toMatchObject({ email: 'ben@example.com', name: 'Ben', role: 'author' });
      expect(await client.changePersonRole(ben.id, 'editor')).toMatchObject({ id: ben.id, role: 'editor' });
      expect((await client.listPeople()).map((person) => person.name)).toEqual(['Ben', 'Dana']);
      await client.removePerson(ben.id);
      expect(await client.listPeople()).toHaveLength(1);
    });

    it('lists the site\'s plugins with how each is doing', async () => {
      expect(await client.listPlugins()).toEqual([]);
      const withPlugins = await make({
        contentTypes: [],
        entries: [],
        plugins: [
          definePlugin({ name: 'ratings', apiVersion: 1, label: { en: 'Ratings' }, version: '1.0.0', setup: () => undefined }),
          definePlugin({
            name: 'broken',
            apiVersion: 1,
            label: { en: 'Broken' },
            setup: () => {
              throw new Error('No API key.');
            },
          }),
        ],
      });
      expect((await withPlugins.listPlugins()).map(({ name, status, problem }) => ({ name, status, problem }))).toEqual([
        { name: 'broken', status: 'failed', problem: 'The plugin "broken" could not start, so it is switched off: No API key.' },
        { name: 'ratings', status: 'on', problem: undefined },
      ]);
    });

    it('switches a plugin off and on, and saves its settings by field id', async () => {
      const site = await make({
        contentTypes: [],
        entries: [],
        plugins: [
          definePlugin({
            name: 'seo',
            apiVersion: 1,
            label: { en: 'SEO' },
            enabledByDefault: false,
            settings: [{ key: 'titleSuffix', type: 'text', label: { en: 'Title ending' }, required: true }],
            setup: () => undefined,
          }),
        ],
      });
      expect((await site.listPlugins())[0]).toMatchObject({ name: 'seo', status: 'off', hasSettings: true });
      expect(await site.setPluginEnabled('seo', true)).toMatchObject({ status: 'on' });
      expect((await site.listPlugins())[0]?.status).toBe('on');

      const { fields, values } = await site.getPluginSettings('seo');
      expect([fields.map((field) => field.key), values]).toEqual([['titleSuffix'], {}]);
      const suffix = fields[0]?.id ?? '';
      await expect(site.savePluginSettings('seo', {})).rejects.toMatchObject({ code: 'validation_failed', issues: [{ path: ['titleSuffix'], message: 'Fill this in.' }] });
      expect((await site.savePluginSettings('seo', { [suffix]: ' | Lakeshore' })).values).toEqual({ [suffix]: ' | Lakeshore' });
      expect((await site.getPluginSettings('seo')).values).toEqual({ [suffix]: ' | Lakeshore' });
    });

    it('keeps the person\'s own passkeys by name, and removes the one asked for', async () => {
      expect(await client.listPasskeys()).toEqual([]);
      await client.addPasskey('Work laptop');
      await client.addPasskey('Phone');
      const [laptop, phone] = await client.listPasskeys();
      expect([laptop?.name, phone?.name]).toEqual(['Work laptop', 'Phone']);
      await client.removePasskey(laptop?.id ?? '');
      expect((await client.listPasskeys()).map((passkey) => passkey.name)).toEqual(['Phone']);
    });

    it('refuses what would lock the site or cannot work, in words for the person', async () => {
      await expect(client.invitePerson({ email: 'nope', name: '', role: 'editor' })).rejects.toMatchObject({
        code: 'validation_failed',
        issues: [{ path: ['email'] }, { path: ['name'] }],
      });
      await expect(client.invitePerson({ email: 'dana@example.com', name: 'Dana again', role: 'editor' })).rejects.toMatchObject({ code: 'conflict' });
      await expect(client.changePersonRole('u1', 'editor')).rejects.toMatchObject({ code: 'conflict', message: expect.stringContaining('only owner') });
      await expect(client.removePerson('u1')).rejects.toMatchObject({ code: 'conflict', message: expect.stringContaining('yourself') });
      await expect(client.removePerson('nobody')).rejects.toMatchObject({ code: 'not_found' });
    });

    it('builds a content type: starts it, changes it, and adds, changes, orders, removes and restores fields', async () => {
      const news = await client.createContentType({ key: 'news', kind: 'collection', label: { en: 'News' }, urlPattern: '/news/[slug]' });
      expect(news).toMatchObject({ key: 'news', kind: 'collection', label: { en: 'News' }, urlPattern: '/news/[slug]', fields: [] });
      expect(await client.updateContentType(news.id, { label: { en: 'Stories' }, urlPattern: null })).not.toHaveProperty('urlPattern');

      await client.addField(news.id, { key: 'title', type: 'text', label: { en: 'Title' }, required: true });
      const withBody = await client.addField(news.id, { key: 'body', type: 'richtext', label: { en: 'Body' } });
      const [title, body] = withBody.fields.map((field) => field.id) as [string, string];
      const changed = await client.changeField(news.id, title, { key: 'headline', help: { en: 'Keep it short.' }, options: { maxLength: 90 } });
      expect(changed.fields[0]).toMatchObject({ id: title, key: 'headline', required: true, help: { en: 'Keep it short.' }, options: { maxLength: 90 } });
      expect((await client.arrangeFields(news.id, { order: [body, title] })).fields.map((field) => field.key)).toEqual(['body', 'headline']);
      expect((await client.removeField(news.id, body)).fields[0]?.deletedAt).toBeTypeOf('string');
      expect((await client.restoreField(news.id, body)).fields[0]).not.toHaveProperty('deletedAt');
      expect((await client.listContentTypes()).map((type) => type.key)).toEqual(['agents', 'listings', 'news']);
    });

    it('builds what a group holds, sets sections and chooses what lists show', async () => {
      const address = (type: { fields: readonly { key: string; options: Readonly<Record<string, unknown>> }[] }) =>
        (type.fields.find((field) => field.key === 'address')?.options['fields'] as { id: string; key: string; deletedAt?: string }[]).map((field) => [field.key, field.deletedAt === undefined]);
      const added = await client.addField('type-listings', { key: 'zip', type: 'text', label: { en: 'ZIP code' } }, ['f-address']);
      const zip = (added.fields.find((field) => field.key === 'address')?.options['fields'] as { id: string }[])[2]?.id as string;
      expect(address(added)).toEqual([['street', true], ['city', true], ['zip', true]]);
      expect(address(await client.changeField('type-listings', zip, { key: 'postcode' }, ['f-address']))).toContainEqual(['postcode', true]);
      expect(address(await client.arrangeFields('type-listings', { order: [zip, 'f-street', 'f-city'], within: ['f-address'] }))[0]).toEqual(['postcode', true]);
      expect(address(await client.removeField('type-listings', zip, ['f-address']))).toContainEqual(['postcode', false]);
      expect(address(await client.restoreField('type-listings', zip, ['f-address']))).toContainEqual(['postcode', true]);

      const sections = await client.setSections('type-listings', [
        { key: 'main', label: { en: 'Main' }, fieldIds: ['f-title', 'f-description'] },
        { key: 'facts', label: { en: 'Facts' }, fieldIds: ['f-price'], aside: true },
      ]);
      expect(sections.sections).toEqual([
        { key: 'main', label: { en: 'Main' }, fieldIds: ['f-title', 'f-description'] },
        { key: 'facts', label: { en: 'Facts' }, fieldIds: ['f-price'], aside: true },
      ]);
      expect(await client.setSections('type-listings', [])).not.toHaveProperty('sections');
      await expect(client.setSections('type-listings', [{ key: 'main', label: { en: 'Main' }, fieldIds: ['nothing'] }])).rejects.toMatchObject({ code: 'validation_failed' });

      const chosen = await client.updateContentType('type-listings', { titlePath: ['f-address', 'f-city'], list: { fieldPaths: [['f-price'], ['f-stage']] } });
      expect(chosen).toMatchObject({ titlePath: ['f-address', 'f-city'], list: { fieldPaths: [['f-price'], ['f-stage']] } });
      expect(await client.updateContentType('type-listings', { titlePath: null, list: null })).not.toHaveProperty('titlePath');
      await expect(client.addField('type-listings', { key: 'x', type: 'text', label: { en: 'X' } }, ['f-title'])).rejects.toMatchObject({ code: 'conflict' });
    });

    it('archives a content type, keeping its entries, and brings it back', async () => {
      const before = (await client.listEntries({ type: 'agents' })).total;
      expect(await client.listArchivedContentTypes()).toEqual([]);
      expect((await client.archiveContentType('type-agents')).deletedAt).toBeTypeOf('string');
      expect((await client.listContentTypes()).map((type) => type.key)).toEqual(['listings']);
      expect((await client.listArchivedContentTypes()).map((type) => type.key)).toEqual(['agents']);
      // Nothing about it changes while it is archived, and its key stays its own.
      await expect(client.createEntry({ type: 'agents', slug: 'someone-new', data: {} })).rejects.toMatchObject({ code: 'conflict' });
      await expect(client.addField('type-agents', { key: 'age', type: 'number', label: { en: 'Age' } })).rejects.toMatchObject({ code: 'conflict' });
      await expect(client.createContentType({ key: 'agents', kind: 'collection', label: { en: 'Agents' } })).rejects.toMatchObject({ code: 'conflict' });

      expect(await client.restoreContentType('type-agents')).not.toHaveProperty('deletedAt');
      expect((await client.listContentTypes()).map((type) => type.key)).toEqual(['agents', 'listings']);
      expect((await client.listEntries({ type: 'agents' })).total).toBe(before);
    });

    it('refuses a content type or a field that could not work, in words for the person', async () => {
      await expect(client.createContentType({ key: 'listings', kind: 'collection', label: { en: 'Again' } })).rejects.toMatchObject({ code: 'conflict' });
      await expect(client.createContentType({ key: 'My News', kind: 'collection', label: { en: 'News' } })).rejects.toMatchObject({ code: 'validation_failed', issues: [{ path: ['key'] }] });
      await expect(client.createContentType({ key: 'news', kind: 'collection', label: { en: ' ' } })).rejects.toMatchObject({ code: 'validation_failed', issues: [{ path: ['label'] }] });
      await expect(client.addField('type-agents', { key: 'name', type: 'text', label: { en: 'Name' } })).rejects.toMatchObject({ code: 'conflict' });
      await expect(client.addField('type-agents', { key: 'age', type: 'number', label: { en: 'Age' }, options: { min: 'young' } })).rejects.toMatchObject({ code: 'validation_failed' });
      await expect(client.changeField('type-agents', 'nothing', { required: true })).rejects.toMatchObject({ code: 'not_found' });
      await expect(client.arrangeFields('type-agents', { order: [] })).rejects.toMatchObject({ code: 'validation_failed' });
    });

    it('gives a link to a draft\'s page, and says why when its type has none', async () => {
      const link = await client.previewEntry('e2');
      expect(link.path).toMatch(/^\/listings\/18-alder-court\/\?preview=\d+\.[0-9a-f]{64}$/);
      expect(Date.parse(link.expiresAt)).toBeGreaterThan(Date.now());
      await expect(client.previewEntry('missing')).rejects.toMatchObject({ code: 'not_found' });
    });
  });
}
