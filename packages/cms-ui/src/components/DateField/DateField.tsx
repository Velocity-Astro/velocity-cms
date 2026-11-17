import { parseDate } from '@internationalized/date';
import { DateField as AriaDateField, DateInput, DateSegment, FieldError, Label, Text } from 'react-aria-components';
import { fieldDescriptionClass, fieldErrorClass, fieldLabelClass, fieldRequiredMarkClass } from '../field.js';
import { dateFieldVariants, dateInputClass, dateSegmentClass, type DateFieldVariants } from './DateField.variants.js';

export interface DateFieldProps extends DateFieldVariants {
  /** Always shown. */
  readonly label: string;
  /** Help that stays visible under the field. */
  readonly description?: string;
  /** What is wrong and how to fix it. Setting it marks the field invalid. */
  readonly errorMessage?: string;
  /** The date as `YYYY-MM-DD`, or `null` when the field is empty. */
  readonly value?: string | null;
  readonly defaultValue?: string;
  /** Called with `YYYY-MM-DD` once the day, month and year are all filled in, and with `null` when cleared. */
  readonly onChange?: (value: string | null) => void;
  readonly name?: string;
  readonly isRequired?: boolean;
  readonly isDisabled?: boolean;
  readonly isReadOnly?: boolean;
}

/** `YYYY-MM-DD` as a calendar date, or `null` for anything that is not one. */
function toCalendarDate(value: string | null) {
  if (value === null) return null;
  try {
    return parseDate(value);
  } catch {
    return null;
  }
}

/** A calendar date, typed in the order the person's language writes it. */
export function DateField({
  label,
  description,
  errorMessage,
  value,
  defaultValue,
  onChange,
  name,
  isRequired = false,
  isDisabled = false,
  isReadOnly = false,
  width,
}: DateFieldProps) {
  const initial = defaultValue === undefined ? null : toCalendarDate(defaultValue);
  return (
    <AriaDateField
      className={dateFieldVariants({ width })}
      isRequired={isRequired}
      isDisabled={isDisabled}
      isReadOnly={isReadOnly}
      isInvalid={errorMessage !== undefined}
      {...(value !== undefined && { value: toCalendarDate(value) })}
      {...(initial && { defaultValue: initial })}
      {...(onChange && { onChange: (next) => onChange(next ? next.toString() : null) })}
      {...(name !== undefined && { name })}
    >
      <Label className={fieldLabelClass}>
        {label}
        {isRequired && (
          <span aria-hidden className={fieldRequiredMarkClass}>
            {' *'}
          </span>
        )}
      </Label>
      <DateInput className={dateInputClass}>{(segment) => <DateSegment segment={segment} className={dateSegmentClass} />}</DateInput>
      {description !== undefined && (
        <Text slot="description" className={fieldDescriptionClass}>
          {description}
        </Text>
      )}
      <FieldError className={fieldErrorClass}>{errorMessage}</FieldError>
    </AriaDateField>
  );
}
