import { Check, ChevronDown } from 'lucide-react';
import {
  Button as AriaButton,
  FieldError,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Select as AriaSelect,
  SelectValue,
  Text,
} from 'react-aria-components';
import { fieldDescriptionClass, fieldErrorClass, fieldLabelClass, fieldRequiredMarkClass } from '../field.js';
import {
  selectChevronClass,
  selectIconSize,
  selectListClass,
  selectOptionClass,
  selectPopoverClass,
  selectTickClass,
  selectTriggerClass,
  selectValueClass,
  selectVariants,
  type SelectVariants,
} from './Select.variants.js';

export interface SelectOption {
  readonly id: string;
  readonly label: string;
}

export interface SelectProps extends SelectVariants {
  /** Always shown. */
  readonly label: string;
  readonly options: readonly SelectOption[];
  /** The id of the chosen option. */
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onChange?: (id: string) => void;
  /** Shown when nothing is chosen, such as "Choose a status". */
  readonly placeholder?: string;
  /** Help that stays visible under the field. */
  readonly description?: string;
  /** What is wrong and how to fix it. Setting it marks the field invalid. */
  readonly errorMessage?: string;
  readonly isRequired?: boolean;
  readonly isDisabled?: boolean;
  readonly name?: string;
}

/** One choice from a list, with its label, help and error. */
export function Select({
  label,
  options,
  value,
  defaultValue,
  onChange,
  placeholder,
  description,
  errorMessage,
  isRequired = false,
  isDisabled = false,
  name,
  width,
}: SelectProps) {
  return (
    <AriaSelect
      className={selectVariants({ width })}
      isRequired={isRequired}
      isDisabled={isDisabled}
      isInvalid={errorMessage !== undefined}
      {...(value !== undefined && { value })}
      {...(defaultValue !== undefined && { defaultValue })}
      {...(onChange && { onChange: (key) => key !== null && onChange(String(key)) })}
      {...(placeholder !== undefined && { placeholder })}
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
      <AriaButton className={selectTriggerClass}>
        <SelectValue className={selectValueClass} />
        <ChevronDown aria-hidden size={selectIconSize} className={selectChevronClass} />
      </AriaButton>
      {description !== undefined && (
        <Text slot="description" className={fieldDescriptionClass}>
          {description}
        </Text>
      )}
      <FieldError className={fieldErrorClass}>{errorMessage}</FieldError>
      <Popover className={selectPopoverClass}>
        <ListBox className={selectListClass}>
          {options.map((option) => (
            <ListBoxItem key={option.id} id={option.id} className={selectOptionClass} textValue={option.label}>
              {(state) => (
                <>
                  {option.label}
                  {state.isSelected && <Check aria-hidden size={selectIconSize} className={selectTickClass} />}
                </>
              )}
            </ListBoxItem>
          ))}
        </ListBox>
      </Popover>
    </AriaSelect>
  );
}
