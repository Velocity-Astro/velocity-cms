import { liveFields, type CustomFieldsOf, type EntryData, type FieldDef } from '@velocity/cms-core';
import { useState } from 'react';
import { AdminRequestError } from '../client/errors.js';
import { useCustomFields } from '../client/queries.js';
import { FieldEditor } from './FieldEditor.js';

const NO_PROBLEMS: ReadonlyMap<string, string> = new Map();

/** What a form needs to fill in a contact's or a deal's custom fields. */
export interface CustomValues {
  /** The fields there are today, in order. None while they load, or when the site has none. */
  readonly fields: readonly FieldDef[];
  /** What is held, with what was typed since over it. */
  readonly values: EntryData;
  readonly problems: ReadonlyMap<string, string>;
  readonly change: (id: string, value: unknown) => void;
  /** What to send with a save: only the fields that were touched, an emptied one as `null`. Nothing when none were. */
  readonly toSend: () => { data?: Record<string, unknown> };
  /** Puts each problem a refused save named under its field. */
  readonly refused: (error: unknown) => void;
}

/** The site's own fields for a contact or a deal, with what one of them holds and what is being typed. */
export function useCustomValues(of: CustomFieldsOf, held: EntryData | undefined): CustomValues {
  const all = useCustomFields();
  // What was typed since the form opened. What is saved stays the server's.
  const [typed, setTyped] = useState<Record<string, unknown>>({});
  const [problems, setProblems] = useState(NO_PROBLEMS);
  return {
    fields: liveFields(all.data?.[of] ?? []),
    values: { ...held, ...typed },
    problems,
    change: (id, value) => setTyped((before) => ({ ...before, [id]: value })),
    toSend: () => (Object.keys(typed).length === 0 ? {} : { data: Object.fromEntries(Object.entries(typed).map(([id, value]) => [id, value ?? null])) }),
    refused: (error) => {
      const issues = error instanceof AdminRequestError ? error.issues.filter((issue) => issue.path[0] === 'data') : [];
      setProblems(new Map(issues.map((issue) => [issue.path.slice(1).join('.'), issue.message])));
    },
  };
}

/** The controls for a contact's or a deal's custom fields, the same ones an entry's fields use. */
export function CustomValueFields({ custom }: { readonly custom: CustomValues }) {
  return (
    <>
      {custom.fields.map((field) => (
        <FieldEditor key={field.id} field={field} value={custom.values[field.id]} onChange={(value) => custom.change(field.id, value)} path={field.key} problems={custom.problems} />
      ))}
    </>
  );
}
