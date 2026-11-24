import type { EntryData } from '@velocity-astro/cms-core';
import { sameData } from './content.js';

/** Whose value stands where both sides changed the same thing. */
export type Prefer = 'mine' | 'theirs';

export interface MergedData {
  /** What the form should hold: every change of either side, and `prefer`'s where they met. */
  readonly data: EntryData;
  /** The ids of the entry's own fields in which both sides changed the same thing, differently. */
  readonly clashes: readonly string[];
}

interface Taken {
  readonly value: unknown;
  readonly clashed: boolean;
}

/** A section of a page as a `blocks` field holds it: a permanent id, its block, and that block's values by field id. */
interface Section {
  readonly id: string;
  readonly block: string;
  readonly data: Record<string, unknown>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function isSection(value: unknown): value is Section {
  return isRecord(value) && typeof value.id === 'string' && typeof value.block === 'string' && isRecord(value.data);
}

/** A list of sections, each with an id of its own. An empty list is not one: there is nothing to tell by. */
function isSections(value: unknown): value is readonly Section[] {
  return Array.isArray(value) && value.length > 0 && value.every(isSection) && new Set(value.map((section: Section) => section.id)).size === value.length;
}

const sameOrder = (a: readonly Section[], b: readonly Section[]) => a.length === b.length && a.every((section, index) => section.id === b[index]?.id);

/** Brings two sets of values by field id together, field by field. */
function mergeFields(base: Record<string, unknown>, mine: Record<string, unknown>, theirs: Record<string, unknown>, prefer: Prefer) {
  const merged: Record<string, unknown> = {};
  const clashes: string[] = [];
  // In the order the form holds them, then what only the other side has.
  for (const key of new Set([...Object.keys(mine), ...Object.keys(theirs)])) {
    const taken = mergeValue(base[key], mine[key], theirs[key], prefer);
    if (taken.clashed) clashes.push(key);
    // A field one side cleared is left out, as a form leaves out what holds nothing.
    if (taken.value !== undefined) merged[key] = taken.value;
  }
  return { merged, clashes };
}

/** One section both sides still have: its values field by field, and anything else it says (hidden) as a whole. */
function mergeSection(base: Section, mine: Section, theirs: Section, prefer: Prefer): Taken {
  // Another block's values are not this block's: the section is one thing then.
  if (mine.block !== base.block || theirs.block !== base.block) return { value: prefer === 'mine' ? mine : theirs, clashed: true };
  const { data: baseData, ...baseRest } = base;
  const { data: mineData, ...mineRest } = mine;
  const { data: theirData, ...theirRest } = theirs;
  const fields = mergeFields(baseData, mineData, theirData, prefer);
  const rest = mergeFields(baseRest, mineRest, theirRest, prefer);
  const value = { ...rest.merged, data: fields.merged };
  // The form's own object where nothing came in, so nothing is drawn again for it.
  return { value: sameData(value, mine) ? mine : value, clashed: fields.clashes.length > 0 || rest.clashes.length > 0 };
}

/**
 * The sections of a page. One side may have added, removed or moved sections while the other
 * changed what sections hold: then both stand. Where both changed which sections there are, or
 * one removed a section the other wrote in, the list is one thing and `prefer` decides.
 */
function mergeSections(base: readonly Section[], mine: readonly Section[], theirs: readonly Section[], prefer: Prefer): Taken {
  const whole: Taken = { value: prefer === 'mine' ? mine : theirs, clashed: true };
  const mineKept = sameOrder(mine, base);
  if (!mineKept && !sameOrder(theirs, base)) return whole;
  // Whoever arranged the list says which sections there are; the other only wrote in them.
  const arranged = mineKept ? theirs : mine;
  const written = mineKept ? mine : theirs;
  const baseById = new Map(base.map((section) => [section.id, section]));
  const writtenById = new Map(written.map((section) => [section.id, section]));
  const kept = new Set(arranged.map((section) => section.id));
  // A section that was removed, and written in by the other side meanwhile.
  if (base.some((section) => !kept.has(section.id) && !sameData(writtenById.get(section.id), section))) return whole;
  let clashed = false;
  const value = arranged.map((section) => {
    const before = baseById.get(section.id);
    const other = writtenById.get(section.id);
    // A new section is its maker's.
    if (before === undefined || other === undefined) return section;
    const taken = mineKept ? mergeSection(before, other, section, prefer) : mergeSection(before, section, other, prefer);
    clashed ||= taken.clashed;
    return taken.value;
  });
  return { value: sameData(value, mine) ? mine : value, clashed };
}

/**
 * One value, three ways: as it was when the form last agreed with the server (`base`), as the form
 * holds it (`mine`) and as the server holds it now (`theirs`). A change only one side made stands.
 */
function mergeValue(base: unknown, mine: unknown, theirs: unknown, prefer: Prefer): Taken {
  if (sameData(mine, theirs)) return { value: mine, clashed: false };
  if (sameData(mine, base)) return { value: theirs, clashed: false };
  if (sameData(theirs, base)) return { value: mine, clashed: false };
  // Both changed it. Sections are looked into, however deep: a section's own fields may hold sections.
  if (isSections(base) && isSections(mine) && isSections(theirs)) return mergeSections(base, mine, theirs, prefer);
  return { value: prefer === 'mine' ? mine : theirs, clashed: true };
}

/**
 * Brings what someone else saved into what the form holds, so neither is lost. `base` is the
 * entry's data as the form last had it from the server. Whatever only one side changed is kept:
 * a field of the entry, a field of a section, a section added, moved or removed. Where both
 * changed the same thing differently, `prefer` says whose stands, and the field is named.
 */
export function mergeEntryData(base: EntryData, mine: EntryData, theirs: EntryData, prefer: Prefer): MergedData {
  if (sameData(mine, theirs)) return { data: mine, clashes: [] };
  const { merged, clashes } = mergeFields(base, mine, theirs, prefer);
  return { data: sameData(merged, mine) ? mine : merged, clashes };
}
