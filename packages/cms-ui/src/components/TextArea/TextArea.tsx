import { FieldError, Label, Text, TextArea as AriaTextArea, TextField as AriaTextField } from 'react-aria-components';
import { fieldDescriptionClass, fieldErrorClass, fieldLabelClass, fieldRequiredMarkClass } from '../field.js';
import { textAreaDefaultRows, textAreaInputClass, textAreaVariants, type TextAreaVariants } from './TextArea.variants.js';

export interface TextAreaProps extends TextAreaVariants {
  /** Always shown. */
  readonly label: string;
  /** Help that stays visible under the field. */
  readonly description?: string;
  /** What is wrong and how to fix it. Setting it marks the field invalid. */
  readonly errorMessage?: string;
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onChange?: (value: string) => void;
  readonly name?: string;
  readonly placeholder?: string;
  /** How many lines tall the box starts. A person can drag it taller. */
  readonly rows?: number;
  readonly isRequired?: boolean;
  readonly isDisabled?: boolean;
  readonly isReadOnly?: boolean;
}

/** Several lines of plain text, with its label, help and error. */
export function TextArea({
  label,
  description,
  errorMessage,
  value,
  defaultValue,
  onChange,
  name,
  placeholder,
  rows = textAreaDefaultRows,
  isRequired = false,
  isDisabled = false,
  isReadOnly = false,
  width,
}: TextAreaProps) {
  return (
    <AriaTextField
      className={textAreaVariants({ width })}
      isRequired={isRequired}
      isDisabled={isDisabled}
      isReadOnly={isReadOnly}
      isInvalid={errorMessage !== undefined}
      {...(value !== undefined && { value })}
      {...(defaultValue !== undefined && { defaultValue })}
      {...(onChange && { onChange })}
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
      <AriaTextArea className={textAreaInputClass} rows={rows} {...(placeholder !== undefined && { placeholder })} />
      {description !== undefined && (
        <Text slot="description" className={fieldDescriptionClass}>
          {description}
        </Text>
      )}
      <FieldError className={fieldErrorClass}>{errorMessage}</FieldError>
    </AriaTextField>
  );
}
