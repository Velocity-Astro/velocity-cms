import type { FieldDef } from '@velocity-astro/cms-core';
import { Grid, Stack } from '@velocity-astro/cms-ui';
import { useFieldTypes } from '../client/queries.js';
import { useFieldControls } from './field-control.js';
import { FieldEditor } from './FieldEditor.js';

export interface FieldGridProps {
  readonly fields: readonly FieldDef[];
  /** The fields' values, by field id. */
  readonly values: Readonly<Record<string, unknown>>;
  readonly onChange: (field: FieldDef, value: unknown) => void;
  /** Where a field is in the entry, as field keys: `address.city`. */
  readonly pathOf: (field: FieldDef) => string;
  readonly problems: ReadonlyMap<string, string>;
  /** How many small controls share a row. Three, unless the form is in a narrow column. */
  readonly perRow?: 1 | 3;
}


/**
 * A run of fields laid out as a form: small controls that follow each other (numbers, dates,
 * choices) share a row, and everything else takes a row of its own. The order of the fields is
 * kept, so the form reads the way the content type was set up.
 */
export function FieldGrid({ fields, values, onChange, pathOf, problems, perRow = 3 }: FieldGridProps) {
  const controls = useFieldControls();
  const fieldTypes = useFieldTypes();

  const isCompact = (field: FieldDef) => {
    const editor = fieldTypes.data?.find((candidate) => candidate.type === field.type)?.editor;
    return editor !== undefined && controls.has(editor) && controls.get(editor).width === 'compact';
  };
  const rows: FieldDef[][] = [];
  for (const field of fields) {
    const last = rows.at(-1);
    const [first] = last ?? [];
    if (last && first && isCompact(field) && isCompact(first) && last.length < perRow) last.push(field);
    else rows.push([field]);
  }

  const editor = (field: FieldDef) => (
    <FieldEditor
      key={field.id}
      field={field}
      value={values[field.id]}
      onChange={(value) => onChange(field, value)}
      path={pathOf(field)}
      problems={problems}
    />
  );
  return (
    <Stack gap={5}>
      {rows.map((row) => {
        const [first] = row;
        if (!first) return null;
        // A small control alone on its row still takes a third of it, not the whole width.
        return isCompact(first) && perRow > 1 ? (
          <Grid key={first.id} columns={perRow} gap={4}>
            {row.map(editor)}
          </Grid>
        ) : (
          editor(first)
        );
      })}
    </Stack>
  );
}
