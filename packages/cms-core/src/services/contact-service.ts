import type { AccessControl, Actor } from '../access.js';
import { isDay } from '../day.js';
import { ConflictError, NotFoundError, ValidationError, type ValidationIssue } from '../errors.js';
import type { EventBus } from '../events.js';
import type { FieldType } from '../field-type.js';
import type { Contact, ContactNote, FormDef, Page, Submission, SubmissionAnswer, TeamMember, TimelineItem } from '../model.js';
import type { Clock, ContactQuery, ContactRepository, DealRepository, FormRepository, IdGenerator, SubmissionRepository, Team } from '../ports.js';
import type { Registry } from '../registry.js';
import type { PipelineService } from './pipeline-service.js';
import type { CustomFieldsService } from './custom-fields-service.js';
import { removeSubmissions } from './submission-service.js';

/** A contact as someone adds one by hand. */
export interface NewContact {
  readonly email: string;
  readonly name?: string;
  readonly phone?: string;
  /** The stage to start in. Left out, the pipeline's first. */
  readonly stage?: string;
  readonly ownerId?: string;
  readonly followUpAt?: string;
  /** What the site's own fields for contacts hold, by field id. */
  readonly data?: Readonly<Record<string, unknown>>;
}

/** What to change in a contact. Anything left out stays as it is; `null` clears it. */
export interface ContactChanges {
  readonly email?: string;
  readonly name?: string | null;
  readonly phone?: string | null;
  /** The id of a stage of the pipeline. */
  readonly stage?: string;
  /** The id of someone on the team who may read contacts. */
  readonly ownerId?: string | null;
  /** The day to get back to them, as `2026-03-14`. */
  readonly followUpAt?: string | null;
  /** The site's own fields to change, by field id. One left out stays as it is; an empty one is cleared. */
  readonly data?: Readonly<Record<string, unknown>>;
  /** The revision the editor loaded. The update is refused if someone saved in between. */
  readonly expectedRevision: number;
}

export const MAX_CONTACT_NAME_LENGTH = 200;
export const MAX_NOTE_LENGTH = 5000;
const BATCH = 200;

/**
 * Owns contacts: the people who wrote to the site, what each of them sent and what the team
 * noted about them. A contact is personal data, so reading one has a permission of its own, a
 * person can be handed everything held about them, and can be erased.
 */
export class ContactService {
  constructor(
    private readonly contacts: ContactRepository,
    private readonly submissions: SubmissionRepository,
    private readonly forms: FormRepository,
    private readonly fields: Registry<FieldType>,
    private readonly access: AccessControl,
    private readonly events: EventBus,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly pipeline: PipelineService,
    private readonly team?: Team,
    private readonly deals?: DealRepository,
    private readonly custom?: CustomFieldsService,
  ) {}

  /** Who a contact can be given to: everyone on the team who may read contacts, by name. */
  async owners(actor: Actor): Promise<TeamMember[]> {
    this.access.require(actor, 'contact:read');
    const members = (await this.team?.members()) ?? [];
    return members.filter((member) => this.access.can({ kind: 'user', id: member.id, role: member.role }, 'contact:read'));
  }

  async find(actor: Actor, query: ContactQuery = {}): Promise<Page<Contact>> {
    this.access.require(actor, 'contact:read');
    return this.contacts.find(query);
  }

  async get(actor: Actor, id: string): Promise<Contact> {
    this.access.require(actor, 'contact:read');
    return this.load(id);
  }

  /** Adds a contact by hand. An email a contact already has is refused, naming the field. */
  async create(actor: Actor, input: NewContact): Promise<Contact> {
    this.access.require(actor, 'contact:manage');
    const details = this.checked({ email: input.email, name: input.name, phone: input.phone });
    if (details.email === undefined) throw problems([{ path: ['email'], message: 'This is needed.' }]);
    await this.free(details.email, null);
    const place = await this.placed(actor, { stage: input.stage, ownerId: input.ownerId, followUpAt: input.followUpAt });
    const data = await this.custom?.values('contact', input.data, undefined);
    const now = this.clock.now();
    const contact: Contact = {
      id: this.ids.next(),
      email: details.email,
      ...(details.name !== undefined && { name: details.name }),
      ...(details.phone !== undefined && { phone: details.phone }),
      stage: place.stage ?? (await this.firstStage()),
      ...(place.ownerId !== undefined && { ownerId: place.ownerId }),
      ...(place.followUpAt !== undefined && { followUpAt: place.followUpAt }),
      ...(data !== undefined && { data }),
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
    const saved = await this.contacts.save(contact, null);
    await this.events.emit('contact.saved', { contact: saved, actor });
    return saved;
  }

  async update(actor: Actor, id: string, changes: ContactChanges): Promise<Contact> {
    this.access.require(actor, 'contact:manage');
    const current = await this.load(id);
    if (current.revision !== changes.expectedRevision) throw new ConflictError('This contact was saved by someone else. Reload it and try again.');
    const details = this.checked({ email: changes.email, name: changes.name ?? undefined, phone: changes.phone ?? undefined });
    const email = details.email ?? current.email;
    if (email !== current.email) await this.free(email, current.id);
    const place = await this.placed(actor, { stage: changes.stage, ownerId: changes.ownerId ?? undefined, followUpAt: changes.followUpAt ?? undefined });
    const data = this.custom ? await this.custom.values('contact', changes.data, current.data) : current.data;
    const { name: _name, phone: _phone, ownerId: _ownerId, followUpAt: _followUpAt, data: _data, ...kept } = current;
    const name = changes.name === null ? undefined : (details.name ?? current.name);
    const phone = changes.phone === null ? undefined : (details.phone ?? current.phone);
    const ownerId = changes.ownerId === null ? undefined : (place.ownerId ?? current.ownerId);
    const followUpAt = changes.followUpAt === null ? undefined : (place.followUpAt ?? current.followUpAt);
    const contact: Contact = {
      ...kept,
      email,
      ...(name !== undefined && { name }),
      ...(phone !== undefined && { phone }),
      stage: place.stage ?? current.stage,
      ...(ownerId !== undefined && { ownerId }),
      ...(followUpAt !== undefined && { followUpAt }),
      ...(data !== undefined && { data }),
      revision: current.revision + 1,
      updatedAt: this.clock.now(),
    };
    const saved = await this.contacts.save(contact, current.revision);
    await this.events.emit('contact.saved', { contact: saved, actor });
    return saved;
  }

  /**
   * What happened with a contact, newest first: every form they sent that was not kept as spam,
   * with its answers under the labels the form gave them, and every note.
   */
  async timeline(actor: Actor, id: string): Promise<TimelineItem[]> {
    this.access.require(actor, 'contact:read');
    this.access.require(actor, 'submission:read');
    const contact = await this.load(id);
    const forms = new Map<string, FormDef | null>();
    const items: TimelineItem[] = [];
    for await (const submission of this.sent(contact.email)) {
      if (!forms.has(submission.formId)) forms.set(submission.formId, await this.forms.get(submission.formId));
      const form = forms.get(submission.formId) ?? null;
      items.push({ kind: 'submission', at: submission.createdAt, submission, ...(form && { formLabel: form.label }), answers: answersOf(form, submission) });
    }
    for (const note of await this.contacts.notes(id)) items.push({ kind: 'note', at: note.createdAt, note });
    return items.sort((a, b) => b.at.localeCompare(a.at));
  }

  async addNote(actor: Actor, id: string, text: string): Promise<ContactNote> {
    this.access.require(actor, 'contact:manage');
    const contact = await this.load(id);
    const words = text.trim();
    if (words === '') throw problems([{ path: ['text'], message: 'Write the note first.' }]);
    if (words.length > MAX_NOTE_LENGTH) throw problems([{ path: ['text'], message: `Keep a note under ${MAX_NOTE_LENGTH} characters.` }]);
    return this.contacts.addNote({ id: this.ids.next(), contactId: contact.id, text: words, createdBy: actor.id, createdAt: this.clock.now() });
  }

  async deleteNote(actor: Actor, id: string, noteId: string): Promise<void> {
    this.access.require(actor, 'contact:manage');
    await this.load(id);
    await this.contacts.removeNote(id, noteId);
  }

  /**
   * Everything held about one person, as a JSON file to hand to them: who they are, every form
   * they sent with its answers by field key, and the team's notes.
   */
  async export(actor: Actor, id: string): Promise<string> {
    this.access.require(actor, 'contact:read');
    this.access.require(actor, 'submission:read');
    const contact = await this.load(id);
    const forms = new Map<string, FormDef | null>();
    const sent = [];
    // Everything, with what was kept as spam: it is still held about them.
    for await (const submission of this.sent(contact.email, true)) {
      if (!forms.has(submission.formId)) forms.set(submission.formId, await this.forms.get(submission.formId));
      const form = forms.get(submission.formId) ?? null;
      sent.push({
        form: form?.key ?? submission.formId,
        received: submission.createdAt,
        status: submission.status,
        ...(submission.page !== undefined && { page: submission.page }),
        answers: Object.fromEntries(answersOf(form, submission).map((answer) => [answer.key, answer.value])),
      });
    }
    const notes = (await this.contacts.notes(id)).map((note) => ({ written: note.createdAt, text: note.text }));
    const deals = [];
    for (let offset = 0; this.deals; offset += BATCH) {
      const { items } = await this.deals.find({ contactId: id, limit: BATCH, offset });
      for (const deal of items) deals.push({ title: deal.title, value: deal.value, stage: deal.stage, ...(deal.closeOn !== undefined && { closeOn: deal.closeOn }), ...(deal.data !== undefined && this.custom && { fields: await this.custom.byKey('deal', deal.data) }), made: deal.createdAt });
      if (items.length < BATCH) break;
    }
    const { id: _id, revision: _revision, source: _source, data: held, ...known } = contact;
    // The site's own fields are named by key, as a person would know them.
    const person = { ...known, ...(held !== undefined && this.custom && { fields: await this.custom.byKey('contact', held) }) };
    return `${JSON.stringify({ contact: person, submissions: sent, notes, deals }, null, 2)}\n`;
  }

  /**
   * Removes a contact for good, with their notes and everything they sent through every form.
   * It is how a request to be forgotten is met. Answers with how many submissions went.
   */
  async erase(actor: Actor, id: string): Promise<number> {
    this.access.require(actor, 'contact:manage');
    this.access.require(actor, 'submission:manage');
    const contact = await this.load(id);
    const removed = await removeSubmissions(this.submissions, this.events, actor, { email: contact.email });
    await this.deals?.removeOfContact(contact.id);
    await this.contacts.remove(contact.id);
    await this.events.emit('contact.deleted', { contact, actor });
    return removed;
  }

  /**
   * Removes the contact with this email, if there is one. The submission service calls it once
   * it has erased what the person sent, so forgetting a person by email leaves no contact behind.
   */
  async forgotten(actor: Actor, email: string): Promise<void> {
    const contact = await this.contacts.getByEmail(email.trim().toLowerCase());
    if (!contact) return;
    await this.deals?.removeOfContact(contact.id);
    await this.contacts.remove(contact.id);
    await this.events.emit('contact.deleted', { contact, actor });
  }

  /**
   * Takes note of a submission: its sender becomes a contact, or the contact who already has
   * that email gains a name or a phone number they lacked. What the team typed is never
   * overwritten by a form. A submission kept as spam, or with no email, makes nobody.
   */
  async noted(form: FormDef, submission: Submission): Promise<Contact | null> {
    if (submission.status === 'spam' || submission.email === undefined) return null;
    const text = (fieldId: string | undefined) => {
      const value = fieldId === undefined ? undefined : submission.data[fieldId];
      return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
    };
    const name = text(form.contact?.name)?.slice(0, MAX_CONTACT_NAME_LENGTH);
    const phone = text(form.contact?.phone);
    const current = await this.contacts.getByEmail(submission.email);
    const now = this.clock.now();
    let contact: Contact;
    if (!current) {
      const ownerId = await this.nextOwner();
      contact = {
        id: this.ids.next(),
        email: submission.email,
        ...(name !== undefined && { name }),
        ...(phone !== undefined && { phone }),
        source: { formId: form.id, ...(submission.page !== undefined && { page: submission.page }) },
        stage: await this.firstStage(),
        ...(ownerId !== undefined && { ownerId }),
        revision: 1,
        createdAt: now,
        updatedAt: now,
      };
    } else {
      const gains = { ...(current.name === undefined && name !== undefined && { name }), ...(current.phone === undefined && phone !== undefined && { phone }) };
      if (Object.keys(gains).length === 0) return current;
      contact = { ...current, ...gains, revision: current.revision + 1, updatedAt: now };
    }
    const saved = await this.contacts.save(contact, current?.revision ?? null);
    await this.events.emit('contact.saved', { contact: saved });
    return saved;
  }

  /**
   * Makes a contact of everyone who wrote in and is not one yet, oldest submission first. For a
   * site that took submissions before it had contacts. Answers with how many were made.
   */
  async catchUp(actor: Actor): Promise<number> {
    this.access.require(actor, 'contact:manage');
    this.access.require(actor, 'submission:read');
    const waiting: Submission[] = [];
    for (let offset = 0; ; offset += BATCH) {
      const { items } = await this.submissions.find({ limit: BATCH, offset });
      waiting.push(...items.filter((item) => item.status !== 'spam' && item.email !== undefined));
      if (items.length < BATCH) break;
    }
    const forms = new Map<string, FormDef | null>();
    let made = 0;
    for (const submission of waiting.reverse()) {
      if (!forms.has(submission.formId)) forms.set(submission.formId, await this.forms.get(submission.formId));
      const form = forms.get(submission.formId);
      if (!form) continue;
      const known = await this.contacts.getByEmail(submission.email ?? '');
      await this.noted(form, submission);
      if (!known) made += 1;
    }
    return made;
  }

  /** What a person sent, newest first, through every form. */
  private async *sent(email: string, withSpam = false): AsyncGenerator<Submission> {
    for (let offset = 0; ; offset += BATCH) {
      const { items } = await this.submissions.find({ email, limit: BATCH, offset });
      for (const item of items) if (withSpam || item.status !== 'spam') yield item;
      if (items.length < BATCH) return;
    }
  }

  /** The details as they are kept, each checked as its kind of field checks it. Problems name the fields. */
  private checked(input: { email: string | undefined; name: string | undefined; phone: string | undefined }): { email?: string; name?: string; phone?: string } {
    const issues: ValidationIssue[] = [];
    const email = input.email?.trim().toLowerCase();
    const name = input.name?.trim();
    const phone = input.phone?.trim();
    const judge = (key: 'email' | 'phone', value: string) => {
      const type = this.fields.get(key);
      const result = type.schema(type.options.parse({}), { fields: this.fields, mode: 'publish' }).safeParse(value);
      if (!result.success) issues.push({ path: [key], message: key === 'email' ? 'Enter an email address, such as ana@example.com.' : (result.error.issues[0]?.message ?? 'Enter a phone number.') });
    };
    if (input.email !== undefined) {
      if (email === '') issues.push({ path: ['email'], message: 'This is needed.' });
      else judge('email', email ?? '');
    }
    if (phone !== undefined && phone !== '') judge('phone', phone);
    if (name !== undefined && name.length > MAX_CONTACT_NAME_LENGTH) issues.push({ path: ['name'], message: `Keep a name under ${MAX_CONTACT_NAME_LENGTH} characters.` });
    if (issues.length > 0) throw problems(issues);
    return { ...(email !== undefined && { email }), ...(name !== undefined && name !== '' && { name }), ...(phone !== undefined && phone !== '' && { phone }) };
  }

  /**
   * Who a contact made by a form is given to: of the people the pipeline names, whoever looks
   * after the fewest contacts, and the first named among equals. Someone who has left the team,
   * or may no longer read contacts, is passed over.
   */
  private async nextOwner(): Promise<string | undefined> {
    const named = (await this.pipeline.current()).assignTo ?? [];
    if (named.length === 0) return undefined;
    const members = (await this.team?.members()) ?? [];
    let best: { id: string; load: number } | undefined;
    for (const id of named) {
      const member = members.find((candidate) => candidate.id === id);
      if (!member || !this.access.can({ kind: 'user', id, role: member.role }, 'contact:read')) continue;
      const load = (await this.contacts.find({ ownerId: id, limit: 1 })).total;
      if (!best || load < best.load) best = { id, load };
    }
    return best?.id;
  }

  /** Where a new contact starts. */
  private async firstStage(): Promise<string> {
    const [first] = (await this.pipeline.current()).stages;
    if (!first) throw new ConflictError('The pipeline has no stages.');
    return first.id;
  }

  /** A stage, an owner and a day to follow up, each checked. Problems name the fields. */
  private async placed(actor: Actor, input: { stage: string | undefined; ownerId: string | undefined; followUpAt: string | undefined }): Promise<{ stage?: string; ownerId?: string; followUpAt?: string }> {
    const issues: ValidationIssue[] = [];
    if (input.stage !== undefined && !(await this.pipeline.current()).stages.some((stage) => stage.id === input.stage)) {
      issues.push({ path: ['stage'], message: 'This stage is no longer in the pipeline. Choose another.' });
    }
    if (input.ownerId !== undefined && !(await this.owners(actor)).some((member) => member.id === input.ownerId)) {
      issues.push({ path: ['ownerId'], message: 'Choose someone on the team who may read contacts.' });
    }
    if (input.followUpAt !== undefined && !isDay(input.followUpAt)) issues.push({ path: ['followUpAt'], message: 'Enter a day, such as 2026-03-14.' });
    if (issues.length > 0) throw problems(issues);
    return {
      ...(input.stage !== undefined && { stage: input.stage }),
      ...(input.ownerId !== undefined && { ownerId: input.ownerId }),
      ...(input.followUpAt !== undefined && { followUpAt: input.followUpAt }),
    };
  }

  private async free(email: string, self: string | null): Promise<void> {
    const other = await this.contacts.getByEmail(email);
    if (other && other.id !== self) throw problems([{ path: ['email'], message: 'Another contact has this email address.' }]);
  }

  private async load(id: string): Promise<Contact> {
    const contact = await this.contacts.get(id);
    if (!contact) throw new NotFoundError('Contact', id);
    return contact;
  }
}

const problems = (issues: ValidationIssue[]): ValidationError =>
  new ValidationError(issues.length === 1 ? 'One detail needs another look.' : `${issues.length} details need another look.`, issues);

/** A submission's answers in the form's order, each under its field's key and label. One whose field is unknown keeps its id. */
function answersOf(form: FormDef | null, submission: Submission): SubmissionAnswer[] {
  const known = form?.fields ?? [];
  const answers: SubmissionAnswer[] = [];
  for (const field of known) {
    const value = submission.data[field.id];
    if (value !== undefined) answers.push({ key: field.key, label: field.label, value });
  }
  for (const [id, value] of Object.entries(submission.data)) {
    if (!known.some((field) => field.id === id)) answers.push({ key: id, label: { en: id }, value });
  }
  return answers;
}
