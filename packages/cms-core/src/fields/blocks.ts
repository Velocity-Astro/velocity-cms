import { z } from 'zod';
import { defineFields, requireKey, type NewField } from '../define-fields.js';
import { ConflictError, ValidationError } from '../errors.js';
import { FieldType, type DefineContext, type FieldContext } from '../field-type.js';
import type { BlockDef, BlockValue, LocalizedText, PublicBlock } from '../model.js';
import { buildFieldsSchema, toPublicData } from '../schema-builder.js';

/** A block as a template describes it. The CMS assigns the ids. */
export interface NewBlock {
  readonly key: string;
  readonly label: LocalizedText;
  /** A line in the picker on what the block is for. */
  readonly description?: LocalizedText;
  /** A Lucide icon name, for the picker. */
  readonly icon?: string;
  /** What the picker files it under, such as `Content`. */
  readonly group?: string;
  readonly fields?: readonly NewField[];
}

/**
 * Describes a block: one kind of section a page can be built from. A template describes each
 * of its blocks once and names them in every `blocks` field that allows them:
 *
 * ```ts
 * const callToAction = defineBlock({
 *   key: 'call-to-action',
 *   label: { en: 'Call to action' },
 *   fields: [{ key: 'title', type: 'text', label: { en: 'Title' }, required: true }],
 * });
 * // In a content type:
 * { key: 'body', type: 'blocks', label: { en: 'Sections' }, options: { blocks: [callToAction] } }
 * ```
 *
 * The key is what the template's component is looked up by, so it is checked here, where the
 * mistake is made, and not on the next deploy.
 */
export function defineBlock(block: NewBlock): NewBlock {
  requireKey(block.key, 'block');
  return block;
}

interface BlocksOptions {
  blocks: BlockDef[];
  min?: number | undefined;
  max?: number | undefined;
}

const blockDefs = z.custom<BlockDef[]>((value) => Array.isArray(value), 'Expected a list of blocks');

const section = z.object({
  id: z.string().min(1),
  block: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
  hidden: z.literal(true).optional(),
});

/**
 * The sections of a page, in order: each one a block and that block's values. What is stored is
 * data, never markup, so a block can change how it looks without a saved page being touched.
 */
export class BlocksField extends FieldType<BlockValue[], BlocksOptions> {
  readonly type = 'blocks';
  readonly editor = 'blocks';
  readonly options = z.object({
    blocks: blockDefs.default([]),
    min: z.number().int().min(0).optional(),
    max: z.number().int().positive().optional(),
  });

  schema({ blocks, min, max }: BlocksOptions, context: FieldContext) {
    const byId = new Map(blocks.map((block) => [block.id, block]));
    const one = section
      .superRefine((value, refinement) => {
        const block = byId.get(value.block);
        if (!block) {
          refinement.addIssue({ code: 'custom', path: ['block'], message: 'This kind of section is not one this field allows. Remove the section, or choose another kind.' });
          return;
        }
        // A retired block's sections are kept as they are: there is nothing left to check them against.
        if (block.retiredAt !== undefined) return;
        const checked = buildFieldsSchema(block.fields, context).safeParse(value.data);
        if (checked.success) return;
        for (const issue of checked.error.issues) {
          refinement.addIssue({ code: 'custom', path: ['data', ...issue.path], message: issue.message });
        }
      })
      .transform((value): BlockValue => {
        const block = byId.get(value.block);
        const checked = block && block.retiredAt === undefined ? buildFieldsSchema(block.fields, context).safeParse(value.data) : undefined;
        if (!block || !checked?.success) return withoutUnset(value);
        // The values of fields the block no longer has are carried along, as an entry's are.
        const removed = Object.fromEntries(block.fields.filter((field) => field.deletedAt !== undefined && field.id in value.data).map((field) => [field.id, value.data[field.id]]));
        return withoutUnset({ ...value, data: { ...removed, ...checked.data } });
      });
    let all = z.array(one);
    if (min !== undefined) all = all.min(min);
    if (max !== undefined) all = all.max(max);
    return all.superRefine((sections, refinement) => {
      const seen = new Set<string>();
      sections.forEach((value, index) => {
        if (seen.has(value.id)) refinement.addIssue({ code: 'custom', path: [index, 'id'], message: 'Two sections have the same id. Give each its own.' });
        seen.add(value.id);
      });
    });
  }

  /** The sections the site draws: hidden ones and those of a retired block are left out. */
  override toPublic(value: BlockValue[], { blocks }: BlocksOptions, context: FieldContext): PublicBlock[] {
    const byId = new Map(blocks.map((block) => [block.id, block]));
    const shown: PublicBlock[] = [];
    for (const one of Array.isArray(value) ? value : []) {
      const block = byId.get(one.block);
      if (!block || block.retiredAt !== undefined || one.hidden === true) continue;
      shown.push({ id: one.id, block: block.key, data: toPublicData(block.fields, one.data, context) });
    }
    return shown;
  }

  /**
   * Blocks as they are stored. A block keeps its id by key, and so does each of its fields, so
   * a template can describe its blocks again on every deploy. Owners cannot add to a block, so
   * what a description leaves out is taken as gone: a field is marked removed and a block
   * retired, and the content saved under them is kept.
   */
  override define(described: Readonly<Record<string, unknown>>, previous: Readonly<Record<string, unknown>> | undefined, context: DefineContext) {
    const before = Array.isArray(previous?.['blocks']) ? (previous['blocks'] as BlockDef[]) : [];
    const known = new Map(before.map((block) => [block.key, block]));
    const blocks: BlockDef[] = [];
    for (const input of (described['blocks'] ?? []) as (NewBlock & { id?: unknown; retiredAt?: unknown })[]) {
      requireKey(input.key, 'block');
      if (!Object.values(input.label ?? {}).some((text) => typeof text === 'string' && text.trim() !== '')) {
        throw new ValidationError(`Give the block "${input.key}" a name.`, [{ path: ['blocks', input.key, 'label'], message: 'A name is needed' }]);
      }
      if (blocks.some((block) => block.key === input.key)) throw new ConflictError(`Two blocks have the key "${input.key}". Give each its own.`);
      const earlier = known.get(input.key);
      const keys = new Set((input.fields ?? []).map((field) => field.key));
      const fields = defineFields(input.fields ?? [], earlier?.fields ?? [], context).map((field) =>
        field.deletedAt === undefined && !keys.has(field.key) ? { ...field, deletedAt: context.now } : field,
      );
      blocks.push({
        id: earlier?.id ?? (typeof input.id === 'string' ? input.id : context.ids.next()),
        key: input.key,
        label: input.label,
        ...(input.description !== undefined && { description: input.description }),
        ...(input.icon !== undefined && { icon: input.icon }),
        ...(input.group !== undefined && { group: input.group }),
        fields,
        // A retired block sent back with the rest is stored state, not a description: it stays retired.
        ...(typeof input.retiredAt === 'string' && { retiredAt: input.retiredAt }),
      });
    }
    const kept = new Set(blocks.map((block) => block.id));
    const retired = before.filter((block) => !kept.has(block.id)).map((block) => (block.retiredAt === undefined ? { ...block, retiredAt: context.now } : block));
    return { ...described, blocks: [...blocks, ...retired] };
  }
}

/** A section without the properties that were sent as `undefined`, so what is stored compares equal to what was sent. */
function withoutUnset(value: { id: string; block: string; data: Record<string, unknown>; hidden?: true | undefined }): BlockValue {
  return { id: value.id, block: value.block, data: value.data, ...(value.hidden === true && { hidden: true }) };
}
