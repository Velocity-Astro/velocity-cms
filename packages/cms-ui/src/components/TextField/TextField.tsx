import { FieldError, Input, Label, Text, TextField as AriaTextField } from 'react-aria-components';
import { fieldDescriptionClass, fieldErrorClass, fieldHiddenLabelClass, fieldLabelClass, fieldRequiredMarkClass } from '../field.js';
import { inputClass, textFieldVariants, type TextFieldVariants } from './TextField.variants.js';

export interface TextFieldProps extends TextFieldVariants {
  /** Always given. It is read out even when it is not shown. */
  readonly label: string;
  /**
   * Keeps the label for screen readers only. For a row of a `Repeater`, whose own label is in
   * view above the rows; anywhere else a field shows its label.
   */
  readonly isLabelHidden?: boolean;
  /** Help that stays visible under the field. */
  readonly description?: string;
  /** What is wrong and how to fix it. Setting it marks the field invalid. */
  readonly errorMessage?: string;
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onChange?: (value: string) => void;
  readonly name?: string;
  readonly type?: 'text' | 'email' | 'url' | 'password' | 'search' | 'tel';
  readonly placeholder?: string;
  readonly autoComplete?: string;
  readonly isRequired?: boolean;
  readonly isDisabled?: boolean;
  readonly isReadOnly?: boolean;
}

/** One line of text, with its label, help and error. */
export function TextField({
  label,
  isLabelHidden = false,
  description,
  errorMessage,
  value,
  defaultValue,
  onChange,
  name,
  type = 'text',
  placeholder,
  autoComplete,
  isRequired = false,
  isDisabled = false,
  isReadOnly = false,
  width,
}: TextFieldProps) {
  return (
    <AriaTextField
      className={textFieldVariants({ width })}
      type={type}
      isRequired={isRequired}
      isDisabled={isDisabled}
      isReadOnly={isReadOnly}
      isInvalid={errorMessage !== undefined}
      {...(value !== undefined && { value })}
      {...(defaultValue !== undefined && { defaultValue })}
      {...(onChange && { onChange })}
      {...(name !== undefined && { name })}
      {...(autoComplete !== undefined && { autoComplete })}
    >
      <Label className={isLabelHidden ? fieldHiddenLabelClass : fieldLabelClass}>
        {label}
        {isRequired && (
          <span aria-hidden className={fieldRequiredMarkClass}>
            {' *'}
          </span>
        )}
      </Label>
      <Input className={inputClass} {...(placeholder !== undefined && { placeholder })} />
      {description !== undefined && (
        <Text slot="description" className={fieldDescriptionClass}>
          {description}
        </Text>
      )}
      <FieldError className={fieldErrorClass}>{errorMessage}</FieldError>
    </AriaTextField>
  );
}
