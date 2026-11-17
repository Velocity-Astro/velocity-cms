import {
  hasUnpublishedChanges,
  liveFields,
  type ContentTypeDef,
  type Entry,
  type EntryData,
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
 * What to call an entry in a list: the value of its first text field, or `null` when that is
 * empty. Content types will be able to choose this field; until then the first one is used.
 */
export function entryTitle(type: ContentTypeDef, data: EntryData): string | null {
  const field = liveFields(type.fields).find((candidate) => candidate.type === 'text');
  const value = field ? data[field.id] : undefined;
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** Where an entry stands, as the editor shows it. */
export type EntryState = 'draft' | 'scheduled' | 'published' | 'unpublishedChanges';

export function entryState(entry: Entry): EntryState {
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
