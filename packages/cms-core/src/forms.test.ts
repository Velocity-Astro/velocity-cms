import { beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from './access.js';
import { createCms, type Cms } from './cms.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors.js';
import type { FormDef } from './model.js';
import { definePlugin } from './plugin.js';
import {
  FakeClock,
  InMemoryEntryRepository,
  InMemoryFormRepository,
  InMemorySchemaRepository,
  InMemorySubmissionRepository,
  SequentialIds,
  formRepositoryContract,
  submissionRepositoryContract,
} from './testing/index.js';

formRepositoryContract('InMemoryFormRepository', async () => new InMemoryFormRepository());
submissionRepositoryContract('InMemorySubmissionRepository', async () => new InMemorySubmissionRepository());

const owner: Actor = { kind: 'user', id: 'maya', role: 'owner' };
const editor: Actor = { kind: 'user', id: 'daniel', role: 'editor' };
const author: Actor = { kind: 'user', id: 'priya', role: 'author' };

let cms: Cms;
let contact: FormDef;
let heard: string[];

const idOf = (form: FormDef, key: string): string => {
  const field = form.fields.find((candidate) => candidate.key === key && candidate.deletedAt === undefined);
  if (!field) throw new Error(`No field "${key}"`);
  return field.id;
};
const answers = { name: ' Ana Ruiz ', email: 'Ana@Example.com', phone: '512 555 0142', message: 'Is the house on Alder still for sale?', updates: 'on' };
const issuesOf = async (work: Promise<unknown>) => {
  const error: unknown = await work.then(
    () => null,
    (caught: unknown) => caught,
  );
  if (!(error instanceof ValidationError)) throw new Error('Expected a ValidationError');
  return error.issues.map((issue) => [issue.path.join('.'), issue.message]);
};

beforeEach(async () => {
  heard = [];
  cms = createCms({ entries: new InMemoryEntryRepository(), types: new InMemorySchemaRepository(), clock: new FakeClock(), ids: new SequentialIds() });
  for (const event of ['form.saved', 'form.trashed', 'form.restored', 'form.deleted', 'submission.received', 'submission.changed', 'submission.deleted'] as const) {
    cms.events.on(event, () => void heard.push(event));
  }
  contact = await cms.forms.create(editor, {
    key: 'contact',
    label: { en: 'Contact us' },
    fields: [
      { key: 'name', type: 'text', label: { en: 'Your name' }, required: true, options: { maxLength: 80 } },
      { key: 'email', type: 'email', label: { en: 'Email' }, required: true },
      { key: 'phone', type: 'phone', label: { en: 'Phone' } },
      { key: 'budget', type: 'number', label: { en: 'Budget' }, options: { min: 0 } },
      { key: 'reason', type: 'select', label: { en: 'Reason' }, options: { choices: ['buy', 'sell'] } },
      { key: 'message', type: 'text', label: { en: 'Message' }, required: true, options: { multiline: true } },
      { key: 'updates', type: 'boolean', label: { en: 'Send me updates' } },
    ],
    notify: [' Office@Example.com ', 'office@example.com'],
    contact: { name: 'name', email: 'email', phone: 'phone' },
    success: { en: 'Thank you. We will be in touch.' },
  });
  heard.length = 0;
});

describe('FormService', () => {
  it('stores a form with a permanent id for each field, its marks by field id and its addresses cleaned', () => {
    expect(contact).toMatchObject({ key: 'contact', open: true, revision: 1, notify: ['office@example.com'] });
    expect(contact.fields.map((field) => [field.key, field.translated])).toEqual([
      ['name', false], ['email', false], ['phone', false], ['budget', false], ['reason', false], ['message', false], ['updates', false],
    ]);
    expect(contact.contact).toEqual({ name: idOf(contact, 'name'), email: idOf(contact, 'email'), phone: idOf(contact, 'phone') });
  });

  it('takes only kinds of field a visitor can fill in', async () => {
    const refused = cms.forms.create(owner, { key: 'apply', label: { en: 'Apply' }, fields: [{ key: 'story', type: 'richtext', label: { en: 'Story' } }] });
    await expect(refused).rejects.toThrowError(/cannot ask for a richtext field \("story"\)\. A visitor can fill in: boolean, date, email, number, phone, select, text, url\./);
  });

  it('refuses a key that cannot be used, a key twice, an address that is not one, and a mark with no field', async () => {
    const make = (extra: object) => cms.forms.create(owner, { key: 'apply', label: { en: 'Apply' }, ...extra });
    await expect(cms.forms.create(owner, { key: 'Not A Key', label: { en: 'x' } })).rejects.toBeInstanceOf(ValidationError);
    await expect(cms.forms.create(owner, { key: 'contact', label: { en: 'Again' } })).rejects.toBeInstanceOf(ConflictError);
    const twice = [{ key: 'a', type: 'text', label: { en: 'A' } }, { key: 'a', type: 'text', label: { en: 'A again' } }];
    await expect(make({ fields: twice })).rejects.toBeInstanceOf(ConflictError);
    await expect(make({ notify: ['not an address'] })).rejects.toThrowError(/"not an address" is not an email address/);
    await expect(make({ contact: { email: 'email' } })).rejects.toThrowError(/no field with the key "email"/);
    await expect(make({ retentionDays: 0 })).rejects.toThrowError(/1 to 3650 days/);
  });

  it('lets owners and editors change forms, and authors only read them', async () => {
    await expect(cms.forms.create(author, { key: 'apply', label: { en: 'Apply' } })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(cms.forms.update(author, contact.id, { open: false, expectedRevision: 1 })).rejects.toBeInstanceOf(ForbiddenError);
    expect((await cms.forms.list(author)).map((form) => form.key)).toEqual(['contact']);
    expect(await cms.forms.get(author, contact.id)).toEqual(contact);
  });

  it('keeps a field\'s id through a new key, starts a new one for a new kind, and marks what is left out as removed', async () => {
    const [name, email, phone, , , message] = contact.fields;
    if (!name || !email || !phone || !message) throw new Error('The form is not as described.');
    const changed = await cms.forms.update(editor, contact.id, {
      fields: [
        { ...name, key: 'fullName' },
        { key: 'email', type: 'email', label: { en: 'Email address' }, required: true },
        { key: 'message', type: 'select', label: { en: 'Message' }, options: { choices: ['a'] } },
        { key: 'when', type: 'date', label: { en: 'When' } },
      ],
      expectedRevision: 1,
    });
    const live = changed.fields.filter((field) => field.deletedAt === undefined);
    expect(live.map((field) => field.key)).toEqual(['fullName', 'email', 'message', 'when']);
    expect(idOf(changed, 'fullName')).toBe(name.id);
    expect(idOf(changed, 'email')).toBe(email.id);
    expect(idOf(changed, 'message')).not.toBe(message.id);
    const removed = changed.fields.filter((field) => field.deletedAt !== undefined).map((field) => field.key);
    expect(removed.sort()).toEqual(['budget', 'message', 'phone', 'reason', 'updates']);
    // The marks follow a renamed field and go with a removed one.
    expect(changed.contact).toEqual({ name: name.id, email: email.id });
    expect(changed.revision).toBe(2);
    expect(heard).toEqual(['form.saved']);
  });

  it('changes only what it is told to, clears what is set to null, and refuses a save from an old revision', async () => {
    const closed = await cms.forms.update(editor, contact.id, { open: false, retentionDays: 90, submitLabel: { en: 'Send' }, expectedRevision: 1 });
    expect(closed).toMatchObject({ open: false, retentionDays: 90, submitLabel: { en: 'Send' }, success: contact.success, notify: contact.notify, fields: contact.fields, contact: contact.contact });
    const cleared = await cms.forms.update(editor, contact.id, { retentionDays: null, success: null, expectedRevision: 2 });
    expect(cleared).not.toHaveProperty('retentionDays');
    expect(cleared).not.toHaveProperty('success');
    expect(cleared.submitLabel).toEqual({ en: 'Send' });
    await expect(cms.forms.update(owner, contact.id, { open: true, expectedRevision: 2 })).rejects.toThrowError(/saved by someone else/);
  });

  it('gives the site an open form to draw, by key, and nothing for one that is closed or in the trash', async () => {
    const drawn = await cms.forms.forSite('contact');
    expect(drawn).toMatchObject({ key: 'contact', label: { en: 'Contact us' }, success: { en: 'Thank you. We will be in touch.' } });
    expect(drawn?.fields[0]).toEqual({ key: 'name', type: 'text', label: { en: 'Your name' }, required: true, options: { maxLength: 80 } });
    // Who is told, and which field is whose email, are not the page's to know.
    expect(drawn).not.toHaveProperty('notify');
    expect(drawn).not.toHaveProperty('contact');
    await cms.forms.update(editor, contact.id, { open: false, expectedRevision: 1 });
    expect(await cms.forms.forSite('contact')).toBeNull();
    expect(await cms.forms.forSite('nothing')).toBeNull();
  });

  it('gives the site the form a section chose, by id, whatever its key is today', async () => {
    await cms.forms.update(editor, contact.id, { key: 'get-in-touch', expectedRevision: 1 });
    expect(await cms.forms.forSiteById(contact.id)).toMatchObject({ key: 'get-in-touch', label: { en: 'Contact us' } });
    expect(await cms.forms.forSiteById('nothing')).toBeNull();
    await cms.forms.trash(editor, contact.id);
    expect(await cms.forms.forSiteById(contact.id)).toBeNull();
  });

  it('moves a form to the trash with what it was sent, frees its key, restores it, and deletes it for good with its submissions', async () => {
    await cms.submissions.submit('contact', answers);
    const trashed = await cms.forms.trash(editor, contact.id);
    expect(trashed.deletedAt).toBeDefined();
    expect(await cms.forms.list(editor)).toEqual([]);
    expect(await cms.forms.listTrashed(editor)).toEqual([trashed]);
    expect(await cms.forms.forSite('contact')).toBeNull();
    await expect(cms.submissions.submit('contact', answers)).rejects.toBeInstanceOf(NotFoundError);
    await expect(cms.forms.update(editor, contact.id, { open: false, expectedRevision: trashed.revision })).rejects.toThrowError(/in the trash\. Restore it/);
    expect((await cms.submissions.find(editor, { formId: contact.id })).total).toBe(1);

    const other = await cms.forms.create(editor, { key: 'contact', label: { en: 'New contact' } });
    await expect(cms.forms.restore(editor, contact.id)).rejects.toThrowError(/Another form uses the key "contact" now/);
    await cms.forms.update(editor, other.id, { key: 'contact-two', expectedRevision: 1 });
    const restored = await cms.forms.restore(editor, contact.id);
    expect(restored).not.toHaveProperty('deletedAt');

    await expect(cms.forms.delete(editor, contact.id)).rejects.toThrowError(/Move this form to the trash first/);
    await cms.forms.trash(editor, contact.id);
    await cms.forms.delete(editor, contact.id);
    await expect(cms.forms.get(editor, contact.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await cms.submissions.find(editor, { formId: contact.id })).total).toBe(0);
    expect(heard.filter((event) => event.startsWith('form.') && event !== 'form.saved')).toEqual(['form.trashed', 'form.restored', 'form.trashed', 'form.deleted']);
  });
});

describe('SubmissionService', () => {
  it('keeps what a visitor sent, by field id, each value as its kind of field holds it', async () => {
    const stored = await cms.submissions.submit('contact', { ...answers, budget: '450000', reason: 'buy', extra: 'not a field', [idOf(contact, 'name')]: 'by id' }, { page: '/contact/', locale: 'en' });
    expect(stored).toEqual({
      id: stored.id,
      formId: contact.id,
      status: 'new',
      data: {
        [idOf(contact, 'name')]: 'Ana Ruiz',
        [idOf(contact, 'email')]: 'Ana@Example.com',
        [idOf(contact, 'phone')]: '512 555 0142',
        [idOf(contact, 'budget')]: 450000,
        [idOf(contact, 'reason')]: 'buy',
        [idOf(contact, 'message')]: 'Is the house on Alder still for sale?',
        [idOf(contact, 'updates')]: true,
      },
      email: 'ana@example.com',
      locale: 'en',
      page: '/contact/',
      createdAt: stored.createdAt,
    });
    expect(await cms.submissions.get(editor, stored.id)).toEqual(stored);
    expect(heard).toEqual(['submission.received']);
  });

  it('names each answer that will not do, by key, and keeps nothing', async () => {
    const refused = cms.submissions.submit('contact', { name: '   ', email: 'not an address', phone: 'call me', budget: 'lots', reason: 'rent', message: 'x'.repeat(10_001) });
    expect(await issuesOf(refused)).toEqual([
      ['message', 'Keep this under 10000 characters.'],
      ['name', 'This is needed.'],
      ['email', expect.stringMatching(/email/i)],
      ['phone', 'Enter a phone number, such as 512 555 0142.'],
      ['budget', expect.any(String)],
      ['reason', expect.any(String)],
    ]);
    expect((await cms.submissions.find(owner)).total).toBe(0);
    expect(heard).toEqual([]);
  });

  it('holds an answer to its field\'s own limits', async () => {
    expect(await issuesOf(cms.submissions.submit('contact', { ...answers, name: 'n'.repeat(81), budget: '-5' }))).toEqual([
      ['name', expect.any(String)],
      ['budget', expect.any(String)],
    ]);
  });

  it('treats a box left unticked as not given, so a required one must be ticked', async () => {
    const consent = await cms.forms.create(owner, { key: 'news', label: { en: 'News' }, fields: [{ key: 'agree', type: 'boolean', label: { en: 'I agree' }, required: true }] });
    expect(await issuesOf(cms.submissions.submit('news', {}))).toEqual([['agree', 'This is needed.']]);
    expect(await issuesOf(cms.submissions.submit('news', { agree: 'false' }))).toEqual([['agree', 'This is needed.']]);
    expect((await cms.submissions.submit('news', { agree: 'on' })).data).toEqual({ [idOf(consent, 'agree')]: true });
    // No field holds an email here, so the submission names nobody.
    expect(await cms.submissions.submit('news', { agree: true })).not.toHaveProperty('email');
  });

  it('answers a closed form, and one that is not there, the same way', async () => {
    await cms.forms.update(editor, contact.id, { open: false, expectedRevision: 1 });
    await expect(cms.submissions.submit('contact', answers)).rejects.toThrowError('Form "contact" was not found.');
    await expect(cms.submissions.submit('nothing', answers)).rejects.toThrowError('Form "nothing" was not found.');
  });

  it('keeps a suspected submission apart, and drops a page or a language that is not one of the site\'s', async () => {
    const suspected = await cms.submissions.submit('contact', answers, { suspected: true, page: 'https://elsewhere.example/', locale: '<script>' });
    expect(suspected.status).toBe('spam');
    expect(suspected).not.toHaveProperty('page');
    expect(suspected).not.toHaveProperty('locale');
    expect(await cms.submissions.submit('contact', answers, { page: '//elsewhere.example/' })).not.toHaveProperty('page');
    expect(await cms.submissions.counts(editor, contact.id)).toEqual({ new: 1, handled: 0, spam: 1 });
  });

  it('is read and handled by owners and editors only', async () => {
    const stored = await cms.submissions.submit('contact', answers);
    await expect(cms.submissions.find(author)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(cms.submissions.get(author, stored.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(cms.submissions.counts(author, contact.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(cms.submissions.export(author, contact.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(cms.submissions.mark(author, stored.id, 'handled')).rejects.toBeInstanceOf(ForbiddenError);
    await expect(cms.submissions.delete(author, stored.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(cms.submissions.erase(author, 'ana@example.com')).rejects.toBeInstanceOf(ForbiddenError);
    expect((await cms.submissions.find(editor, { formId: contact.id })).items).toEqual([stored]);
  });

  it('marks a submission handled with who and when, and back to new without them', async () => {
    const stored = await cms.submissions.submit('contact', answers);
    const handled = await cms.submissions.mark(editor, stored.id, 'handled');
    expect(handled).toMatchObject({ status: 'handled', handledBy: 'daniel' });
    expect(handled.handledAt).toBeDefined();
    expect(await cms.submissions.mark(editor, stored.id, 'handled')).toEqual(handled);
    const again = await cms.submissions.mark(owner, stored.id, 'new');
    expect(again).toEqual(stored);
    expect(await cms.submissions.get(owner, stored.id)).toEqual(stored);
    expect(heard).toEqual(['submission.received', 'submission.changed', 'submission.changed']);
  });

  it('deletes one submission, and forgets everything one person sent through every form', async () => {
    const other = await cms.forms.create(owner, { key: 'tour', label: { en: 'Tour' }, fields: [{ key: 'mail', type: 'email', label: { en: 'Email' }, required: true }], contact: { email: 'mail' } });
    const first = await cms.submissions.submit('contact', answers);
    await cms.submissions.submit('contact', { ...answers, email: 'bo@example.com' });
    await cms.submissions.submit('tour', { mail: 'ANA@example.com' });
    await cms.submissions.delete(editor, first.id);
    await expect(cms.submissions.get(editor, first.id)).rejects.toBeInstanceOf(NotFoundError);

    await cms.submissions.submit('contact', answers);
    expect(await cms.submissions.erase(editor, ' Ana@Example.com ')).toBe(2);
    expect((await cms.submissions.find(owner)).items.map((item) => item.email)).toEqual(['bo@example.com']);
    expect((await cms.submissions.find(owner, { formId: other.id })).total).toBe(0);
    expect(await cms.submissions.erase(editor, 'ana@example.com')).toBe(0);
    await expect(cms.submissions.erase(editor, '  ')).rejects.toBeInstanceOf(ValidationError);
  });

  it('exports a form\'s submissions as a CSV file that a spreadsheet cannot be made to run', async () => {
    await cms.submissions.submit('contact', { ...answers, name: '=HYPERLINK("http://elsewhere.example")', message: 'Two lines,\nand a "quote"' }, { page: '/contact/' });
    const csv = await cms.submissions.export(editor, contact.id);
    const [header, ...rows] = csv.split('\r\n');
    expect(header).toBe('received,status,page,name,email,phone,budget,reason,message,updates');
    expect(rows.join('\r\n')).toBe('2026-01-01T00:00:02.000Z,new,/contact/,"\'=HYPERLINK(""http://elsewhere.example"")",Ana@Example.com,512 555 0142,,,"Two lines,\nand a ""quote""",true\r\n');
    await expect(cms.submissions.export(editor, 'nobody')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('keeps a removed field\'s answers in the export', async () => {
    await cms.submissions.submit('contact', answers);
    const kept = contact.fields.filter((field) => field.key !== 'phone');
    await cms.forms.update(editor, contact.id, { fields: [...kept, { key: 'phone', type: 'text', label: { en: 'Phone' } }], expectedRevision: 1 });
    const [header, row] = (await cms.submissions.export(editor, contact.id)).split('\r\n');
    expect(header?.endsWith(`,phone,phone (${idOf(contact, 'phone')})`)).toBe(true);
    expect(row).toMatch(/,,512 555 0142$/);
  });

  it('removes what a form has kept longer than it says to, and leaves the rest', async () => {
    const clock = new FakeClock();
    let now: string | null = null;
    cms = createCms({ entries: new InMemoryEntryRepository(), types: new InMemorySchemaRepository(), clock: { now: () => now ?? clock.now() }, ids: new SequentialIds() });
    const short = await cms.forms.create(owner, { key: 'short', label: { en: 'Short' }, fields: [{ key: 'note', type: 'text', label: { en: 'Note' } }], retentionDays: 30 });
    const long = await cms.forms.create(owner, { key: 'long', label: { en: 'Long' }, fields: [{ key: 'note', type: 'text', label: { en: 'Note' } }] });
    now = '2026-03-01T00:00:00.000Z';
    await cms.submissions.submit('short', { note: 'old' });
    await cms.submissions.submit('long', { note: 'old' });
    now = '2026-03-20T00:00:00.000Z';
    const recent = await cms.submissions.submit('short', { note: 'recent' });
    now = '2026-04-05T00:00:00.000Z';
    await expect(cms.submissions.purge(author)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await cms.submissions.purge(owner)).toBe(1);
    expect((await cms.submissions.find(owner, { formId: short.id })).items).toEqual([recent]);
    expect((await cms.submissions.find(owner, { formId: long.id })).total).toBe(1);
  });
});

describe('a plugin and what visitors send', () => {
  it('hears of a submission only if it declared that it reads them', async () => {
    const got: string[] = [];
    const listener = (permissions: readonly 'submission:read'[]) =>
      definePlugin({
        name: permissions.length > 0 ? 'notifier' : 'nosy',
        apiVersion: 1,
        label: { en: 'Listener' },
        permissions,
        setup: (context) => void context.events.on('submission.received', ({ submission }) => void got.push(`${context.name}:${submission.email ?? ''}`)),
      });
    await cms.plugins.load([listener([]), listener(['submission:read'])]);
    const statuses = Object.fromEntries((await cms.plugins.list(owner)).map((plugin) => [plugin.name, plugin.status]));
    expect(statuses).toEqual({ nosy: 'failed', notifier: 'on' });
    await cms.submissions.submit('contact', answers);
    expect(got).toEqual(['notifier:ana@example.com']);
  });
});
