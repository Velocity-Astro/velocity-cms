import type { AccessControl, Actor } from '../access.js';
import { isDay } from '../day.js';
import { ConflictError, NotFoundError, ValidationError, type ValidationIssue } from '../errors.js';
import type { EventBus } from '../events.js';
import { isLiveType, type Deal, type DealSubject, type Forecast, type Page, type PipelineStage } from '../model.js';
import type { Clock, ContactRepository, DealQuery, DealRepository, EntryRepository, IdGenerator, SchemaRepository } from '../ports.js';
import type { ContactService } from './contact-service.js';
import type { CustomFieldsService } from './custom-fields-service.js';
import { DEFAULT_CURRENCY, chanceOf, type PipelineService } from './pipeline-service.js';

export interface NewDeal {
  readonly contactId: string;
  readonly title: string;
  readonly value: number;
  /** The entry of the site it is about. */
  readonly about?: DealSubject;
  /** The stage to start in. Left out, the pipeline's first. */
  readonly stage?: string;
  /** Left out, whoever looks after the contact. */
  readonly ownerId?: string;
  readonly closeOn?: string;
  /** What the site's own fields for deals hold, by field id. */
  readonly data?: Readonly<Record<string, unknown>>;
}

/** What to change in a deal. Anything left out stays as it is; `null` clears it. */
export interface DealChanges {
  readonly title?: string;
  /** The entry of the site it is about. `null` says it is about none. */
  readonly about?: DealSubject | null;
  readonly value?: number;
  readonly stage?: string;
  readonly ownerId?: string | null;
  readonly closeOn?: string | null;
  /** The site's own fields to change, by field id. One left out stays as it is; an empty one is cleared. */
  readonly data?: Readonly<Record<string, unknown>>;
  /** The revision the editor loaded. The update is refused if someone saved in between. */
  readonly expectedRevision: number;
}

/** Where a deal's subject is looked up: the site's content types and their entries. */
export interface DealSubjects {
  readonly types: SchemaRepository;
  readonly entries: EntryRepository;
}

export const MAX_DEAL_TITLE_LENGTH = 200;
export const MAX_DEAL_VALUE = 1_000_000_000_000;

/**
 * Owns deals: what a contact may buy, what it is worth and how far along it is. A deal belongs to
 * its contact and is as personal as they are, so it is read and changed with the permissions for
 * contacts.
 */
export class DealService {
  constructor(
    private readonly deals: DealRepository,
    private readonly contacts: ContactRepository,
    private readonly people: ContactService,
    private readonly pipeline: PipelineService,
    private readonly access: AccessControl,
    private readonly events: EventBus,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly custom?: CustomFieldsService,
    private readonly subjects?: DealSubjects,
  ) {}

  async find(actor: Actor, query: DealQuery = {}): Promise<Page<Deal>> {
    this.access.require(actor, 'contact:read');
    return this.deals.find(query);
  }

  async get(actor: Actor, id: string): Promise<Deal> {
    this.access.require(actor, 'contact:read');
    return this.load(id);
  }

  async create(actor: Actor, input: NewDeal): Promise<Deal> {
    this.access.require(actor, 'contact:manage');
    const contact = await this.contacts.get(input.contactId);
    if (!contact) throw problems([{ path: ['contactId'], message: 'This contact is no longer here. Choose another.' }]);
    const stages = (await this.pipeline.current()).stages;
    const checked = await this.checked(actor, stages, { title: input.title, value: input.value, stage: input.stage, ownerId: input.ownerId, closeOn: input.closeOn });
    const stage = stages.find((candidate) => candidate.id === checked.stage) ?? stages[0];
    if (!stage || checked.title === undefined || checked.value === undefined) throw new ConflictError('The pipeline has no stages.');
    const ownerId = checked.ownerId ?? contact.ownerId;
    const data = await this.custom?.values('deal', input.data, undefined);
    const about = input.about && (await this.subject(input.about));
    const now = this.clock.now();
    const deal: Deal = {
      id: this.ids.next(),
      contactId: contact.id,
      title: checked.title,
      ...(about && { about }),
      value: checked.value,
      stage: stage.id,
      ...(ownerId !== undefined && { ownerId }),
      ...(checked.closeOn !== undefined && { closeOn: checked.closeOn }),
      ...(stage.kind !== 'open' && { closedAt: now }),
      ...(data !== undefined && { data }),
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
    const saved = await this.deals.save(deal, null);
    await this.events.emit('deal.saved', { deal: saved, actor });
    return saved;
  }

  async update(actor: Actor, id: string, changes: DealChanges): Promise<Deal> {
    this.access.require(actor, 'contact:manage');
    const current = await this.load(id);
    if (current.revision !== changes.expectedRevision) throw new ConflictError('This deal was saved by someone else. Reload it and try again.');
    const stages = (await this.pipeline.current()).stages;
    const checked = await this.checked(actor, stages, { title: changes.title, value: changes.value, stage: changes.stage, ownerId: changes.ownerId ?? undefined, closeOn: changes.closeOn ?? undefined });
    const data = this.custom ? await this.custom.values('deal', changes.data, current.data) : current.data;
    // A subject that is not changed is not looked up again: its entry may have gone since, and the deal keeps it.
    const same = changes.about && current.about?.typeId === changes.about.typeId && current.about.entry === changes.about.entry;
    const about = changes.about === undefined || same ? current.about : changes.about === null ? undefined : await this.subject(changes.about);
    const { ownerId: _ownerId, closeOn: _closeOn, closedAt: _closedAt, data: _data, about: _about, ...kept } = current;
    const stageId = checked.stage ?? current.stage;
    const isOpen = (stages.find((candidate) => candidate.id === stageId)?.kind ?? 'open') === 'open';
    const ownerId = changes.ownerId === null ? undefined : (checked.ownerId ?? current.ownerId);
    const closeOn = changes.closeOn === null ? undefined : (checked.closeOn ?? current.closeOn);
    const now = this.clock.now();
    // It closed when it first reached a won or lost stage, and opens again if it is moved back.
    const closedAt = isOpen ? undefined : (current.closedAt ?? now);
    const deal: Deal = {
      ...kept,
      title: checked.title ?? current.title,
      ...(about && { about }),
      value: checked.value ?? current.value,
      stage: stageId,
      ...(ownerId !== undefined && { ownerId }),
      ...(closeOn !== undefined && { closeOn }),
      ...(closedAt !== undefined && { closedAt }),
      ...(data !== undefined && { data }),
      revision: current.revision + 1,
      updatedAt: now,
    };
    const saved = await this.deals.save(deal, current.revision);
    await this.events.emit('deal.saved', { deal: saved, actor });
    return saved;
  }

  async delete(actor: Actor, id: string): Promise<void> {
    this.access.require(actor, 'contact:manage');
    const deal = await this.load(id);
    await this.deals.remove(deal.id);
    await this.events.emit('deal.deleted', { deal, actor });
  }

  /** Where the deals stand, stage by stage, in the pipeline's order. */
  async forecast(actor: Actor): Promise<Forecast> {
    this.access.require(actor, 'contact:read');
    const pipeline = await this.pipeline.current();
    const totals = new Map((await this.deals.totals()).map((total) => [total.stage, total]));
    const sums = { open: 0, weighted: 0, won: 0, lost: 0 };
    const stages = pipeline.stages.map((stage) => {
      const { count, value } = totals.get(stage.id) ?? { count: 0, value: 0 };
      const weighted = Math.round(value * chanceOf(stage));
      sums[stage.kind] += value;
      if (stage.kind === 'open') sums.weighted += weighted;
      return { stage: stage.id, count, value, weighted };
    });
    return { currency: pipeline.currency ?? DEFAULT_CURRENCY, stages, ...sums };
  }

  /** What was given, each part checked. Problems name the fields. */
  private async checked(
    actor: Actor,
    stages: readonly PipelineStage[],
    input: { title: string | undefined; value: number | undefined; stage: string | undefined; ownerId: string | undefined; closeOn: string | undefined },
  ): Promise<{ title?: string; value?: number; stage?: string; ownerId?: string; closeOn?: string }> {
    const issues: ValidationIssue[] = [];
    const title = input.title?.trim();
    if (title !== undefined && title === '') issues.push({ path: ['title'], message: 'Say what the deal is about.' });
    if (title !== undefined && title.length > MAX_DEAL_TITLE_LENGTH) issues.push({ path: ['title'], message: `Keep it under ${MAX_DEAL_TITLE_LENGTH} characters.` });
    if (input.value !== undefined && !(Number.isInteger(input.value) && input.value >= 0 && input.value <= MAX_DEAL_VALUE)) {
      issues.push({ path: ['value'], message: 'Give what it is worth as a whole number, 0 or more.' });
    }
    if (input.stage !== undefined && !stages.some((stage) => stage.id === input.stage)) issues.push({ path: ['stage'], message: 'This stage is no longer in the pipeline. Choose another.' });
    if (input.ownerId !== undefined && !(await this.people.owners(actor)).some((member) => member.id === input.ownerId)) {
      issues.push({ path: ['ownerId'], message: 'Choose someone on the team who may read contacts.' });
    }
    if (input.closeOn !== undefined && !isDay(input.closeOn)) issues.push({ path: ['closeOn'], message: 'Enter a day, such as 2026-03-14.' });
    if (issues.length > 0) throw problems(issues);
    return {
      ...(title !== undefined && { title }),
      ...(input.value !== undefined && { value: input.value }),
      ...(input.stage !== undefined && { stage: input.stage }),
      ...(input.ownerId !== undefined && { ownerId: input.ownerId }),
      ...(input.closeOn !== undefined && { closeOn: input.closeOn }),
    };
  }

  /** The subject as it is stored, once its type takes deals and its entry is there. */
  private async subject(about: DealSubject): Promise<DealSubject> {
    const type = await this.subjects?.types.get(about.typeId);
    if (!type || !isLiveType(type) || type.forDeals !== true) {
      throw problems([{ path: ['about'], message: 'Deals cannot be about this kind of content. Choose another, or turn it on for the content type.' }]);
    }
    const found = await this.subjects?.entries.find({ typeId: type.id, translationGroup: about.entry, limit: 1 });
    if (!found || found.total === 0) throw problems([{ path: ['about'], message: 'This entry is no longer here. Choose another.' }]);
    return { typeId: type.id, entry: about.entry };
  }

  private async load(id: string): Promise<Deal> {
    const deal = await this.deals.get(id);
    if (!deal) throw new NotFoundError('Deal', id);
    return deal;
  }
}

const problems = (issues: ValidationIssue[]): ValidationError =>
  new ValidationError(issues.length === 1 ? 'One detail needs another look.' : `${issues.length} details need another look.`, issues);
