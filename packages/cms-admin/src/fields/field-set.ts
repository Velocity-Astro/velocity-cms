import type { FieldDef, NewField } from '@velocity/cms-core';
import type { ReactNode } from 'react';

/** A field as a change sends it: with its id, so it keeps what was filled in under it. */
export type FieldInput = NewField & { readonly id?: string };

export function toInput(field: FieldDef): FieldInput {
  return {
    id: field.id,
    key: field.key,
    type: field.type,
    label: field.label,
    ...(field.help !== undefined && { help: field.help }),
    required: field.required,
    options: field.options,
  };
}

/** The list with one field moved one place up or down. */
export function movedBy(fields: readonly FieldInput[], id: string, by: -1 | 1): FieldInput[] {
  const from = fields.findIndex((field) => field.id === id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= fields.length) return [...fields];
  const next = [...fields];
  const [field] = next.splice(from, 1);
  if (field) next.splice(to, 0, field);
  return next;
}

/** What happens once a save of the whole list has been answered. */
export interface FieldSaveHandlers {
  readonly onSuccess?: () => void;
  readonly onError?: (error: unknown) => void;
  readonly onSettled?: () => void;
}

/**
 * A list of simple fields someone edits as a whole: a form's, or the ones a site adds to its
 * contacts or deals. Whatever it belongs to says how it is saved and in which words.
 */
export interface FieldSet {
  /** What the fields belong to, for the table's name: a form's name, "Contacts". */
  readonly name: string;
  /** The fields it has now, in order, removed ones left out. */
  readonly fields: readonly FieldDef[];
  readonly isPending: boolean;
  /** Saves every field the set is to have, in order. */
  readonly save: (fields: readonly FieldInput[], handlers: FieldSaveHandlers) => void;
  /** Whether a field can be one that must be filled in. */
  readonly canRequire: boolean;
  /** Marks beside a field in the list, such as what a form's field holds. */
  readonly tagsOf?: (field: FieldDef) => ReactNode;
  readonly words: {
    readonly emptyDescription: string;
    /** Under the field's name in the window it is added in. */
    readonly nameHelp: string;
    readonly removeDescription: string;
  };
}
