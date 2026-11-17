import { Check, Minus } from 'lucide-react';
import { Checkbox as AriaCheckbox } from 'react-aria-components';
import { checkboxBoxClass, checkboxClass, checkboxIconSize } from './Checkbox.variants.js';

export interface CheckboxProps {
  /** Always shown, and pressing it ticks the box. */
  readonly label: string;
  readonly isSelected?: boolean;
  readonly defaultSelected?: boolean;
  readonly onChange?: (isSelected: boolean) => void;
  /** Neither on nor off: some, but not all, of the things it stands for are selected. */
  readonly isIndeterminate?: boolean;
  readonly isDisabled?: boolean;
  readonly name?: string;
  readonly value?: string;
}

/** One yes-or-no choice. */
export function Checkbox({
  label,
  isSelected,
  defaultSelected,
  onChange,
  isIndeterminate = false,
  isDisabled = false,
  name,
  value,
}: CheckboxProps) {
  return (
    <AriaCheckbox
      className={checkboxClass}
      isIndeterminate={isIndeterminate}
      isDisabled={isDisabled}
      {...(isSelected !== undefined && { isSelected })}
      {...(defaultSelected !== undefined && { defaultSelected })}
      {...(onChange && { onChange })}
      {...(name !== undefined && { name })}
      {...(value !== undefined && { value })}
    >
      {(state) => (
        <>
          <span className={checkboxBoxClass}>
            {state.isIndeterminate ? (
              <Minus aria-hidden size={checkboxIconSize} />
            ) : (
              state.isSelected && <Check aria-hidden size={checkboxIconSize} />
            )}
          </span>
          {label}
        </>
      )}
    </AriaCheckbox>
  );
}
