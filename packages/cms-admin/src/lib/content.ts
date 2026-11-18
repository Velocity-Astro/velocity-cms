import {
  pageAddress,
  hasUnpublishedChanges,
  liveFields,
  type ContentTypeDef,
  type Entry,
  type EntryData,
  type FieldDef,
  type LocalizedText,
} from '@velocity/cms-core';

/** The text for a language, falling back to its base language (`es` for `es-ES`), then to any. */
export function localized(text: LocalizedText, locale: string): string {
  return text[locale] ?? text[locale.split('-')[0] ?? locale] ?? Object.values(text)[0] ?? '';
}

/** A language's name in the reader's own language: `Spanish` for `es`. The tag itself if it has no name. */
export function languageName(tag: string, locale: string): string {
  try {
    return new Intl.DisplayNames(locale, { type: 'language' }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

/**
 * What to call an entry in a list: the value of the field its content type names, or of its
 * first text field when the type names none. `null` when that is empty.
 */
export function entryTitle(type: ContentTypeDef, data: EntryData): string | null {
  const path = type.titlePath ?? liveFields(type.fields).filter((candidate) => candidate.type === 'text').slice(0, 1).map((field) => field.id);
  let value: unknown = data;
  for (const id of path) value = typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[id] : undefined;
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** A field of a type and its value in an entry, found by a path of field ids from the top down. */
export function fieldAt(type: ContentTypeDef, data: EntryData, path: readonly string[]): { readonly field: FieldDef; readonly value: unknown } | null {
  let fields: readonly FieldDef[] = type.fields;
  let value: unknown = data;
  let found: FieldDef | undefined;
  for (const id of path) {
    found = fields.find((candidate) => candidate.id === id && candidate.deletedAt === undefined);
    if (!found) return null;
    value = typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[id] : undefined;
    fields = Array.isArray(found.options['fields']) ? (found.options['fields'] as FieldDef[]) : [];
  }
  return found ? { field: found, value } : null;
}

/**
 * The name of the image a list shows for an entry, from the field its type names. For a field
 * that holds several images, the first.
 */
export function entryImage(type: ContentTypeDef, data: EntryData): string | null {
  const at = type.list?.imagePath ? fieldAt(type, data, type.list.imagePath) : null;
  const value = Array.isArray(at?.value) ? at.value[0] : at?.value;
  return typeof value === 'string' && value !== '' ? value : null;
}

/** Where an entry stands, as the editor shows it. */
export type EntryState = 'draft' | 'scheduled' | 'published' | 'unpublishedChanges';

export function entryState(entry: Entry): EntryState {
  // Set to go out at a time, whether or not an earlier version is on the site meanwhile.
  if (entry.publishAt !== undefined) return 'scheduled';
  if (hasUnpublishedChanges(entry)) return 'unpublishedChanges';
  return entry.status;
}

/** A copy of field values with one changed. `undefined` empties the field, which removes it. */
export function withValue(values: Readonly<Record<string, unknown>>, fieldId: string, value: unknown): Record<string, unknown> {
  const { [fieldId]: _previous, ...rest } = values;
  return value === undefined ? rest : { ...rest, [fieldId]: value };
}

/** Whether two sets of field values hold the same content, whatever order their fields are in. */
export function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => key in right && sameData(left[key], right[key]));
}

/** One thing in every language it exists in: the versions of an entry that translate each other. */
export interface EntryGroup {
  /** The version to show and open first: the reader's language if there is one. */
  readonly primary: Entry;
  /** Every version, the primary first. */
  readonly versions: readonly Entry[];
}

/**
 * Puts translations of the same entry together, keeping the order of the list: a group sits
 * where its first version was.
 */
export function groupTranslations(entries: readonly Entry[], locale: string): EntryGroup[] {
  const base = locale.split('-')[0] ?? locale;
  const groups = new Map<string, Entry[]>();
  for (const entry of entries) groups.set(entry.translationGroup, [...(groups.get(entry.translationGroup) ?? []), entry]);
  return [...groups.values()].map((versions) => {
    const primary = versions.find((entry) => entry.locale === locale) ?? versions.find((entry) => entry.locale.split('-')[0] === base) ?? versions[0];
    if (!primary) throw new Error('A group of translations has no entries.');
    return { primary, versions: [primary, ...versions.filter((entry) => entry !== primary)] };
  });
}

/**
 * Where an entry's own page is on the site, or `null` when it has none yet. The pattern for the
 * entry's language is used when the type has one, and the type's main pattern otherwise.
 */
export function entryAddress(type: ContentTypeDef, entry: Pick<Entry, 'locale' | 'slug' | 'data'>): string | null {
  const urlPattern = type.localizedUrlPatterns?.[entry.locale] ?? type.urlPattern;
  return urlPattern === undefined ? null : pageAddress({ urlPattern, fields: type.fields }, entry, entry.locale);
}
