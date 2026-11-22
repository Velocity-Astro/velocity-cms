import { definePlugin, type ContentTypeDef, type Entry, type NewForm, type SiteImage } from '@velocity-astro/cms-core';
import { tinyJpeg, tinyPng } from '@velocity-astro/cms-core/in-memory';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AdminClient, Person } from '../client/admin-client.js';
import type { SeedSubmission } from './memory-client.js';
import { sampleContentTypes, sampleEntries, sampleForms, sampleSubmissions } from './sample-content.js';

export interface AdminClientSeed {
  readonly contentTypes: readonly ContentTypeDef[];
  readonly entries: readonly Entry[];
  readonly images?: readonly SiteImage[];
  /** Whether the site takes uploads. Defaults to `true`. */
  readonly uploads?: boolean;
  /** Everyone who can sign in. Defaults to the person the client is signed in as. */
  readonly people?: readonly Person[];
  readonly forms?: readonly NewForm[];
  readonly submissions?: readonly SeedSubmission[];
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
        forms: sampleForms,
        submissions: sampleSubmissions,
        images: [
          { name: 'porch', url: '/images/porch.jpg' },
          { name: 'kitchen', url: '/images/kitchen.jpg', width: 1200, height: 800 },
        ],
      });
    });

    it('lists content types by key, and the control for each field type', async () => {
      expect((await client.listContentTypes()).map((type) => type.key)).toEqual(['agents', 'listings']);
      expect(await client.listFieldTypes()).toContainEqual({ type: 'number', editor: 'number-input', takesSubmissions: true });
      expect(await client.listFieldTypes()).toContainEqual({ type: 'richtext', editor: 'rich-text', takesSubmissions: false });
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

    it('finds entries of every type by what they hold', async () => {
      expect((await client.listEntries({ search: 'santa fe' })).items.map((entry) => entry.id)).toEqual(['e3']);
      expect((await client.listEntries({ search: '6214' })).items.map((entry) => entry.id)).toEqual(['e1']);
      expect((await client.listEntries({ type: 'listings', search: 'alder-court' })).items.map((entry) => entry.id)).toEqual(['e2']);
      expect((await client.listEntries({ search: 'nowhere at all' })).total).toBe(0);
      expect((await client.listEntries({})).total).toBeGreaterThanOrEqual(4);
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

    it('duplicates an entry as a draft of its own, each copy under a free slug', async () => {
      const original = await client.getEntry('e2');
      const copy = await client.duplicateEntry('e2');
      expect(copy).toMatchObject({ typeId: original.typeId, locale: original.locale, slug: `${original.slug}-copy`, status: 'draft', data: original.data, revision: 1 });
      expect(copy.id).not.toBe('e2');
      expect(copy.translationGroup).toBe(copy.id);
      expect((await client.duplicateEntry('e2')).slug).toBe(`${original.slug}-copy-2`);
      await expect(client.duplicateEntry('nothing')).rejects.toMatchObject({ code: 'not_found' });
    });

    it('sets a published entry\'s changes to go out later, and takes them off the schedule', async () => {
      const entry = await client.getEntry('e1');
      const at = '2999-01-01T09:00:00.000Z';
      const set = await client.scheduleEntry('e1', { at, expectedRevision: entry.revision });
      expect(set).toMatchObject({ status: 'published', publishAt: at, revision: entry.revision + 1 });
      expect(await client.unscheduleEntry('e1')).not.toHaveProperty('publishAt');
      await expect(client.scheduleEntry('e1', { at: '2001-01-01T09:00:00.000Z', expectedRevision: entry.revision + 2 })).rejects.toMatchObject({
        code: 'validation_failed',
        issues: [{ path: ['publishAt'] }],
      });
      // An entry not fit to publish is refused today, not when its time comes.
      await expect(client.scheduleEntry('e4', { at, expectedRevision: 1 })).rejects.toMatchObject({ code: 'validation_failed' });
    });

    it('lists every save of an entry and brings an earlier one back as a new save', async () => {
      const created = await client.createEntry({ type: 'agents', slug: 'maria-ortiz', data: { 'f-name': 'María Ortiz' } });
      const saved = await client.updateEntry(created.id, { slug: 'maria', data: { 'f-name': 'María' }, expectedRevision: 1 });
      const history = await client.entryHistory(created.id);
      expect(history.map((revision) => [revision.revision, revision.data['f-name']])).toEqual([[2, 'María'], [1, 'María Ortiz']]);
      const back = await client.revertEntry(created.id, { revision: 1, expectedRevision: saved.revision });
      // What it held then, under the slug it has now.
      expect(back).toMatchObject({ revision: 3, slug: 'maria', status: 'draft', data: { 'f-name': 'María Ortiz' } });
      expect((await client.entryHistory(created.id)).length).toBe(3);
      await expect(client.revertEntry(created.id, { revision: 1, expectedRevision: 2 })).rejects.toMatchObject({ code: 'conflict' });
      await expect(client.revertEntry(created.id, { revision: 9, expectedRevision: 3 })).rejects.toMatchObject({ code: 'not_found' });
    });

    it('moves an entry to the trash, brings it back as a draft, and deletes one for good', async () => {
      await client.publishEntry('e2', 1);
      const before = (await client.listEntries({ type: 'listings' })).total;
      const trashed = await client.trashEntry('e2');
      expect(trashed.status).toBe('draft');
      expect(trashed.deletedAt).toBeDefined();
      expect((await client.listEntries({ type: 'listings' })).total).toBe(before - 1);
      expect((await client.listTrash()).items.map((entry) => entry.id)).toEqual(['e2']);
      await expect(client.updateEntry('e2', { slug: trashed.slug, data: trashed.data, expectedRevision: trashed.revision })).rejects.toMatchObject({ code: 'conflict' });

      const restored = await client.restoreEntry('e2');
      expect(restored).toMatchObject({ status: 'draft', slug: '18-alder-court' });
      expect(restored).not.toHaveProperty('deletedAt');
      expect((await client.listTrash()).total).toBe(0);

      await expect(client.deleteEntry('e2')).rejects.toMatchObject({ code: 'conflict' });
      await client.trashEntry('e2');
      await client.deleteEntry('e2');
      await expect(client.getEntry('e2')).rejects.toMatchObject({ code: 'not_found' });
      expect((await client.listTrash({ limit: 5 })).items).toEqual([]);
    });

    it('lists forms, starts one, changes its fields all at once and keeps each field\'s id', async () => {
      expect((await client.listForms()).map((form) => form.key)).toEqual(['contact', 'tour']);
      const made = await client.createForm({ key: 'newsletter', label: { en: 'Newsletter' } });
      expect(made).toMatchObject({ key: 'newsletter', open: true, revision: 1, fields: [], notify: [] });
      await expect(client.createForm({ key: 'newsletter', label: { en: 'Again' } })).rejects.toMatchObject({ code: 'conflict' });

      const withFields = await client.updateForm(made.id, {
        fields: [
          { key: 'email', type: 'email', label: { en: 'Email' }, required: true },
          { key: 'name', type: 'text', label: { en: 'Name' } },
        ],
        notify: [' Office@Example.com '],
        contact: { email: 'email' },
        success: { en: 'You are on the list.' },
        retentionDays: 365,
        expectedRevision: made.revision,
      });
      const [email, name] = withFields.fields;
      expect(withFields).toMatchObject({ notify: ['office@example.com'], contact: { email: email?.id }, success: { en: 'You are on the list.' }, retentionDays: 365 });

      const reordered = await client.updateForm(made.id, {
        fields: [
          { id: name?.id ?? '', key: 'fullName', type: 'text', label: { en: 'Full name' } },
          { id: email?.id ?? '', key: 'email', type: 'email', label: { en: 'Email' }, required: true },
        ],
        success: null,
        retentionDays: null,
        open: false,
        expectedRevision: withFields.revision,
      });
      expect(reordered.fields.map((field) => [field.id, field.key])).toEqual([[name?.id, 'fullName'], [email?.id, 'email']]);
      expect(reordered).toMatchObject({ open: false, contact: { email: email?.id } });
      expect(reordered).not.toHaveProperty('success');
      expect(reordered).not.toHaveProperty('retentionDays');

      await expect(client.updateForm(made.id, { open: true, expectedRevision: made.revision })).rejects.toMatchObject({ code: 'conflict' });
      await expect(client.updateForm(made.id, { fields: [{ key: 'body', type: 'richtext', label: { en: 'Body' } }], expectedRevision: reordered.revision })).rejects.toMatchObject({ code: 'validation_failed' });
    });

    it('moves a form to the trash and back, and deletes it for good with what it was sent', async () => {
      const [contact] = await client.listForms();
      if (!contact) throw new Error('No form');
      await expect(client.deleteForm(contact.id)).rejects.toMatchObject({ code: 'conflict' });
      await client.trashForm(contact.id);
      expect((await client.listForms()).map((form) => form.key)).toEqual(['tour']);
      expect((await client.listTrashedForms()).map((form) => form.key)).toEqual(['contact']);
      await client.restoreForm(contact.id);
      expect((await client.listTrashedForms())).toEqual([]);
      await client.trashForm(contact.id);
      await client.deleteForm(contact.id);
      expect((await client.listTrashedForms())).toEqual([]);
      expect((await client.listSubmissions({ formId: contact.id })).total).toBe(0);
    });

    it('lists what a form was sent newest first, counts it by status, and marks and deletes a submission', async () => {
      const [contact] = await client.listForms();
      if (!contact) throw new Error('No form');
      const all = await client.listSubmissions({ formId: contact.id });
      expect(all.total).toBe(3);
      expect(await client.countSubmissions(contact.id)).toEqual({ new: 2, handled: 0, spam: 1 });
      const fresh = await client.listSubmissions({ formId: contact.id, status: 'new', limit: 1 });
      expect(fresh.total).toBe(2);
      expect(fresh.items).toHaveLength(1);
      const [first] = fresh.items;
      if (!first) throw new Error('No submission');

      const handled = await client.markSubmission(first.id, 'handled');
      expect(handled).toMatchObject({ status: 'handled', handledBy: 'u1' });
      expect(await client.countSubmissions(contact.id)).toEqual({ new: 1, handled: 1, spam: 1 });
      await client.deleteSubmission(first.id);
      await expect(client.markSubmission(first.id, 'new')).rejects.toMatchObject({ code: 'not_found' });
      expect((await client.listSubmissions({ formId: contact.id })).total).toBe(2);
    });

    it('exports what a form was sent as a file, and forgets a sender everywhere', async () => {
      const [contact, tour] = await client.listForms();
      if (!contact || !tour) throw new Error('No forms');
      const [header, ...rows] = (await client.exportSubmissions(contact.id)).trim().split('\r\n');
      expect(header).toBe('received,status,page,name,email,message');
      expect(rows).toHaveLength(3);
      expect(rows.join('\n')).toContain('Ana@Example.com');

      expect(await client.forgetSender(' Ana@Example.com ')).toBe(2);
      expect((await client.listSubmissions({ formId: contact.id })).total).toBe(2);
      expect((await client.listSubmissions({ formId: tour.id })).total).toBe(0);
      await expect(client.forgetSender(' ')).rejects.toMatchObject({ code: 'validation_failed' });
    });

    it('saves how email is sent without ever sending the key back, and sends a test once it can', async () => {
      expect(await client.getEmailSettings()).toEqual({ provider: 'resend', from: '', senderName: '', hasKey: false, sending: false, canTest: false, revision: 0 });
      await expect(client.sendTestEmail()).rejects.toMatchObject({ code: 'conflict' });
      await expect(client.saveEmailSettings({ from: 'nobody', apiKey: 're_123', expectedRevision: 0 })).rejects.toMatchObject({ code: 'validation_failed', issues: [{ path: ['from'] }] });
      const saved = await client.saveEmailSettings({ from: 'Lakeshore <hello@example.com>', apiKey: 're_123', expectedRevision: 0 });
      expect(saved).toEqual({ provider: 'resend', from: 'Lakeshore <hello@example.com>', senderName: '', hasKey: true, sending: true, canTest: true, revision: 1 });
      expect(await client.sendTestEmail()).toBeUndefined();
      await expect(client.saveEmailSettings({ from: 'hello@example.com', expectedRevision: 0 })).rejects.toMatchObject({ code: 'conflict' });
      expect(await client.saveEmailSettings({ from: 'hello@example.com', apiKey: null, expectedRevision: 1 })).toMatchObject({ from: 'hello@example.com', hasKey: false, sending: false, canTest: false, revision: 2 });
      // The sender's name alone can be saved, and the address stays.
      expect(await client.saveEmailSettings({ senderName: '  Lakeshore   Realty ', expectedRevision: 2 })).toMatchObject({ from: 'hello@example.com', senderName: 'Lakeshore Realty', revision: 3 });
      await expect(client.saveEmailSettings({ senderName: 'Bad <name>', expectedRevision: 3 })).rejects.toMatchObject({ code: 'validation_failed', issues: [{ path: ['senderName'] }] });
    });

    it('saves what the site is called, and goes back to its own name when that is emptied', async () => {
      expect(await client.getGeneralSettings()).toEqual({ siteName: '', defaultSiteName: 'Lakeshore Realty', revision: 0 });
      await expect(client.saveGeneralSettings({ siteName: 'x'.repeat(81), expectedRevision: 0 })).rejects.toMatchObject({ code: 'validation_failed', issues: [{ path: ['siteName'] }] });
      expect(await client.saveGeneralSettings({ siteName: ' Oakhaven  Homes ', expectedRevision: 0 })).toEqual({ siteName: 'Oakhaven Homes', defaultSiteName: 'Lakeshore Realty', revision: 1 });
      await expect(client.saveGeneralSettings({ siteName: 'Other', expectedRevision: 0 })).rejects.toMatchObject({ code: 'conflict' });
      expect(await client.saveGeneralSettings({ siteName: '', expectedRevision: 1 })).toMatchObject({ siteName: '', revision: 2 });
    });

    it('saves the bucket uploads are kept in without ever sending the secret key back, and tries it once it can', async () => {
      expect(await client.getStorageSettings()).toEqual({ endpoint: '', bucket: '', region: '', accessKeyId: '', hasSecret: false, keeping: 'folder', revision: 0 });
      await expect(client.testStorage()).rejects.toMatchObject({ code: 'conflict' });
      const bucket = { endpoint: 'https://acct.r2.example.com', bucket: 'photos', accessKeyId: 'AKIA123', secretAccessKey: 'shh-secret', expectedRevision: 0 };
      await expect(client.saveStorageSettings({ ...bucket, endpoint: 'http://localhost' })).rejects.toMatchObject({ code: 'validation_failed', issues: [{ path: ['endpoint'] }] });
      expect(await client.saveStorageSettings(bucket)).toEqual({ endpoint: 'https://acct.r2.example.com', bucket: 'photos', region: '', accessKeyId: 'AKIA123', hasSecret: true, keeping: 'bucket', revision: 1 });
      expect(await client.testStorage()).toBeUndefined();
      await expect(client.saveStorageSettings(bucket)).rejects.toMatchObject({ code: 'conflict' });
      expect(await client.saveStorageSettings({ ...bucket, secretAccessKey: null, expectedRevision: 1 })).toMatchObject({ hasSecret: false, keeping: 'folder', revision: 2 });
    });

    it('saves how forms are guarded without ever sending the secret key back, and checks the keys once it can', async () => {
      expect(await client.getFormsSettings()).toEqual({ provider: 'turnstile', siteKey: '', hasSecret: false, checking: false, postsPerAddress: 8, revision: 0 });
      await expect(client.testFormsSettings()).rejects.toMatchObject({ code: 'conflict' });
      const keys = { siteKey: '0x4AAAAAAAsitekey', secretKey: '0x4AAAAAAAsecretkey', postsPerAddress: 20, expectedRevision: 0 };
      await expect(client.saveFormsSettings({ ...keys, postsPerAddress: 0 })).rejects.toMatchObject({ code: 'validation_failed', issues: [{ path: ['postsPerAddress'] }] });
      await expect(client.saveFormsSettings({ ...keys, siteKey: '' })).rejects.toMatchObject({ code: 'validation_failed', issues: [{ path: ['siteKey'] }] });
      expect(await client.saveFormsSettings(keys)).toEqual({ provider: 'turnstile', siteKey: '0x4AAAAAAAsitekey', hasSecret: true, checking: true, postsPerAddress: 20, revision: 1 });
      expect(await client.testFormsSettings()).toBeUndefined();
      await expect(client.saveFormsSettings(keys)).rejects.toMatchObject({ code: 'conflict' });
      expect(await client.saveFormsSettings({ siteKey: '', secretKey: null, postsPerAddress: 20, expectedRevision: 1 })).toEqual({ provider: 'turnstile', siteKey: '', hasSecret: false, checking: false, postsPerAddress: 20, revision: 2 });
    });

    it('keeps a pipeline of stages, and places a contact in it with someone to look after it and a day to follow up', async () => {
      const pipeline = await client.getPipeline();
      expect(pipeline.stages.map((stage) => stage.id)).toEqual(['new', 'contacted', 'qualified', 'won', 'lost']);
      const [me] = await client.listTeam();
      if (!me) throw new Error('Nobody on the team');
      expect(me).toEqual({ id: 'u1', name: 'Dana', role: 'owner' });
      const [ana] = (await client.listContacts({ search: 'ana' })).items;
      if (!ana) throw new Error('No contact for Ana');
      expect(ana.stage).toBe('new');
      const moved = await client.updateContact(ana.id, { stage: 'qualified', ownerId: me.id, followUpAt: '2026-03-14', expectedRevision: ana.revision });
      expect(moved).toMatchObject({ stage: 'qualified', ownerId: 'u1', followUpAt: '2026-03-14' });
      await expect(client.updateContact(ana.id, { stage: 'nowhere', expectedRevision: moved.revision })).rejects.toMatchObject({ code: 'validation_failed', issues: [{ path: ['stage'] }] });
      expect((await client.listContacts({ stage: 'qualified' })).items.map((contact) => contact.id)).toEqual([ana.id]);
      expect((await client.listContacts({ ownerId: null })).total).toBe(1);
      expect((await client.listContacts({ ownerId: 'u1', followUpBy: '2026-03-14' })).total).toBe(1);
      expect((await client.listContacts({ followUpBy: '2026-03-13' })).total).toBe(0);
      const saved = await client.savePipeline({ stages: [{ id: 'new', label: 'Fresh', kind: 'open' }, { label: 'Viewing booked', kind: 'open' }, { id: 'won', kind: 'won' }], expectedRevision: 0 });
      expect(saved.stages.map((stage) => stage.label)).toEqual(['Fresh', 'Viewing booked', undefined]);
      expect((await client.getContact(ana.id)).stage).toBe('new');
      await expect(client.savePipeline({ stages: [], expectedRevision: 1 })).rejects.toMatchObject({ code: 'validation_failed' });
      await expect(client.savePipeline({ stages: [{ id: 'new', kind: 'open' }], expectedRevision: 0 })).rejects.toMatchObject({ code: 'conflict' });
      // A monthly target is a whole number above 0, kept until it is changed or cleared.
      const targeted = await client.savePipeline({ stages: saved.stages, monthlyTarget: 20000, expectedRevision: saved.revision });
      expect(targeted.monthlyTarget).toBe(20000);
      expect((await client.savePipeline({ stages: targeted.stages, expectedRevision: targeted.revision })).monthlyTarget).toBe(20000);
      await expect(client.savePipeline({ stages: targeted.stages, monthlyTarget: 12.5, expectedRevision: targeted.revision + 1 })).rejects.toMatchObject({ code: 'validation_failed' });
      expect((await client.savePipeline({ stages: targeted.stages, monthlyTarget: null, expectedRevision: targeted.revision + 1 })).monthlyTarget).toBeUndefined();
    });

    it('keeps deals for a contact, forecasts them by stage, and gives new contacts to whoever the pipeline names', async () => {
      const [ana] = (await client.listContacts({ search: 'ana' })).items;
      if (!ana) throw new Error('No contact for Ana');
      const deal = await client.createDeal({ contactId: ana.id, title: ' Sale of 18 Alder Court ', value: 450000, closeOn: '2026-03-14' });
      expect(deal).toMatchObject({ title: 'Sale of 18 Alder Court', value: 450000, stage: 'new', closeOn: '2026-03-14', revision: 1 });
      await expect(client.createDeal({ contactId: ana.id, title: '', value: -1 })).rejects.toMatchObject({ code: 'validation_failed', issues: [{ path: ['title'] }, { path: ['value'] }] });
      const moved = await client.updateDeal(deal.id, { stage: 'qualified', ownerId: 'u1', closeOn: null, expectedRevision: 1 });
      expect(moved).toMatchObject({ stage: 'qualified', ownerId: 'u1', revision: 2 });
      expect(moved.closeOn).toBeUndefined();
      await expect(client.updateDeal(deal.id, { value: 1, expectedRevision: 1 })).rejects.toMatchObject({ code: 'conflict' });
      expect((await client.listDeals({ contactId: ana.id })).items.map((item) => item.id)).toEqual([deal.id]);
      expect((await client.listDeals({ stage: 'new' })).total).toBe(0);
      expect((await client.listDeals({ ownerId: null })).total).toBe(0);
      expect(await client.getForecast()).toMatchObject({ currency: 'USD', open: 450000, weighted: 270000, won: 0, lost: 0 });
      const pipeline = await client.savePipeline({ stages: [{ id: 'new', kind: 'open' }, { id: 'qualified', kind: 'open', chance: 80 }, { id: 'won', kind: 'won' }], currency: 'EUR', assignTo: ['u1'], expectedRevision: 0 });
      expect(pipeline).toMatchObject({ currency: 'EUR', assignTo: ['u1'] });
      expect(await client.getForecast()).toMatchObject({ currency: 'EUR', weighted: 360000 });
      await client.deleteDeal(deal.id);
      expect((await client.listDeals()).total).toBe(0);
    });

    it('keeps a contact for everyone who wrote in, and adds, changes, notes, exports and erases one', async () => {
      const listed = await client.listContacts();
      expect(listed.items.map((contact) => contact.email).sort()).toEqual(['ana@example.com', 'tom@example.com']);
      const [ana] = (await client.listContacts({ search: 'ANA' })).items;
      if (!ana) throw new Error('No contact for Ana');
      expect(ana).toMatchObject({ name: 'Ana Ruiz', source: { page: '/contact/' } });
      expect(await client.getContact(ana.id)).toEqual(ana);

      const li = await client.createContact({ email: ' Li@Example.com ', name: 'Li Wei' });
      expect(li).toMatchObject({ email: 'li@example.com', name: 'Li Wei', revision: 1 });
      await expect(client.createContact({ email: 'li@example.com' })).rejects.toMatchObject({ code: 'validation_failed', issues: [{ path: ['email'] }] });
      expect(await client.updateContact(li.id, { name: null, phone: '512 555 0199', expectedRevision: 1 })).toMatchObject({ phone: '512 555 0199', revision: 2 });
      await expect(client.updateContact(li.id, { name: 'Li', expectedRevision: 1 })).rejects.toMatchObject({ code: 'conflict' });

      // A file's rows: a new person is added, a known one only gains what they lack, and a bad row is reported by its place.
      const report = await client.importContacts([{ email: 'Omar@Example.com', name: 'Omar Haddad' }, { email: 'li@example.com', name: 'Li Wei', phone: '512 555 0100' }, { email: 'not an address' }]);
      expect(report).toEqual({ added: 1, filled: 1, unchanged: 0, problems: [{ row: 2, message: expect.stringContaining('email') as string }] });
      expect(await client.getContact(li.id)).toMatchObject({ name: 'Li Wei', phone: '512 555 0199', revision: 3 });

      const note = await client.addContactNote(ana.id, ' Called back. ');
      expect(note).toMatchObject({ text: 'Called back.', contactId: ana.id });
      const timeline = await client.contactTimeline(ana.id);
      expect(timeline.map((item) => item.kind).sort()).toEqual(['note', 'submission', 'submission']);
      const sent = timeline.find((item) => item.kind === 'submission');
      expect(sent).toMatchObject({ formLabel: { en: expect.any(String) as string }, answers: expect.arrayContaining([expect.objectContaining({ key: 'email' })]) as unknown });
      await client.deleteContactNote(ana.id, note.id);
      expect(await client.contactTimeline(ana.id)).toHaveLength(2);

      const file = JSON.parse(await client.exportContact(ana.id)) as { contact: { email: string }; submissions: unknown[] };
      expect(file.contact.email).toBe('ana@example.com');
      expect(file.submissions).toHaveLength(2);

      expect(await client.eraseContact(ana.id)).toBe(2);
      await expect(client.getContact(ana.id)).rejects.toMatchObject({ code: 'not_found' });
      expect((await client.listContacts()).total).toBe(3);
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

    it('lets an owner rename someone, and refuses a name that could not be one', async () => {
      const ben = await client.invitePerson({ email: 'ben@example.com', name: 'Ben', role: 'author' });
      expect(await client.renamePerson(ben.id, '  Ben   Carter ')).toMatchObject({ id: ben.id, name: 'Ben Carter', role: 'author' });
      expect((await client.listPeople()).map((person) => person.name)).toEqual(['Ben Carter', 'Dana']);
      await expect(client.renamePerson(ben.id, ' ')).rejects.toMatchObject({ code: 'validation_failed', issues: [{ path: ['name'] }] });
      await expect(client.renamePerson('nobody', 'Ann')).rejects.toMatchObject({ code: 'not_found' });
    });

    it('keeps the person\'s own profile: their name and photo, and a new address only through its link', async () => {
      expect(await client.getProfile()).toMatchObject({ id: 'u1', email: 'dana@example.com', name: 'Dana', role: 'owner' });
      const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==';
      expect(await client.saveProfile({ name: 'Dana Whitfield', image: photo })).toMatchObject({ name: 'Dana Whitfield', image: photo });
      expect(await client.saveProfile({ image: null })).not.toHaveProperty('image');
      await expect(client.saveProfile({ image: 'data:text/html;base64,PGI+' })).rejects.toMatchObject({ code: 'validation_failed', issues: [{ path: ['image'] }] });
      await expect(client.saveProfile({ name: '' })).rejects.toMatchObject({ code: 'validation_failed', issues: [{ path: ['name'] }] });

      await expect(client.askEmailChange('nope')).rejects.toMatchObject({ code: 'validation_failed', issues: [{ path: ['email'] }] });
      await expect(client.askEmailChange('dana@example.com')).rejects.toMatchObject({ code: 'validation_failed' });
      expect(await client.askEmailChange('dana@new.example')).toBeUndefined();
      // Nothing changes until the link is opened, and a token that is not the link's opens nothing.
      expect(await client.getProfile()).toMatchObject({ email: 'dana@example.com' });
      await expect(client.confirmEmailChange('not-the-token')).rejects.toMatchObject({ code: 'conflict' });
    });

    it('makes access tokens for agents, shows each once, lists them and takes them away', async () => {
      expect(await client.listTokens()).toEqual([]);
      const { token, secret } = await client.createToken({ name: 'Claude', role: 'editor', publish: false, personalData: false, days: 30 });
      expect(secret).toMatch(/^vcms_/);
      expect(token).toMatchObject({ name: 'Claude', role: 'editor', publish: false, personalData: false, hint: secret.slice(-4), madeBy: 'Dana' });
      expect(await client.listTokens()).toEqual([token]);
      await expect(client.createToken({ name: 'All', role: 'owner', publish: true, personalData: true, days: 30 })).rejects.toMatchObject({ code: 'validation_failed', issues: [{ path: ['role'] }] });
      await client.revokeToken(token.id);
      expect(await client.listTokens()).toEqual([]);
      await expect(client.revokeToken(token.id)).rejects.toMatchObject({ code: 'not_found' });
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

    it('lets a content type take deals, and keeps and finds the entry a deal is about', async () => {
      const listings = (await client.listContentTypes()).find((type) => type.key === 'listings');
      const [ana] = (await client.listContacts({ search: 'ana' })).items;
      const [listing] = (await client.listEntries({ type: 'listings' })).items;
      if (!listings || !ana || !listing) throw new Error('No listing or contact to start from');
      const about = { typeId: listings.id, entry: listing.translationGroup };
      await expect(client.createDeal({ contactId: ana.id, title: 'Sale', value: 1, about })).rejects.toMatchObject({ code: 'validation_failed', issues: [{ path: ['about'] }] });
      expect((await client.updateContentType(listings.id, { forDeals: true })).forDeals).toBe(true);
      const deal = await client.createDeal({ contactId: ana.id, title: 'Sale', value: 1, about });
      await client.createDeal({ contactId: ana.id, title: 'Other', value: 1 });
      expect(deal.about).toEqual(about);
      expect((await client.listDeals({ about })).items.map((item) => item.id)).toEqual([deal.id]);
      expect((await client.updateDeal(deal.id, { about: null, expectedRevision: 1 })).about).toBeUndefined();
      expect((await client.listDeals({ about })).total).toBe(0);
    });

    it('keeps the site\'s own fields for contacts and deals, and what is filled in under them', async () => {
      expect(await client.getCustomFields()).toEqual({ contact: [], deal: [], revision: 0 });
      const saved = await client.saveCustomFields({
        contact: [{ key: 'membership', type: 'select', label: { en: 'Membership' }, options: { choices: ['monthly', 'yearly'] } }],
        deal: [{ key: 'seats', type: 'number', label: { en: 'Seats' }, options: { integer: true } }],
        expectedRevision: 0,
      });
      expect([saved.contact.map((field) => field.key), saved.deal.map((field) => field.key), saved.revision]).toEqual([['membership'], ['seats'], 1]);
      expect(await client.getCustomFields()).toEqual(saved);
      await expect(client.saveCustomFields({ contact: [], expectedRevision: 0 })).rejects.toMatchObject({ code: 'conflict' });
      await expect(client.saveCustomFields({ contact: [{ key: 'body', type: 'richtext', label: { en: 'Body' } }], expectedRevision: 1 })).rejects.toMatchObject({ code: 'validation_failed' });

      const membership = saved.contact[0]?.id ?? '';
      const seats = saved.deal[0]?.id ?? '';
      const sam = await client.createContact({ email: 'sam@example.com', data: { [membership]: 'yearly' } });
      expect(sam.data).toEqual({ [membership]: 'yearly' });
      await expect(client.updateContact(sam.id, { data: { [membership]: 'weekly' }, expectedRevision: sam.revision })).rejects.toMatchObject({ code: 'validation_failed', issues: [{ path: ['data', 'membership'] }] });
      expect((await client.updateContact(sam.id, { data: { [membership]: 'monthly' }, expectedRevision: sam.revision })).data).toEqual({ [membership]: 'monthly' });
      const deal = await client.createDeal({ contactId: sam.id, title: 'Team plan', value: 900, data: { [seats]: 12 } });
      expect(deal.data).toEqual({ [seats]: 12 });
      expect((await client.updateDeal(deal.id, { data: { [seats]: null }, expectedRevision: deal.revision })).data).toBeUndefined();
    });

    it('saves a plugin\'s secret without ever sending it back, and shows its work with a way to try again', async () => {
      let works = false;
      const site = await make({
        contentTypes: [],
        entries: [],
        plugins: [
          definePlugin({
            name: 'mail',
            apiVersion: 1,
            label: { en: 'Mail' },
            secrets: [{ key: 'apiKey', label: { en: 'API key' } }],
            setup(plugin) {
              plugin.tasks.define('send', () => {
                if (!works) throw new Error('The service answered 500.');
              });
              plugin.routes.add('POST', '/send', () => plugin.tasks.add('send', { to: 'ana@example.com' }, { label: 'A message' }));
              plugin.routes.add('GET', '/key', async () => ({ key: await plugin.secrets.get('apiKey') }));
            },
          }),
        ],
      });
      expect((await site.getPluginSettings('mail')).secrets).toEqual([{ key: 'apiKey', label: { en: 'API key' }, isSet: false }]);
      await expect(site.setPluginSecret('mail', 'apiKey', ' ')).rejects.toMatchObject({ code: 'validation_failed' });
      const saved = await site.setPluginSecret('mail', 'apiKey', 'sk-12345');
      expect(saved.secrets[0]?.isSet).toBe(true);
      expect(JSON.stringify(saved)).not.toContain('sk-12345');
      expect(await site.callPlugin('mail', 'GET', '/key')).toEqual({ key: 'sk-12345' });
      expect((await site.setPluginSecret('mail', 'apiKey', null)).secrets[0]?.isSet).toBe(false);

      expect(await site.listPluginTasks('mail')).toEqual([]);
      await site.callPlugin('mail', 'POST', '/send');
      const [task] = await site.listPluginTasks('mail');
      expect(task).toMatchObject({ kind: 'send', label: 'A message', status: 'waiting', attempts: 1, lastError: 'The service answered 500.', canRetry: false });
      expect(JSON.stringify(task)).not.toContain('ana@example.com');
      // Only work that was given up on can be tried again by hand.
      await expect(site.retryPluginTask('mail', task?.id ?? '')).rejects.toMatchObject({ code: 'conflict' });
      await expect(site.retryPluginTask('mail', 'nothing')).rejects.toMatchObject({ code: 'not_found' });
      works = true;
    });

    it('names the plugins that add to the editor, and reaches a plugin\'s own addresses', async () => {
      expect(await client.listPluginEditors()).toEqual([]);
      const site = await make({
        contentTypes: [],
        entries: [],
        plugins: [
          definePlugin({
            name: 'notes',
            apiVersion: 1,
            label: { en: 'Notes' },
            editor: 'export default () => {};',
            setup(plugin) {
              plugin.routes.add('GET', '/notes/:id', ({ params, query }) => ({ id: params['id'], full: query['full'] === 'yes' }));
              plugin.routes.add('PUT', '/notes/:id', async ({ params, body }) => void (await plugin.store.set(`note:${params['id'] ?? ''}`, body)));
              plugin.routes.add('GET', '/stored/:id', async ({ params }) => ({ note: await plugin.store.get(`note:${params['id'] ?? ''}`) }));
            },
          }),
        ],
      });
      expect(await site.listPluginEditors()).toEqual([{ name: 'notes', label: { en: 'Notes' } }]);
      expect(await site.callPlugin('notes', 'GET', '/notes/7', { query: { full: 'yes' } })).toEqual({ id: '7', full: true });
      expect(await site.callPlugin('notes', 'PUT', '/notes/7', { body: { text: 'hello' } })).toEqual({});
      expect(await site.callPlugin('notes', 'GET', '/stored/7')).toEqual({ note: { text: 'hello' } });
      await expect(site.callPlugin('notes', 'GET', '/nowhere')).rejects.toMatchObject({ code: 'not_found' });
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
