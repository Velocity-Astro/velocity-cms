import type { AccessControl, Actor } from '../access.js';
import { ConflictError, ValidationError, type ValidationIssue } from '../errors.js';
import type { EventBus } from '../events.js';
import type { Pipeline, PipelineStage, StageKind } from '../model.js';
import type { ContactRepository, IdGenerator, PipelineStore } from '../ports.js';

/** A stage as the editor sends it. One with no id is new, and needs a label. */
export interface StageInput {
  readonly id?: string;
  /** Left out or empty for a stage the CMS came with, to go on calling it by its own name. */
  readonly label?: string;
  readonly kind: StageKind;
}

export interface PipelineChanges {
  /** Every stage the pipeline is to have, in order. A stage left out is removed. */
  readonly stages: readonly StageInput[];
  /** The revision the editor loaded. */
  readonly expectedRevision: number;
}

/**
 * The pipeline a site starts with. These stages carry no label: the editor names them in the
 * language of whoever is reading, until the team renames one.
 */
export const DEFAULT_STAGES: readonly PipelineStage[] = [
  { id: 'new', kind: 'open' },
  { id: 'contacted', kind: 'open' },
  { id: 'qualified', kind: 'open' },
  { id: 'won', kind: 'won' },
  { id: 'lost', kind: 'lost' },
];

export const MAX_STAGES = 12;
export const MAX_STAGE_LABEL_LENGTH = 40;
const KINDS: readonly StageKind[] = ['open', 'won', 'lost'];

/** Owns the pipeline: the stages a contact moves through, which a site may rename, reorder, add to and remove from. */
export class PipelineService {
  constructor(
    private readonly store: PipelineStore,
    private readonly contacts: ContactRepository,
    private readonly access: AccessControl,
    private readonly events: EventBus,
    private readonly ids: IdGenerator,
  ) {}

  async get(actor: Actor): Promise<Pipeline> {
    this.access.require(actor, 'contact:read');
    return this.current();
  }

  /** The pipeline as it stands, for the services that place contacts in it. No permission is asked: it holds nothing personal. */
  async current(): Promise<Pipeline> {
    return (await this.store.get()) ?? { stages: DEFAULT_STAGES, revision: 0 };
  }

  /**
   * Replaces the stages. A stage keeps its id, so contacts stay where they are through a rename
   * or a new order. Contacts in a stage that is removed move to the first stage.
   */
  async save(actor: Actor, changes: PipelineChanges): Promise<Pipeline> {
    this.access.require(actor, 'contact:manage');
    const current = await this.current();
    if (current.revision !== changes.expectedRevision) throw new ConflictError('The stages were changed by someone else. Reload them and try again.');
    const issues: ValidationIssue[] = [];
    const known = new Map(current.stages.map((stage) => [stage.id, stage]));
    const builtIn = new Set(DEFAULT_STAGES.map((stage) => stage.id));
    const seen = new Set<string>();
    const stages: PipelineStage[] = [];
    if (changes.stages.length === 0) issues.push({ path: ['stages'], message: 'A pipeline needs at least one stage.' });
    if (changes.stages.length > MAX_STAGES) issues.push({ path: ['stages'], message: `Keep a pipeline to ${MAX_STAGES} stages.` });
    changes.stages.forEach((input, index) => {
      const label = input.label?.trim() ?? '';
      if (input.id !== undefined && (!known.has(input.id) || seen.has(input.id))) {
        issues.push({ path: ['stages', index, 'id'], message: 'This stage is not one of the pipeline. Reload the stages and try again.' });
        return;
      }
      if (!KINDS.includes(input.kind)) issues.push({ path: ['stages', index, 'kind'], message: 'Choose open, won or lost.' });
      if (label.length > MAX_STAGE_LABEL_LENGTH) issues.push({ path: ['stages', index, 'label'], message: `Keep a stage's name under ${MAX_STAGE_LABEL_LENGTH} characters.` });
      // Only a stage the CMS came with has a name of its own to fall back on.
      if (label === '' && !(input.id !== undefined && builtIn.has(input.id))) issues.push({ path: ['stages', index, 'label'], message: 'Give the stage a name.' });
      const id = input.id ?? this.ids.next();
      seen.add(id);
      stages.push({ id, ...(label !== '' && { label }), kind: input.kind });
    });
    if (changes.stages[0] !== undefined && changes.stages[0].kind !== 'open') {
      issues.push({ path: ['stages', 0, 'kind'], message: 'The first stage is where a new contact starts, so it must be open.' });
    }
    if (issues.length > 0) throw new ValidationError(issues.length === 1 ? 'One stage needs another look.' : `${issues.length} things about the stages need another look.`, issues);
    const first = stages[0];
    if (!first) throw new ConflictError('A pipeline needs at least one stage.');
    const pipeline = await this.store.save({ stages, revision: current.revision + 1 }, current.revision === 0 ? null : current.revision);
    for (const stage of current.stages) if (!seen.has(stage.id)) await this.contacts.moveStage(stage.id, first.id);
    await this.events.emit('pipeline.saved', { pipeline, actor });
    return pipeline;
  }
}
