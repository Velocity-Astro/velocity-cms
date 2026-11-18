import type { AccessControl, Actor } from '../access.js';
import { NotFoundError, ValidationError, type ValidationIssue } from '../errors.js';
import type { EventBus } from '../events.js';
import type { FieldType } from '../field-type.js';
import { liveFields, type Contact, type DealSubject, type FormDef, type Page, type Submission, type SubmissionStatus } from '../model.js';
import type { Clock, FormRepository, IdGenerator, SubmissionQuery, SubmissionRepository } from '../ports.js';
import type { Registry } from '../registry.js';
import { buildFieldsSchema } from '../schema-builder.js';

/** What is known about a submission besides what was typed. */
export interface SubmissionSource {
  /** The path of the page the form was on. Anything that is not a path of this site is dropped. */
  readonly page?: string;
  readonly locale?: string;
  /** True when the checks on the way in suspected it. It is kept, apart from the rest. */
  readonly suspected?: boolean;
  /**
   * The entry whose own page the form was on, as the server worked it out from the page's
   * address. Never taken from what the visitor sent.
   */
  readonly about?: DealSubject;
}

/** What the submission service asks of whoever keeps contacts, so each sender becomes one. */
export interface SenderBook {
  noted(form: FormDef, submission: Submission): Promise<Contact | null>;
  forgotten(actor: Actor, email: string): Promise<void>;
}

/** What the submission service asks of whoever keeps deals, so an enquiry about an entry becomes one. */
export interface DealStarter {
  started(form: FormDef, submission: Submission, contact: Contact): Promise<unknown>;
}

/** The longest one answer may be, whatever its field allows. */
export const MAX_ANSWER_LENGTH = 10_000;
const LOCALE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const BATCH = 200;

/**
 * Owns what visitors send through forms. It is personal data, so reading it has a permission of
 * its own, and nothing here hands it to a page, a cache or the search index.
 */
export class SubmissionService {
  constructor(
    private readonly submissions: SubmissionRepository,
    private readonly forms: FormRepository,
    private readonly fields: Registry<FieldType>,
    private readonly access: AccessControl,
    private readonly events: EventBus,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly senders?: SenderBook,
    private readonly deals?: DealStarter,
  ) {}

  /**
   * Takes what a visitor sent. Nobody is signed in: what allows it is that the form is open. Only
   * the form's own fields are kept, each checked as its kind of field checks it, and a refusal
   * names the fields by key so the page can show each problem where it is.
   */
  async submit(formKey: string, sent: Readonly<Record<string, unknown>>, source: SubmissionSource = {}): Promise<Submission> {
    return (await this.receive(formKey, sent, source)).submission;
  }

  /**
   * `submit`, answering with the form as well, for the server's own address that takes posts: it
   * needs the form's people to tell them. The form is never for the visitor.
   */
  async receive(formKey: string, sent: Readonly<Record<string, unknown>>, source: SubmissionSource = {}): Promise<{ readonly submission: Submission; readonly form: FormDef }> {
    const form = await this.forms.getByKey(formKey);
    // A closed form answers as one that is not there: it says nothing of what the site holds.
    if (!form || !form.open) throw new NotFoundError('Form', formKey);

    const live = liveFields(form.fields);
    const issues: ValidationIssue[] = [];
    const values: Record<string, unknown> = {};
    for (const field of live) {
      const raw = sent[field.key];
      if (typeof raw === 'string' && raw.length > MAX_ANSWER_LENGTH) {
        issues.push({ path: [field.key], message: `Keep this under ${MAX_ANSWER_LENGTH} characters.` });
        continue;
      }
      const type = this.fields.get(field.type);
      const value = type.fromSubmitted(raw, type.options.parse(field.options));
      if (value !== undefined) values[field.id] = value;
    }
    const checked = buildFieldsSchema(live, { fields: this.fields, mode: 'publish' }).safeParse(values);
    if (!checked.success) {
      for (const issue of checked.error.issues) {
        const field = live.find((candidate) => candidate.id === issue.path[0]);
        if (!field || issues.some((known) => known.path[0] === field.key)) continue;
        issues.push({ path: [field.key], message: values[field.id] === undefined ? 'This is needed.' : issue.message });
      }
    }
    if (issues.length > 0 || !checked.success) {
      throw new ValidationError(issues.length === 1 ? 'One answer needs another look.' : `${issues.length} answers need another look.`, issues);
    }

    const emailField = form.contact?.email;
    const email = emailField === undefined ? undefined : checked.data[emailField];
    const submission: Submission = {
      id: this.ids.next(),
      formId: form.id,
      status: source.suspected === true ? 'spam' : 'new',
      data: checked.data,
      ...(typeof email === 'string' && { email: email.toLowerCase() }),
      ...(source.locale !== undefined && LOCALE.test(source.locale) && { locale: source.locale }),
      ...(isOwnPath(source.page) && { page: source.page }),
      ...(source.about !== undefined && { about: { typeId: source.about.typeId, entry: source.about.entry } }),
      createdAt: this.clock.now(),
    };
    const stored = await this.submissions.add(submission);
    await this.note(form, stored);
    await this.events.emit('submission.received', { submission: stored, form });
    return { submission: stored, form };
  }

  async find(actor: Actor, query: SubmissionQuery = {}): Promise<Page<Submission>> {
    this.access.require(actor, 'submission:read');
    return this.submissions.find(query);
  }

  /** How many of a form's submissions are new, handled and suspected. */
  async counts(actor: Actor, formId: string): Promise<Readonly<Record<SubmissionStatus, number>>> {
    this.access.require(actor, 'submission:read');
    return this.submissions.counts(formId);
  }

  async get(actor: Actor, id: string): Promise<Submission> {
    this.access.require(actor, 'submission:read');
    return this.load(id);
  }

  /** Marks a submission new, handled or spam, and records who handled it. */
  async mark(actor: Actor, id: string, status: SubmissionStatus): Promise<Submission> {
    this.access.require(actor, 'submission:manage');
    const current = await this.load(id);
    if (current.status === status) return current;
    const { handledAt, handledBy, ...rest } = current;
    const marked: Submission = { ...rest, status, ...(status === 'handled' && { handledAt: this.clock.now(), handledBy: actor.id }) };
    await this.submissions.update(marked);
    // One that was kept as spam and turns out to be a person: they become a contact now.
    if (current.status === 'spam') {
      const form = await this.forms.get(marked.formId);
      if (form) await this.note(form, marked);
    }
    await this.events.emit('submission.changed', { submission: marked, actor });
    return marked;
  }

  async delete(actor: Actor, id: string): Promise<void> {
    this.access.require(actor, 'submission:manage');
    const current = await this.load(id);
    await this.submissions.remove([id]);
    await this.events.emit('submission.deleted', { formId: current.formId, ids: [id], actor });
  }

  /**
   * Everything a form was sent, as a CSV file: a column for each field it has or had, by key.
   * A value a spreadsheet would run as a formula is written so that it is read as text.
   */
  async export(actor: Actor, formId: string): Promise<string> {
    this.access.require(actor, 'submission:read');
    const form = await this.forms.get(formId);
    if (!form) throw new NotFoundError('Form', formId);
    // A removed field whose key a live field has taken is told apart by its id.
    const taken = new Set(liveFields(form.fields).map((field) => field.key));
    const columns = form.fields.map((field) => ({ id: field.id, name: field.deletedAt !== undefined && taken.has(field.key) ? `${field.key} (${field.id})` : field.key }));
    const rows = [['received', 'status', 'page', ...columns.map((column) => column.name)]];
    for await (const submission of this.all({ formId })) {
      rows.push([submission.createdAt, submission.status, submission.page ?? '', ...columns.map((column) => cellText(submission.data[column.id]))]);
    }
    return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }

  /**
   * Removes everything one person sent, through every form, for good. Answers with how many
   * submissions went. It is how a request to be forgotten is met.
   */
  async erase(actor: Actor, email: string): Promise<number> {
    this.access.require(actor, 'submission:manage');
    const address = email.trim().toLowerCase();
    if (address === '') throw new ValidationError('Give the email address of the person to forget.', [{ path: ['email'], message: 'This is needed.' }]);
    const removed = await this.removeWhere(actor, { email: address });
    await this.senders?.forgotten(actor, address);
    return removed;
  }

  /** Removes what each form has kept longer than it says to. A host runs it now and then. */
  async purge(actor: Actor): Promise<number> {
    this.access.require(actor, 'submission:manage');
    const now = Date.parse(this.clock.now());
    let removed = 0;
    for (const form of [...(await this.forms.list()), ...(await this.forms.list({ trashed: true }))]) {
      if (form.retentionDays === undefined) continue;
      const before = new Date(now - form.retentionDays * 86_400_000).toISOString();
      removed += await this.removeWhere(actor, { formId: form.id, before });
    }
    return removed;
  }

  private removeWhere(actor: Actor, query: SubmissionQuery): Promise<number> {
    return removeSubmissions(this.submissions, this.events, actor, query);
  }

  /** The sender becomes a contact. A contact that cannot be made never loses the submission: `contacts.catchUp` makes it later. */
  private async note(form: FormDef, submission: Submission): Promise<void> {
    try {
      const contact = await this.senders?.noted(form, submission);
      if (contact) await this.deals?.started(form, submission, contact);
    } catch {
      // The submission is stored, and that is what the visitor was promised.
    }
  }

  private async *all(query: SubmissionQuery): AsyncGenerator<Submission> {
    for (let offset = 0; ; offset += BATCH) {
      const { items } = await this.submissions.find({ ...query, limit: BATCH, offset });
      yield* items;
      if (items.length < BATCH) return;
    }
  }

  private async load(id: string): Promise<Submission> {
    const submission = await this.submissions.get(id);
    if (!submission) throw new NotFoundError('Submission', id);
    return submission;
  }
}

/** Removes every submission a query finds, for good, and announces them form by form. Answers with how many went. */
export async function removeSubmissions(submissions: SubmissionRepository, events: EventBus, actor: Actor, query: SubmissionQuery): Promise<number> {
  let removed = 0;
  for (;;) {
    // Always the first page: what was found last time is gone.
    const { items } = await submissions.find({ ...query, limit: BATCH });
    if (items.length === 0) return removed;
    await submissions.remove(items.map((item) => item.id));
    const byForm = new Map<string, string[]>();
    for (const item of items) byForm.set(item.formId, [...(byForm.get(item.formId) ?? []), item.id]);
    for (const [formId, ids] of byForm) await events.emit('submission.deleted', { formId, ids, actor });
    removed += items.length;
  }
}

/** A path of this site: it starts with one slash, and holds nothing that would lead elsewhere. */
function isOwnPath(page: string | undefined): page is string {
  return page !== undefined && page.length <= 300 && /^\/(?!\/)[^\s\\]*$/.test(page);
}

function cellText(value: unknown): string {
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : JSON.stringify(value);
}

/** One cell of a CSV file. A spreadsheet runs a cell that starts like a formula, so those start with a quote mark. */
function csvCell(text: string): string {
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
