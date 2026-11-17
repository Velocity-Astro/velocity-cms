import { ToggleButton, ToggleButtonGroup } from 'react-aria-components';
import { segmentedClass, segmentedOptionClass } from './Segmented.variants.js';

export interface SegmentedOption {
  readonly id: string;
  readonly label: string;
  readonly isDisabled?: boolean;
}

export interface SegmentedProps {
  /** What is being chosen, for screen readers, such as "Show" or "Language". */
  readonly label: string;
  readonly options: readonly SegmentedOption[];
  /** The id of the option chosen. One always is. */
  readonly selected: string;
  readonly onChange: (id: string) => void;
}

/** A few choices in a row, one of them always chosen: a filter over a list, or a language. */
export function Segmented({ label, options, selected, onChange }: SegmentedProps) {
  return (
    <ToggleButtonGroup
      aria-label={label}
      className={segmentedClass}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[selected]}
      onSelectionChange={(keys) => {
        const [next] = keys;
        if (next !== undefined && String(next) !== selected) onChange(String(next));
      }}
    >
      {options.map((option) => (
        <ToggleButton key={option.id} id={option.id} className={segmentedOptionClass} isDisabled={option.isDisabled ?? false}>
          {option.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
