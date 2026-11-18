import { beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from './access.js';
import { createCms, type Cms } from './cms.js';
import { ForbiddenError, NotFoundError, ValidationError } from './errors.js';
import type { FormDef } from './model.js';
import { definePlugin } from './plugin.js';
import { FakeClock, InMemoryContactRepository, InMemoryEntryRepository, InMemorySchemaRepository, SequentialIds, contactRepositoryContract } from './testing/index.js';

contactRepositoryContract('InMemoryContactRepository', async () => new InMemoryContactRepository());

const owner: Actor = { kind: 'user', id: 'maya', role: 'owner' };
const editor: Actor = { kind: 'user', id: 'daniel', role: 'editor' };
const author: Actor = { kind: 'user', id: 'priya', role: 'author' };

let cms: Cms;
let form: FormDef;
let heard: string[];

const answers = { name: ' Ana Ruiz ', email: 'Ana@Example.com', phone: '512 555 0142', message: 'Is the house on Alder still for sale?' };
const issuesOf = async (work: Promise<unknown>) => {
  const error: unknown = await work.then(
    () => null,
    (caught: unknown) => caught,
  );
  if (!(error instanceof ValidationError)) throw new Error('Expected a ValidationError');
  return error.issues.map((issue) => [issue.path.join('.'), issue.message]);
};
const everyone = async () => (await cms.contacts.find(editor)).items;

beforeEach(async () => {
  heard = [];
  cms = createCms({ entries: new InMemoryEntryRepository(), types: new InMemorySchemaRepository(), clock: new FakeClock(), ids: new SequentialIds() });
  for (const event of ['contact.saved', 'contact.deleted', 'submission.deleted'] as const) cms.events.on(event, () => void heard.push(event));
  form = await cms.forms.create(editor, {
    key: 'contact',
    label: { en: 'Contact us' },
    fields: [
      { key: 'name', type: 'text', label: { en: 'Your name' } },
      { key: 'email', type: 'email', label: { en: 'Email' }, required: true },
      { key: 'phone', type: 'phone', label: { en: 'Phone' } },
      { key: 'message', type: 'text', label: { en: 'Message' }, options: { multiline: true } },
    ],
    contact: { name: 'name', email: 'email', phone: 'phone' },
  });
});

describe('a contact from a submission', () => {
  it('is made of the sender, with where they first came from', async () => {
    await cms.submissions.submit('contact', answers, { page: '/contact/' });
    const [ana] = await everyone();
    expect(ana).toMatchObject({ email: 'ana@example.com', name: 'Ana Ruiz', phone: '512 555 0142', source: { formId: form.id, page: '/contact/' }, revision: 1 });
    expect(heard).toEqual(['contact.saved']);
  });

  it('is one person however often they write, and a form never overwrites what is known', async () => {
    await cms.submissions.submit('contact', { email: 'ana@example.com' });
    expect((await everyone())[0]).not.toHaveProperty('name');
    await cms.submissions.submit('contact', answers);
    await cms.submissions.submit('contact', { ...answers, name: 'Someone Else', phone: '512 555 0000' });
    const all = await everyone();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ name: 'Ana Ruiz', phone: '512 555 0142', revision: 2 });
    // The third told nothing new: nothing was saved.
    expect(heard).toEqual(['contact.saved', 'contact.saved']);
  });

  it('is not made of a suspected submission until someone says it is a person, nor of one with no email mark', async () => {
    const suspected = await cms.submissions.submit('contact', answers, { suspected: true });
    expect(await everyone()).toEqual([]);
    await cms.submissions.mark(editor, suspected.id, 'new');
    expect(await everyone()).toHaveLength(1);

    await cms.forms.create(editor, { key: 'poll', label: { en: 'Poll' }, fields: [{ key: 'email', type: 'email', label: { en: 'Email' } }] });
    await cms.submissions.submit('poll', { email: 'tom@example.com' });
    expect(await everyone()).toHaveLength(1);
  });

  it('never costs the submission when the contact cannot be made', async () => {
    const broken = new InMemoryContactRepository();
    broken.save = async () => {
      throw new Error('The disk is full.');
    };
    cms = createCms({ entries: new InMemoryEntryRepository(), types: new InMemorySchemaRepository(), contacts: broken });
    await cms.forms.create(editor, { key: 'contact', label: { en: 'Contact' }, fields: [{ key: 'email', type: 'email', label: { en: 'Email' } }], contact: { email: 'email' } });
    const kept = await cms.submissions.submit('contact', { email: 'ana@example.com' });
    expect((await cms.submissions.get(editor, kept.id)).email).toBe('ana@example.com');
  });

  it('catches up with what was sent before there were contacts, oldest first', async () => {
    const store = new InMemoryContactRepository();
    const real = store.save.bind(store);
    let off = true;
    store.save = async (contact, expected) => {
      if (off) throw new Error('Not yet.');
      return real(contact, expected);
    };
    cms = createCms({ entries: new InMemoryEntryRepository(), types: new InMemorySchemaRepository(), clock: new FakeClock(), ids: new SequentialIds(), contacts: store });
    await cms.forms.create(editor, { key: 'contact', label: { en: 'Contact' }, fields: [{ key: 'name', type: 'text', label: { en: 'Name' } }, { key: 'email', type: 'email', label: { en: 'Email' } }], contact: { name: 'name', email: 'email' } });
    await cms.submissions.submit('contact', { name: 'Ana', email: 'ana@example.com' });
    await cms.submissions.submit('contact', { name: 'Ana Ruiz', email: 'ana@example.com' });
    await cms.submissions.submit('contact', { name: 'Tom', email: 'tom@example.com' });
    await cms.submissions.submit('contact', { name: 'Bot', email: 'bot@example.com' }, { suspected: true });
    off = false;
    expect(await cms.contacts.catchUp(editor)).toBe(2);
    expect((await everyone()).map((contact) => [contact.email, contact.name]).sort()).toEqual([['ana@example.com', 'Ana'], ['tom@example.com', 'Tom']]);
    expect(await cms.contacts.catchUp(editor)).toBe(0);
  });
});

describe('ContactService', () => {
  it('adds a contact by hand, cleaned, and refuses a bad detail or an email that is taken, naming the field', async () => {
    const tom = await cms.contacts.create(editor, { email: ' Tom@Example.com ', name: ' Tom Lee ', phone: '' });
    expect(tom).toMatchObject({ email: 'tom@example.com', name: 'Tom Lee', revision: 1 });
    expect(tom).not.toHaveProperty('phone');
    expect(tom).not.toHaveProperty('source');
    expect(await issuesOf(cms.contacts.create(editor, { email: 'tom@example.com' }))).toEqual([['email', 'Another contact has this email address.']]);
    expect(await issuesOf(cms.contacts.create(editor, { email: 'nope', phone: 'call me' }))).toEqual([
      ['email', 'Enter an email address, such as ana@example.com.'],
      ['phone', 'Enter a phone number, such as 512 555 0142.'],
    ]);
    expect(await issuesOf(cms.contacts.create(editor, { email: ' ' }))).toEqual([['email', 'This is needed.']]);
  });

  it('changes only what it is told to, clears what is set to null, and refuses a save from an old revision', async () => {
    const tom = await cms.contacts.create(editor, { email: 'tom@example.com', name: 'Tom', phone: '512 555 0199' });
    const renamed = await cms.contacts.update(editor, tom.id, { name: 'Tom Lee', expectedRevision: 1 });
    expect(renamed).toMatchObject({ name: 'Tom Lee', phone: '512 555 0199', email: 'tom@example.com', revision: 2 });
    const cleared = await cms.contacts.update(editor, tom.id, { phone: null, email: 'Tom.Lee@example.com', expectedRevision: 2 });
    expect(cleared).not.toHaveProperty('phone');
    expect(cleared.email).toBe('tom.lee@example.com');
    await expect(cms.contacts.update(editor, tom.id, { name: 'T', expectedRevision: 2 })).rejects.toThrowError(/saved by someone else/);
    await cms.contacts.create(editor, { email: 'ana@example.com' });
    expect(await issuesOf(cms.contacts.update(editor, tom.id, { email: 'ana@example.com', expectedRevision: 3 }))).toEqual([['email', 'Another contact has this email address.']]);
    await expect(cms.contacts.get(editor, 'nobody')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('shows what happened with a contact, newest first: what they sent, by label, and the notes', async () => {
    cms = createCms({ entries: new InMemoryEntryRepository(), types: new InMemorySchemaRepository(), clock: new FakeClock(), ids: new SequentialIds() });
    form = await cms.forms.create(editor, { key: 'contact', label: { en: 'Contact us' }, fields: [{ key: 'email', type: 'email', label: { en: 'Email' } }, { key: 'message', type: 'text', label: { en: 'Message' } }], contact: { email: 'email' } });
    await cms.submissions.submit('contact', { email: 'ana@example.com', message: 'First' }, { page: '/contact/' });
    const [ana] = await everyone();
    if (!ana) throw new Error('No contact was made.');
    const note = await cms.contacts.addNote(editor, ana.id, '  Called back, wants a tour.  ');
    expect(note).toMatchObject({ text: 'Called back, wants a tour.', createdBy: 'daniel', contactId: ana.id });
    await cms.submissions.submit('contact', { email: 'ANA@example.com', message: 'Second' });
    await cms.submissions.submit('contact', { email: 'ana@example.com', message: 'Buy now' }, { suspected: true });

    const timeline = await cms.contacts.timeline(editor, ana.id);
    expect(timeline.map((item) => item.kind)).toEqual(['submission', 'note', 'submission']);
    const [latest, , first] = timeline;
    expect(latest).toMatchObject({ kind: 'submission', formLabel: { en: 'Contact us' }, answers: [{ key: 'email', label: { en: 'Email' }, value: 'ANA@example.com' }, { key: 'message', label: { en: 'Message' }, value: 'Second' }] });
    expect(first).toMatchObject({ kind: 'submission', submission: { page: '/contact/' } });

    expect(await issuesOf(cms.contacts.addNote(editor, ana.id, '   '))).toEqual([['text', 'Write the note first.']]);
    await cms.contacts.deleteNote(editor, ana.id, note.id);
    expect((await cms.contacts.timeline(editor, ana.id)).map((item) => item.kind)).toEqual(['submission', 'submission']);
  });

  it('hands over everything held about a person as a file, spam and all, by field key', async () => {
    await cms.submissions.submit('contact', answers, { page: '/contact/' });
    await cms.submissions.submit('contact', { email: 'ana@example.com', message: '=cmd' }, { suspected: true });
    const [ana] = await everyone();
    if (!ana) throw new Error('No contact was made.');
    await cms.contacts.addNote(editor, ana.id, 'Called back.');
    const file = JSON.parse(await cms.contacts.export(editor, ana.id)) as { contact: Record<string, unknown>; submissions: { form: string; status: string; answers: Record<string, unknown> }[]; notes: { text: string }[] };
    expect(file.contact).toMatchObject({ email: 'ana@example.com', name: 'Ana Ruiz', phone: '512 555 0142' });
    expect(file.contact).not.toHaveProperty('id');
    expect(file.submissions.map((sent) => [sent.form, sent.status]).sort()).toEqual([['contact', 'new'], ['contact', 'spam']]);
    expect(file.submissions.find((sent) => sent.status === 'new')?.answers).toEqual({ name: 'Ana Ruiz', email: 'Ana@Example.com', phone: '512 555 0142', message: 'Is the house on Alder still for sale?' });
    expect(file.notes).toEqual([expect.objectContaining({ text: 'Called back.' })]);
  });

  it('erases a person: the contact, their notes and everything they sent, and nobody else', async () => {
    await cms.submissions.submit('contact', answers);
    await cms.submissions.submit('contact', { ...answers, message: 'Again' });
    await cms.submissions.submit('contact', { email: 'tom@example.com' });
    const ana = (await everyone()).find((contact) => contact.email === 'ana@example.com');
    if (!ana) throw new Error('No contact was made.');
    await cms.contacts.addNote(editor, ana.id, 'Called back.');
    heard.length = 0;
    expect(await cms.contacts.erase(editor, ana.id)).toBe(2);
    expect(heard).toEqual(['submission.deleted', 'contact.deleted']);
    expect((await everyone()).map((contact) => contact.email)).toEqual(['tom@example.com']);
    expect((await cms.submissions.find(editor)).total).toBe(1);
    await expect(cms.contacts.timeline(editor, ana.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('leaves no contact behind when a person is forgotten by email under Forms', async () => {
    await cms.submissions.submit('contact', answers);
    expect(await cms.submissions.erase(editor, ' ANA@example.com ')).toBe(1);
    expect(await everyone()).toEqual([]);
  });

  it('is closed to an author, and a plugin hears of contacts only if it declared that it reads them', async () => {
    await expect(cms.contacts.find(author)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(cms.contacts.create(author, { email: 'x@example.com' })).rejects.toBeInstanceOf(ForbiddenError);
    const tom = await cms.contacts.create(owner, { email: 'tom@example.com' });
    await expect(cms.contacts.erase(author, tom.id)).rejects.toBeInstanceOf(ForbiddenError);
    await cms.plugins.load([
      definePlugin({ name: 'nosy', apiVersion: 1, label: { en: 'Nosy' }, enabledByDefault: true, setup: (plugin) => void plugin.events.on('contact.saved', () => undefined) }),
    ]);
    expect((await cms.plugins.list(owner)).find((plugin) => plugin.name === 'nosy')).toMatchObject({ status: 'failed' });
  });
});
