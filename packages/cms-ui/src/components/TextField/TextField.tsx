import { FieldError, Input, Label, Text, TextField as AriaTextField } from 'react-aria-components';
import {
  descriptionClass,
  errorClass,
  inputClass,
  labelClass,
  requiredMarkClass,
  textFieldVariants,
  type TextFieldVariants,
} from './TextField.variants.js';

export interface TextFieldProps extends TextFieldVariants {
  /** Always shown. A field with no visible label is not allowed. */
  readonly label: string;
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
      <Label className={labelClass}>
        {label}
        {isRequired && (
          <span aria-hidden className={requiredMarkClass}>
            {' *'}
          </span>
        )}
      </Label>
      <Input className={inputClass} {...(placeholder !== undefined && { placeholder })} />
      {description !== undefined && (
        <Text slot="description" className={descriptionClass}>
          {description}
        </Text>
      )}
      <FieldError className={errorClass}>{errorMessage}</FieldError>
    </AriaTextField>
  );
}
