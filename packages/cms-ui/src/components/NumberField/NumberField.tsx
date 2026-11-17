import { FieldError, Input, Label, NumberField as AriaNumberField, Text } from 'react-aria-components';
import { fieldDescriptionClass, fieldErrorClass, fieldLabelClass, fieldRequiredMarkClass } from '../field.js';
import { numberFieldVariants, numberInputClass, type NumberFieldVariants } from './NumberField.variants.js';

export interface NumberFieldProps extends NumberFieldVariants {
  /** Always shown. */
  readonly label: string;
  /** Help that stays visible under the field. */
  readonly description?: string;
  /** What is wrong and how to fix it. Setting it marks the field invalid. */
  readonly errorMessage?: string;
  /** The number, or `null` when the field is empty. */
  readonly value?: number | null;
  readonly defaultValue?: number;
  /** Called when the person leaves the field or presses Enter, with `null` when it is empty. */
  readonly onChange?: (value: number | null) => void;
  readonly minValue?: number;
  readonly maxValue?: number;
  /** Whole numbers only. */
  readonly isInteger?: boolean;
  readonly name?: string;
  readonly isRequired?: boolean;
  readonly isDisabled?: boolean;
  readonly isReadOnly?: boolean;
}

/** A number, written in the person's own format, with its label, help and error. */
export function NumberField({
  label,
  description,
  errorMessage,
  value,
  defaultValue,
  onChange,
  minValue,
  maxValue,
  isInteger = false,
  name,
  isRequired = false,
  isDisabled = false,
  isReadOnly = false,
  width,
}: NumberFieldProps) {
  return (
    <AriaNumberField
      className={numberFieldVariants({ width })}
      isRequired={isRequired}
      isDisabled={isDisabled}
      isReadOnly={isReadOnly}
      isInvalid={errorMessage !== undefined}
      formatOptions={isInteger ? { maximumFractionDigits: 0 } : { maximumFractionDigits: 6 }}
      {...(value !== undefined && { value: value ?? Number.NaN })}
      {...(defaultValue !== undefined && { defaultValue })}
      {...(onChange && { onChange: (next) => onChange(Number.isNaN(next) ? null : next) })}
      {...(minValue !== undefined && { minValue })}
      {...(maxValue !== undefined && { maxValue })}
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
      <Input className={numberInputClass} />
      {description !== undefined && (
        <Text slot="description" className={fieldDescriptionClass}>
          {description}
        </Text>
      )}
      <FieldError className={fieldErrorClass}>{errorMessage}</FieldError>
    </AriaNumberField>
  );
}
