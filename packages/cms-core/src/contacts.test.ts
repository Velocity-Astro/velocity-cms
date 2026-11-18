import { beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from './access.js';
import { createCms, type Cms } from './cms.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors.js';
import type { FormDef } from './model.js';
import { definePlugin } from './plugin.js';
import { FakeClock, InMemoryContactRepository, InMemoryDealRepository, InMemoryEntryRepository, InMemoryPipelineStore, InMemorySchemaRepository, SequentialIds, contactRepositoryContract, dealRepositoryContract, pipelineStoreContract } from './testing/index.js';

contactRepositoryContract('InMemoryContactRepository', async () => new InMemoryContactRepository());
dealRepositoryContract('InMemoryDealRepository', async () => new InMemoryDealRepository());
pipelineStoreContract('InMemoryPipelineStore', async () => new InMemoryPipelineStore());

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

describe('the pipeline', () => {
  const team = { members: async () => [{ id: 'maya', name: 'Maya', role: 'owner' as const }, { id: 'daniel', name: 'Daniel', role: 'editor' as const }, { id: 'priya', name: 'Priya', role: 'author' as const }] };
  beforeEach(() => {
    cms = createCms({ entries: new InMemoryEntryRepository(), types: new InMemorySchemaRepository(), clock: new FakeClock(), ids: new SequentialIds(), team });
  });

  it('comes with five stages, and starts every contact in the first', async () => {
    const pipeline = await cms.pipeline.get(editor);
    expect(pipeline.revision).toBe(0);
    expect(pipeline.stages.map((stage) => [stage.id, stage.kind])).toEqual([['new', 'open'], ['contacted', 'open'], ['qualified', 'open'], ['won', 'won'], ['lost', 'lost']]);
    expect((await cms.contacts.create(editor, { email: 'tom@example.com' })).stage).toBe('new');
    await cms.forms.create(editor, { key: 'contact', label: { en: 'Contact' }, fields: [{ key: 'email', type: 'email', label: { en: 'Email' } }], contact: { email: 'email' } });
    await cms.submissions.submit('contact', { email: 'ana@example.com' });
    expect((await cms.contacts.find(editor, { stage: 'new' })).total).toBe(2);
  });

  it('moves a contact to a stage, gives it to someone and sets a day to follow up, refusing what is not there', async () => {
    const tom = await cms.contacts.create(editor, { email: 'tom@example.com' });
    const moved = await cms.contacts.update(editor, tom.id, { stage: 'contacted', ownerId: 'daniel', followUpAt: '2026-03-14', expectedRevision: 1 });
    expect(moved).toMatchObject({ stage: 'contacted', ownerId: 'daniel', followUpAt: '2026-03-14', revision: 2 });
    expect(await issuesOf(cms.contacts.update(editor, tom.id, { stage: 'nowhere', ownerId: 'priya', followUpAt: '2026-02-30', expectedRevision: 2 }))).toEqual([
      ['stage', 'This stage is no longer in the pipeline. Choose another.'],
      ['ownerId', 'Choose someone on the team who may read contacts.'],
      ['followUpAt', 'Enter a day, such as 2026-03-14.'],
    ]);
    const renamed = await cms.contacts.update(editor, tom.id, { name: 'Tom', expectedRevision: 2 });
    expect(renamed).toMatchObject({ stage: 'contacted', ownerId: 'daniel', followUpAt: '2026-03-14' });
    // The move is on the timeline with who made it; a change that moves nothing adds no record.
    await cms.contacts.addNote(editor, tom.id, 'Called.');
    expect((await cms.contacts.timeline(editor, tom.id)).filter((item) => item.kind === 'stage')).toEqual([{ kind: 'stage', at: moved.updatedAt, id: expect.any(String) as string, from: 'new', to: 'contacted', by: editor.id }]);
    const file = JSON.parse(await cms.contacts.export(editor, tom.id)) as { notes: unknown[]; moves: unknown[] };
    expect(file.notes).toHaveLength(1);
    expect(file.moves).toEqual([{ at: moved.updatedAt, from: 'new', to: 'contacted' }]);
    const freed = await cms.contacts.update(editor, tom.id, { ownerId: null, followUpAt: null, expectedRevision: 3 });
    expect(freed).not.toHaveProperty('ownerId');
    expect(freed).not.toHaveProperty('followUpAt');
    expect((await cms.contacts.owners(editor)).map((member) => member.id)).toEqual(['maya', 'daniel']);
    expect((await cms.contacts.find(editor, { ownerId: 'daniel' })).total).toBe(0);
  });

  it('is renamed, reordered and added to with every stage keeping its id, and tells of the change', async () => {
    cms.events.on('pipeline.saved', () => void heard.push('pipeline.saved'));
    heard = [];
    const saved = await cms.pipeline.save(editor, {
      stages: [{ id: 'new', label: ' Fresh ', kind: 'open' }, { label: 'Viewing booked', kind: 'open' }, { id: 'contacted', kind: 'open' }, { id: 'won', kind: 'won' }, { id: 'lost', label: '', kind: 'lost' }, { id: 'qualified', kind: 'open' }],
      expectedRevision: 0,
    });
    expect(saved.revision).toBe(1);
    expect(saved.stages.map((stage) => stage.label)).toEqual(['Fresh', 'Viewing booked', undefined, undefined, undefined, undefined]);
    expect(saved.stages.map((stage) => stage.id).filter((id) => ['new', 'contacted', 'qualified', 'won', 'lost'].includes(id))).toEqual(['new', 'contacted', 'won', 'lost', 'qualified']);
    expect(await cms.pipeline.get(editor)).toEqual(saved);
    expect(heard).toEqual(['pipeline.saved']);
    await expect(cms.pipeline.save(editor, { stages: [{ id: 'new', kind: 'open' }], expectedRevision: 0 })).rejects.toThrowError(/changed by someone else/);
  });

  it('moves the contacts of a removed stage to the first stage', async () => {
    const tom = await cms.contacts.create(editor, { email: 'tom@example.com', stage: 'qualified' });
    const ana = await cms.contacts.create(editor, { email: 'ana@example.com', stage: 'won' });
    await cms.pipeline.save(editor, { stages: [{ id: 'contacted', kind: 'open' }, { id: 'won', kind: 'won' }], expectedRevision: 0 });
    expect((await cms.contacts.get(editor, tom.id)).stage).toBe('contacted');
    expect((await cms.contacts.get(editor, ana.id)).stage).toBe('won');
    expect((await cms.contacts.create(editor, { email: 'li@example.com' })).stage).toBe('contacted');
  });

  it('refuses stages that cannot work, naming each, and is closed to an author', async () => {
    expect(await issuesOf(cms.pipeline.save(editor, { stages: [], expectedRevision: 0 }))).toEqual([['stages', 'A pipeline needs at least one stage.']]);
    expect(
      await issuesOf(
        cms.pipeline.save(editor, { stages: [{ id: 'won', kind: 'won' }, { kind: 'open' }, { id: 'gone', kind: 'open' }, { id: 'won', kind: 'won' }, { label: 'x'.repeat(41), kind: 'open' }], expectedRevision: 0 }),
      ),
    ).toEqual([
      ['stages.1.label', 'Give the stage a name.'],
      ['stages.2.id', 'This stage is not one of the pipeline. Reload the stages and try again.'],
      ['stages.3.id', 'This stage is not one of the pipeline. Reload the stages and try again.'],
      ['stages.4.label', "Keep a stage's name under 40 characters."],
      ['stages.0.kind', 'The first stage is where a new contact starts, so it must be open.'],
    ]);
    await expect(cms.pipeline.get(author)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(cms.pipeline.save(author, { stages: [{ id: 'new', kind: 'open' }], expectedRevision: 0 })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('deals', () => {
  const team = { members: async () => [{ id: 'maya', name: 'Maya', role: 'owner' as const }, { id: 'daniel', name: 'Daniel', role: 'editor' as const }, { id: 'priya', name: 'Priya', role: 'author' as const }] };
  let tom: { id: string };
  beforeEach(async () => {
    cms = createCms({ entries: new InMemoryEntryRepository(), types: new InMemorySchemaRepository(), clock: new FakeClock(), ids: new SequentialIds(), team });
    heard = [];
    for (const event of ['deal.saved', 'deal.deleted'] as const) cms.events.on(event, () => void heard.push(event));
    tom = await cms.contacts.create(editor, { email: 'tom@example.com', ownerId: 'daniel' });
  });

  it('are made for a contact in the first stage, looked after by whoever looks after the contact', async () => {
    const deal = await cms.deals.create(editor, { contactId: tom.id, title: ' Sale of 18 Alder Court ', value: 450000, closeOn: '2026-03-14' });
    expect(deal).toMatchObject({ contactId: tom.id, title: 'Sale of 18 Alder Court', value: 450000, stage: 'new', ownerId: 'daniel', closeOn: '2026-03-14', revision: 1 });
    expect(deal).not.toHaveProperty('closedAt');
    expect((await cms.deals.find(editor, { contactId: tom.id })).total).toBe(1);
    expect(heard).toEqual(['deal.saved']);
    expect(await issuesOf(cms.deals.create(editor, { contactId: 'nobody', title: 'x', value: 1 }))).toEqual([['contactId', 'This contact is no longer here. Choose another.']]);
    expect(await issuesOf(cms.deals.create(editor, { contactId: tom.id, title: ' ', value: 1.5, stage: 'nowhere', ownerId: 'priya', closeOn: 'soon' }))).toEqual([
      ['title', 'Say what the deal is about.'],
      ['value', 'Give what it is worth as a whole number, 0 or more.'],
      ['stage', 'This stage is no longer in the pipeline. Choose another.'],
      ['ownerId', 'Choose someone on the team who may read contacts.'],
      ['closeOn', 'Enter a day, such as 2026-03-14.'],
    ]);
  });

  it('change only what they are told to, close when they reach a won or lost stage and open again when moved back', async () => {
    const deal = await cms.deals.create(editor, { contactId: tom.id, title: 'Sale', value: 100 });
    const won = await cms.deals.update(editor, deal.id, { stage: 'won', value: 120, expectedRevision: 1 });
    expect(won).toMatchObject({ stage: 'won', value: 120, title: 'Sale', ownerId: 'daniel', revision: 2 });
    expect(won.closedAt).toBeDefined();
    const back = await cms.deals.update(editor, deal.id, { stage: 'qualified', ownerId: null, expectedRevision: 2 });
    expect(back).not.toHaveProperty('closedAt');
    expect(back).not.toHaveProperty('ownerId');
    await expect(cms.deals.update(editor, deal.id, { value: 1, expectedRevision: 2 })).rejects.toThrowError(/saved by someone else/);
    await cms.deals.delete(editor, deal.id);
    await expect(cms.deals.get(editor, deal.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(heard).toEqual(['deal.saved', 'deal.saved', 'deal.saved', 'deal.deleted']);
  });

  it('are started by a form sent from the page of an entry deals can be about, once for each person', async () => {
    const listings = await cms.schema.create(owner, { key: 'listings', kind: 'collection', label: { en: 'Listings' }, fields: [{ key: 'address', type: 'text', label: { en: 'Address' } }], titleField: 'address', forDeals: true });
    const address = listings.fields[0]?.id ?? '';
    const alder = await cms.content.create(editor, { typeId: listings.id, locale: 'en', slug: 'alder', data: { [address]: '18 Alder Court' } });
    const about = { typeId: listings.id, entry: alder.translationGroup };
    const ask = await cms.forms.create(editor, { key: 'ask', label: { en: 'Ask about this home' }, fields: [{ key: 'email', type: 'email', label: { en: 'Email' } }], contact: { email: 'email' }, startsDeal: true });
    const plainForm = await cms.forms.create(editor, { key: 'plain', label: { en: 'Contact' }, fields: [{ key: 'email', type: 'email', label: { en: 'Email' } }], contact: { email: 'email' } });
    expect(ask.startsDeal).toBe(true);
    expect(plainForm.startsDeal).toBeUndefined();
    heard = [];

    const sent = await cms.submissions.submit('ask', { email: 'ana@example.com' }, { page: '/listings/alder/', about });
    expect(sent.about).toEqual(about);
    const ana = (await cms.contacts.find(editor, { search: 'ana@example.com' })).items[0];
    const [deal] = (await cms.deals.find(editor, { about })).items;
    expect(deal).toMatchObject({ contactId: ana?.id, title: '18 Alder Court', value: 0, stage: 'new', about });
    expect(heard).toEqual(['deal.saved']);

    // Asking again about the same home adds nothing while the deal is open; once it is lost, a new one starts.
    await cms.submissions.submit('ask', { email: 'ana@example.com' }, { about });
    expect((await cms.deals.find(editor, { about })).total).toBe(1);
    await cms.deals.update(editor, deal?.id ?? '', { stage: 'lost', expectedRevision: 1 });
    await cms.submissions.submit('ask', { email: 'ana@example.com' }, { about });
    expect((await cms.deals.find(editor, { about })).total).toBe(2);

    // Nothing starts from a form that does not ask for it, from spam, from a page that is no entry's, or for a kind deals are not about.
    await cms.submissions.submit('plain', { email: 'ben@example.com' }, { about });
    await cms.submissions.submit('ask', { email: 'cy@example.com' }, { about, suspected: true });
    await cms.submissions.submit('ask', { email: 'di@example.com' }, { page: '/contact/' });
    await cms.submissions.submit('ask', { email: 'ed@example.com' }, { about: { typeId: listings.id, entry: 'nothing' } });
    await cms.schema.update(owner, listings.id, { forDeals: false });
    await cms.submissions.submit('ask', { email: 'flo@example.com' }, { about });
    expect((await cms.deals.find(editor, {})).total).toBe(2);

    // A setting that is not mentioned stays, and it can be switched off.
    expect((await cms.forms.update(editor, ask.id, { label: { en: 'Ask' }, expectedRevision: 1 })).startsDeal).toBe(true);
    expect((await cms.forms.update(editor, ask.id, { startsDeal: false, expectedRevision: 2 })).startsDeal).toBeUndefined();
  });

  it('can be about an entry of a content type that takes deals, and are found by it', async () => {
    const listings = await cms.schema.create(owner, { key: 'listings', kind: 'collection', label: { en: 'Listings' } });
    const alder = await cms.content.create(editor, { typeId: listings.id, locale: 'en', slug: 'alder', data: {} });
    const about = { typeId: listings.id, entry: alder.translationGroup };
    expect(await issuesOf(cms.deals.create(editor, { contactId: tom.id, title: 'Sale', value: 1, about }))).toEqual([
      ['about', 'Deals cannot be about this kind of content. Choose another, or turn it on for the content type.'],
    ]);
    expect((await cms.schema.update(owner, listings.id, { forDeals: true })).forDeals).toBe(true);
    // A change that says nothing about deals leaves the choice as it was.
    expect((await cms.schema.update(owner, listings.id, { label: { en: 'Homes' } })).forDeals).toBe(true);
    expect(await issuesOf(cms.deals.create(editor, { contactId: tom.id, title: 'Sale', value: 1, about: { typeId: listings.id, entry: 'nothing' } }))).toEqual([
      ['about', 'This entry is no longer here. Choose another.'],
    ]);
    const deal = await cms.deals.create(editor, { contactId: tom.id, title: 'Sale of Alder', value: 1, about });
    const other = await cms.deals.create(editor, { contactId: tom.id, title: 'Something else', value: 1 });
    expect(deal.about).toEqual(about);
    expect((await cms.deals.find(editor, { about })).items.map((item) => item.id)).toEqual([deal.id]);

    // A change that leaves the subject out keeps it, and it is kept when its type stops taking deals.
    await cms.schema.update(owner, listings.id, { forDeals: false });
    expect((await cms.schema.get(listings.id)).forDeals).toBeUndefined();
    expect((await cms.deals.update(editor, deal.id, { value: 2, expectedRevision: 1 })).about).toEqual(about);
    expect((await cms.deals.update(editor, deal.id, { about, expectedRevision: 2 })).about).toEqual(about);
    expect(await issuesOf(cms.deals.update(editor, other.id, { about, expectedRevision: 1 }))).toHaveLength(1);
    expect((await cms.deals.update(editor, deal.id, { about: null, expectedRevision: 3 })).about).toBeUndefined();
  });

  it('are forecast stage by stage: open deals count by their stage\'s chance, and won and lost are told apart', async () => {
    await cms.deals.create(editor, { contactId: tom.id, title: 'A', value: 1000 });
    await cms.deals.create(editor, { contactId: tom.id, title: 'B', value: 3000, stage: 'qualified' });
    await cms.deals.create(editor, { contactId: tom.id, title: 'C', value: 500, stage: 'qualified' });
    await cms.deals.create(editor, { contactId: tom.id, title: 'D', value: 800, stage: 'won' });
    await cms.deals.create(editor, { contactId: tom.id, title: 'E', value: 50, stage: 'lost' });
    expect(await cms.deals.forecast(editor)).toEqual({
      currency: 'USD',
      stages: [
        { stage: 'new', count: 1, value: 1000, weighted: 100 },
        { stage: 'contacted', count: 0, value: 0, weighted: 0 },
        { stage: 'qualified', count: 2, value: 3500, weighted: 2100 },
        { stage: 'won', count: 1, value: 800, weighted: 800 },
        { stage: 'lost', count: 1, value: 50, weighted: 0 },
      ],
      open: 4500,
      weighted: 2200,
      won: 800,
      lost: 50,
    });
    await cms.pipeline.save(editor, { stages: [{ id: 'new', kind: 'open', chance: 20 }, { label: 'Offer', kind: 'open' }, { id: 'won', kind: 'won', chance: 5 }], currency: 'eur', expectedRevision: 0 });
    const after = await cms.deals.forecast(editor);
    // The deals of the stages that were removed moved to the first; a new open stage counts as half.
    expect(after).toMatchObject({ currency: 'EUR', open: 4550, weighted: 910, won: 800, lost: 0 });
    expect((await cms.pipeline.get(editor)).stages.map((stage) => stage.chance)).toEqual([20, undefined, undefined]);
    expect(await issuesOf(cms.pipeline.save(editor, { stages: [{ id: 'new', kind: 'open', chance: 120 }], currency: 'dollars', assignTo: ['priya'], expectedRevision: 1 }))).toEqual([
      ['stages.0.chance', 'Give a chance from 0 to 100.'],
      ['currency', 'Give a currency by its three letters, such as USD.'],
      ['assignTo', 'Choose people on the team who may read contacts.'],
    ]);
  });

  it('go with their contact when the person is erased, and are in the file handed to them', async () => {
    await cms.deals.create(editor, { contactId: tom.id, title: 'Sale', value: 100 });
    const ana = await cms.contacts.create(editor, { email: 'ana@example.com' });
    await cms.deals.create(editor, { contactId: ana.id, title: 'Rental', value: 20 });
    expect(JSON.parse(await cms.contacts.export(editor, tom.id))).toMatchObject({ deals: [{ title: 'Sale', value: 100, stage: 'new' }] });
    await cms.contacts.erase(editor, tom.id);
    expect((await cms.deals.find(editor)).items.map((deal) => deal.title)).toEqual(['Rental']);
    await cms.submissions.erase(editor, 'ana@example.com');
    expect((await cms.deals.find(editor)).total).toBe(0);
  });

  it('are closed to an author, and a new contact from a form goes to whoever of the people named has the fewest', async () => {
    await expect(cms.deals.find(author)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(cms.deals.forecast(author)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(cms.deals.create(author, { contactId: tom.id, title: 'x', value: 1 })).rejects.toBeInstanceOf(ForbiddenError);
    await cms.forms.create(editor, { key: 'contact', label: { en: 'Contact' }, fields: [{ key: 'email', type: 'email', label: { en: 'Email' } }], contact: { email: 'email' } });
    await cms.submissions.submit('contact', { email: 'first@example.com' });
    expect((await cms.contacts.find(editor, { search: 'first@' })).items[0]).not.toHaveProperty('ownerId');
    await cms.pipeline.save(editor, { stages: [{ id: 'new', kind: 'open' }], assignTo: ['daniel', 'maya', 'daniel'], expectedRevision: 0 });
    expect((await cms.pipeline.get(editor)).assignTo).toEqual(['daniel', 'maya']);
    // Daniel already looks after Tom, so Maya is next; then they are level and the first named takes it.
    for (const email of ['a@example.com', 'b@example.com', 'c@example.com']) await cms.submissions.submit('contact', { email });
    const owners = async (email: string) => (await cms.contacts.find(editor, { search: email })).items[0]?.ownerId;
    expect([await owners('a@example.com'), await owners('b@example.com'), await owners('c@example.com')]).toEqual(['maya', 'daniel', 'maya']);
    await cms.pipeline.save(editor, { stages: [{ id: 'new', kind: 'open' }], assignTo: [], expectedRevision: 1 });
    expect(await cms.pipeline.get(editor)).not.toHaveProperty('assignTo');
  });
});

describe('custom fields', () => {
  const membership = { key: 'membership', type: 'select', label: { en: 'Membership' }, options: { choices: ['monthly', 'yearly'] } };
  const seats = { key: 'seats', type: 'number', label: { en: 'Seats' }, options: { integer: true } };
  const idOf = (fields: readonly { id: string; key: string }[], key: string) => fields.find((field) => field.key === key)?.id ?? '';

  it('are none until someone adds some, keep their ids by id or key, and mark a removed one', async () => {
    expect(await cms.customFields.get(editor)).toEqual({ contact: [], deal: [], revision: 0 });
    const first = await cms.customFields.save(editor, { contact: [membership, { key: 'joined', type: 'date', label: { en: 'Joined' }, required: true }], deal: [seats], expectedRevision: 0 });
    expect(first.contact.map((field) => [field.key, field.type, field.required, field.translated])).toEqual([['membership', 'select', false, false], ['joined', 'date', false, false]]);
    expect(first.revision).toBe(1);
    await expect(cms.customFields.save(editor, { contact: [], expectedRevision: 0 })).rejects.toBeInstanceOf(ConflictError);

    // Renamed by id, reordered, and one left out: the deal fields are not named, so they stay.
    const second = await cms.customFields.save(editor, { contact: [{ ...membership, id: idOf(first.contact, 'membership'), key: 'plan', label: { en: 'Plan' } }], expectedRevision: 1 });
    expect(idOf(second.contact, 'plan')).toBe(idOf(first.contact, 'membership'));
    expect(second.contact.find((field) => field.key === 'joined')?.deletedAt).toBeDefined();
    expect(second.deal).toEqual(first.deal);
  });

  it('refuse a kind that is not simple, a key used twice, too many, and someone who may not change contacts', async () => {
    await expect(cms.customFields.save(editor, { contact: [{ key: 'body', type: 'richtext', label: { en: 'Body' } }], expectedRevision: 0 })).rejects.toThrow(/cannot be a richtext field/);
    await expect(cms.customFields.save(editor, { deal: [seats, seats], expectedRevision: 0 })).rejects.toBeInstanceOf(ConflictError);
    const many = Array.from({ length: 31 }, (_, index) => ({ key: `field${index}`, type: 'text', label: { en: `Field ${index}` } }));
    await expect(cms.customFields.save(editor, { contact: many, expectedRevision: 0 })).rejects.toThrow(/30 custom fields at most/);
    await expect(cms.customFields.save(author, { contact: [], expectedRevision: 0 })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('are filled in on a contact, checked by their kind, cleared when emptied and kept when not named', async () => {
    const fields = await cms.customFields.save(editor, { contact: [membership, { key: 'goal', type: 'text', label: { en: 'Goal' } }], expectedRevision: 0 });
    const plan = idOf(fields.contact, 'membership');
    const goal = idOf(fields.contact, 'goal');
    const tom = await cms.contacts.create(editor, { email: 'tom@example.com', data: { [plan]: 'yearly', [goal]: 'Run 10k', unknown: 'dropped' } });
    expect(tom.data).toEqual({ [plan]: 'yearly', [goal]: 'Run 10k' });

    await expect(cms.contacts.update(editor, tom.id, { data: { [plan]: 'weekly' }, expectedRevision: 1 })).rejects.toMatchObject({ issues: [{ path: ['data', 'membership'] }] });
    const changed = await cms.contacts.update(editor, tom.id, { data: { [goal]: '' }, expectedRevision: 1 });
    expect(changed.data).toEqual({ [plan]: 'yearly' });
    // A change that names no custom field leaves them alone.
    expect((await cms.contacts.update(editor, tom.id, { name: 'Tom', expectedRevision: 2 })).data).toEqual({ [plan]: 'yearly' });

    // A removed field's value stays with the contact, and is no longer handed out by key.
    await cms.customFields.save(editor, { contact: [{ key: 'goal', type: 'text', label: { en: 'Goal' }, id: goal }], expectedRevision: 1 });
    const later = await cms.contacts.update(editor, tom.id, { data: { [goal]: 'Swim', [plan]: 'monthly' }, expectedRevision: 3 });
    expect(later.data).toEqual({ [plan]: 'yearly', [goal]: 'Swim' });
    expect((JSON.parse(await cms.contacts.export(editor, tom.id)) as { contact: Record<string, unknown> }).contact).toMatchObject({ email: 'tom@example.com', fields: { goal: 'Swim' } });
  });

  it('are filled from a form\'s answers where the form says, and never over what is already there', async () => {
    const fields = await cms.customFields.save(editor, { contact: [membership, { key: 'goal', type: 'text', label: { en: 'Goal' } }, { key: 'visits', type: 'number', label: { en: 'Visits' } }], expectedRevision: 0 });
    const [plan, goal, visits] = ['membership', 'goal', 'visits'].map((key) => idOf(fields.contact, key));
    const join = await cms.forms.create(editor, {
      key: 'join',
      label: { en: 'Join' },
      fields: [
        { key: 'email', type: 'email', label: { en: 'Email' } },
        { key: 'plan', type: 'select', label: { en: 'Plan' }, options: { choices: ['monthly', 'yearly', 'weekly'] } },
        { key: 'why', type: 'text', label: { en: 'Why' } },
      ],
      contact: { email: 'email' },
      // The last is a text answer for a number field: kept in the form's settings, and left out when it arrives.
      fills: { plan: plan ?? '', why: goal ?? '', email: visits ?? '' },
    });
    const idIn = (key: string) => join.fields.find((field) => field.key === key)?.id ?? '';
    expect(join.fills).toEqual({ [idIn('plan')]: plan, [idIn('why')]: goal, [idIn('email')]: visits });

    // A new contact gets the answers. One the custom field would not take ("weekly" is no plan here) is left out.
    await cms.submissions.submit('join', { email: 'ana@example.com', plan: 'weekly', why: 'Run 10k' });
    const ana = (await cms.contacts.find(editor, { search: 'ana@example.com' })).items[0];
    expect(ana?.data).toEqual({ [goal ?? '']: 'Run 10k' });

    // Later answers fill only what is still empty.
    await cms.submissions.submit('join', { email: 'ana@example.com', plan: 'yearly', why: 'Swim' });
    const later = await cms.contacts.get(editor, ana?.id ?? '');
    expect(later.data).toEqual({ [goal ?? '']: 'Run 10k', [plan ?? '']: 'yearly' });
    expect(later.revision).toBe(2);
    await cms.submissions.submit('join', { email: 'ana@example.com', plan: 'monthly' });
    expect((await cms.contacts.get(editor, later.id)).revision).toBe(2);

    // Two answers cannot fill one field, a key must be a field of the form, and a choice whose field is removed goes with it.
    await expect(cms.forms.update(editor, join.id, { fills: { plan: goal ?? '', why: goal ?? '' }, expectedRevision: 1 })).rejects.toThrow(/fill the same field/);
    await expect(cms.forms.update(editor, join.id, { fills: { nothing: goal ?? '' }, expectedRevision: 1 })).rejects.toThrow(/no field with the key "nothing"/);
    const fewer = await cms.forms.update(editor, join.id, { fields: join.fields.filter((field) => field.key !== 'why'), expectedRevision: 1 });
    expect(fewer.fills).toEqual({ [idIn('plan')]: plan, [idIn('email')]: visits });
    expect((await cms.forms.update(editor, join.id, { fills: {}, expectedRevision: 2 })).fills).toBeUndefined();
  });

  it('come in with a file of contacts as text, each read by its kind of field', async () => {
    const fields = await cms.customFields.save(editor, { contact: [membership, { key: 'visits', type: 'number', label: { en: 'Visits' } }], expectedRevision: 0 });
    const plan = idOf(fields.contact, 'membership');
    const visits = idOf(fields.contact, 'visits');
    const tom = await cms.contacts.create(editor, { email: 'tom@example.com', name: 'Tom', data: { [plan]: 'yearly' } });
    const heard: (true | undefined)[] = [];
    cms.events.on('contact.saved', ({ imported }) => void heard.push(imported));

    const report = await cms.contacts.import(editor, [
      { email: ' Ana@Example.com ', name: 'Ana Ruiz', phone: '512 555 0100', data: { [plan]: 'monthly', [visits]: '12' } },
      // Someone already here only gains what they lack: the plan and the name stay as the team set them.
      { email: 'tom@example.com', name: 'Thomas', phone: '512 555 0101', data: { [plan]: 'monthly', [visits]: '3' } },
      { email: 'tom@example.com', name: 'Thomas' },
      { email: 'not an address', name: 'Nobody' },
      { email: '' },
      { email: 'li@example.com', data: { [plan]: 'weekly' } },
    ]);
    expect(report).toEqual({
      added: 1,
      filled: 1,
      unchanged: 1,
      problems: [
        { row: 3, message: 'email: Enter an email address, such as ana@example.com.' },
        { row: 4, message: 'email: This is needed.' },
        { row: 5, message: expect.stringContaining('"membership"') as string },
      ],
    });
    const ana = (await cms.contacts.find(editor, { search: 'ana@example.com' })).items[0];
    expect(ana).toMatchObject({ email: 'ana@example.com', name: 'Ana Ruiz', phone: '512 555 0100', stage: 'new', data: { [plan]: 'monthly', [visits]: 12 } });
    expect(ana?.source).toBeUndefined();
    expect(await cms.contacts.get(editor, tom.id)).toMatchObject({ name: 'Tom', phone: '512 555 0101', data: { [plan]: 'yearly', [visits]: 3 }, revision: 2 });
    expect(heard).toEqual([true, true]);

    await expect(cms.contacts.import(editor, Array.from({ length: 201 }, (_, index) => ({ email: `p${index}@example.com` })))).rejects.toThrow(/200 rows at a time/);
    await expect(cms.contacts.import(author, [])).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('are filled in on a deal, and go into the file of the deal\'s contact by key', async () => {
    const fields = await cms.customFields.save(editor, { deal: [seats], expectedRevision: 0 });
    const tom = await cms.contacts.create(editor, { email: 'tom@example.com' });
    const deal = await cms.deals.create(editor, { contactId: tom.id, title: 'Team plan', value: 900, data: { [idOf(fields.deal, 'seats')]: 12 } });
    expect(deal.data).toEqual({ [idOf(fields.deal, 'seats')]: 12 });
    await expect(cms.deals.update(editor, deal.id, { data: { [idOf(fields.deal, 'seats')]: 'many' }, expectedRevision: 1 })).rejects.toBeInstanceOf(ValidationError);
    expect((await cms.deals.update(editor, deal.id, { data: { [idOf(fields.deal, 'seats')]: null }, expectedRevision: 1 })).data).toBeUndefined();
    await cms.deals.update(editor, deal.id, { data: { [idOf(fields.deal, 'seats')]: 20 }, expectedRevision: 2 });
    expect((JSON.parse(await cms.contacts.export(editor, tom.id)) as { deals: unknown[] }).deals).toMatchObject([{ title: 'Team plan', fields: { seats: 20 } }]);
  });
});
