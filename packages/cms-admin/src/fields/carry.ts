import { liveFields, type BlockDef, type BlockValue, type FieldDef } from '@velocity-astro/cms-core';
import type { FieldControl } from './field-control.js';

type ControlFor = (type: string) => FieldControl | undefined;

const isSection = (value: unknown): value is BlockValue =>
  typeof value === 'object' && value !== null && typeof (value as BlockValue).id === 'string' && typeof (value as BlockValue).block === 'string';

/**
 * Values keyed by the ids of one set of fields, keyed by the ids of another set with the same
 * keys: what a group or a section holds, as its twin in another place holds it. Nothing when a
 * value has no field of its key and kind to go to, so nothing is lost by a move.
 */
export function carriedValues(from: readonly FieldDef[], to: readonly FieldDef[], values: Readonly<Record<string, unknown>>, controlFor: ControlFor): Record<string, unknown> | undefined {
  const carried: Record<string, unknown> = {};
  for (const field of liveFields([...from])) {
    const value = values[field.id];
    if (value === undefined) continue;
    const twin = liveFields([...to]).find((candidate) => candidate.key === field.key && candidate.type === field.type);
    if (!twin) return undefined;
    const carry = controlFor(field.type)?.carried;
    const held = carry ? carry(field, twin, value, controlFor) : value;
    if (held === undefined) return undefined;
    carried[twin.id] = held;
  }
  return carried;
}

/** A section as a place that takes other blocks' ids holds it: the block of the same key there, and its values under that block's fields. */
export function carriedSection(from: readonly BlockDef[], to: readonly BlockDef[], section: BlockValue, controlFor: ControlFor): BlockValue | undefined {
  const block = from.find((candidate) => candidate.id === section.block);
  const twin = block && to.find((candidate) => candidate.key === block.key && candidate.retiredAt === undefined);
  if (!block || !twin) return undefined;
  if (twin.id === block.id) return section;
  const data = carriedValues(block.fields, twin.fields, section.data, controlFor);
  return data && { ...section, block: twin.id, data };
}

const fieldsOf = (field: FieldDef): readonly FieldDef[] => (Array.isArray(field.options['fields']) ? (field.options['fields'] as FieldDef[]) : []);
const blocksOf = (field: FieldDef): readonly BlockDef[] => (Array.isArray(field.options['blocks']) ? (field.options['blocks'] as BlockDef[]) : []);

/** A group's values go under the other group's fields. */
export const groupCarried: NonNullable<FieldControl['carried']> = (from, to, value, controlFor) =>
  typeof value === 'object' && value !== null ? carriedValues(fieldsOf(from), fieldsOf(to), value as Record<string, unknown>, controlFor) : value;

/** Each item of a list is carried as the kind of thing the list holds. */
export const listCarried: NonNullable<FieldControl['carried']> = (from, to, value, controlFor) => {
  if (!Array.isArray(value)) return value;
  const of = (field: FieldDef): FieldDef => {
    const item = (field.options['of'] ?? { type: 'text' }) as { readonly type: string; readonly options?: Readonly<Record<string, unknown>> };
    return { ...field, type: item.type, options: item.options ?? {} };
  };
  const carry = controlFor(of(from).type)?.carried;
  if (!carry || of(from).type !== of(to).type) return of(from).type === of(to).type ? value : undefined;
  const items = value.map((item: unknown) => carry(of(from), of(to), item, controlFor));
  return items.includes(undefined) ? undefined : items;
};

/** Sections inside a section go with it, each under the block of its key. */
export const blocksCarried: NonNullable<FieldControl['carried']> = (from, to, value, controlFor) => {
  if (!Array.isArray(value)) return value;
  const sections = value.map((section: unknown) => (isSection(section) ? carriedSection(blocksOf(from), blocksOf(to), section, controlFor) : undefined));
  return sections.includes(undefined) ? undefined : sections;
};
