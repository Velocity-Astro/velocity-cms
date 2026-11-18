import { liveFields, type ContentTypeDef, type FieldArrangement, type FieldDef } from '@velocity/cms-core';

/** The key of the place for fields that no section shows. */
export const NO_SECTION = '';

/** Some of a type's fields, shown together: a section, or the fields in none. */
export interface FieldPlace {
  /** The section's key, or `NO_SECTION`. */
  readonly key: string;
  readonly fields: readonly FieldDef[];
}

/** A type's live fields in the order the editor shows them: each section's, then the rest. */
export function placesOf(type: ContentTypeDef): FieldPlace[] {
  const live = new Map(liveFields(type.fields).map((field) => [field.id, field]));
  const sections = (type.sections ?? []).map((section) => ({
    key: section.key,
    fields: section.fieldIds.flatMap((id) => live.get(id) ?? []),
  }));
  const shown = new Set(sections.flatMap((section) => section.fields.map((field) => field.id)));
  return [...sections, { key: NO_SECTION, fields: [...live.values()].filter((field) => !shown.has(field.id)) }];
}

/** The section that shows a field, or `NO_SECTION`. */
export function placeOf(type: ContentTypeDef, fieldId: string): string {
  return type.sections?.find((section) => section.fieldIds.includes(fieldId))?.key ?? NO_SECTION;
}

function arrangementOf(places: readonly { key: string; ids: readonly string[] }[]): FieldArrangement {
  return {
    order: places.flatMap((place) => place.ids),
    sections: Object.fromEntries(places.filter((place) => place.key !== NO_SECTION).map((place) => [place.key, place.ids])),
  };
}

/** The arrangement with one field a step earlier (`-1`) or later (`1`) among the fields it is shown with. */
export function moved(type: ContentTypeDef, fieldId: string, by: -1 | 1): FieldArrangement {
  return arrangementOf(
    placesOf(type).map((place) => {
      const ids = place.fields.map((field) => field.id);
      const from = ids.indexOf(fieldId);
      const to = from + by;
      if (from === -1 || to < 0 || to >= ids.length) return { key: place.key, ids };
      ids.splice(to, 0, ...ids.splice(from, 1));
      return { key: place.key, ids };
    }),
  );
}

/** The arrangement with one field at the end of another section, or of the fields in none. */
export function placed(type: ContentTypeDef, fieldId: string, key: string): FieldArrangement {
  return arrangementOf(
    placesOf(type).map((place) => {
      const ids = place.fields.map((field) => field.id).filter((id) => id !== fieldId);
      return { key: place.key, ids: place.key === key ? [...ids, fieldId] : ids };
    }),
  );
}
