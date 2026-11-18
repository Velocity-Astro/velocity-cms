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
import { fieldDescriptionClass, fieldErrorClass, fieldHiddenLabelClass, fieldLabelClass, fieldRequiredMarkClass } from '../field.js';
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
  /** Always given. It is read out even when it is not shown. */
  readonly label: string;
  /**
   * Keeps the label for screen readers only. For a row of a `Repeater`, whose own label is in
   * view above the rows; anywhere else a field shows its label.
   */
  readonly isLabelHidden?: boolean;
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
  isLabelHidden = false,
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
      <Label className={isLabelHidden ? fieldHiddenLabelClass : fieldLabelClass}>
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
