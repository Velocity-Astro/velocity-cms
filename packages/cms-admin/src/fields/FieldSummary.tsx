import { Text } from '@velocity/cms-ui';
import { useFieldTypes } from '../client/queries.js';
import { useFieldControls, type FieldControl, type FieldSummaryProps } from './field-control.js';

/** Finds the control a field type asks for, if the editor has it. */
export function useControlFor(): (type: string) => FieldControl | undefined {
  const controls = useFieldControls();
  const fieldTypes = useFieldTypes();
  return (type) => {
    const editor = fieldTypes.data?.find((candidate) => candidate.type === type)?.editor;
    return editor !== undefined && controls.has(editor) ? controls.get(editor) : undefined;
  };
}

/**
 * One value of a field as a list of entries shows it: the way its control says, or as it is
 * stored when that is text or a number. Anything else is left out.
 */
export function FieldSummary({ field, value }: FieldSummaryProps) {
  const control = useControlFor()(field.type);
  if (value === undefined || value === null || value === '') return null;
  if (control?.Summary) return <control.Summary field={field} value={value} />;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  return <Text size="sm">{String(value)}</Text>;
}
