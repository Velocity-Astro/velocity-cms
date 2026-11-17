import { hasUnpublishedChanges, liveFields, type ContentTypeDef, type Entry, type LocalizedText } from '@velocity/cms-core';

/** The text for a language, falling back to its base language (`es` for `es-ES`), then to any. */
export function localized(text: LocalizedText, locale: string): string {
  return text[locale] ?? text[locale.split('-')[0] ?? locale] ?? Object.values(text)[0] ?? '';
}

/**
 * What to call an entry in a list: the value of its first text field, or `null` when that is
 * empty. Content types will be able to choose this field; until then the first one is used.
 */
export function entryTitle(type: ContentTypeDef, entry: Entry): string | null {
  const field = liveFields(type.fields).find((candidate) => candidate.type === 'text');
  const value = field ? entry.data[field.id] : undefined;
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** Where an entry stands, as the editor shows it. */
export type EntryState = 'draft' | 'scheduled' | 'published' | 'unpublishedChanges';

export function entryState(entry: Entry): EntryState {
  if (hasUnpublishedChanges(entry)) return 'unpublishedChanges';
  return entry.status;
}
