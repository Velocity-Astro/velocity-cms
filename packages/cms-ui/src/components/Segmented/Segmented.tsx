import { ToggleButton, ToggleButtonGroup } from 'react-aria-components';
import { segmentedClass, segmentedDescriptionClass, segmentedErrorClass, segmentedFieldClass, segmentedLabelClass, segmentedOptionClass, segmentedSwatchClass } from './Segmented.variants.js';

export interface SegmentedOption {
  readonly id: string;
  readonly label: string;
  readonly isDisabled?: boolean;
  /** A colour to show beside the label, where the choice is a colour of the site's, as CSS writes one. A sample only. */
  readonly swatch?: string;
}

export interface SegmentedProps {
  /** What is being chosen, for screen readers, such as "Show" or "Language". */
  readonly label: string;
  readonly options: readonly SegmentedOption[];
  /** The id of the option chosen. One always is. */
  readonly selected: string;
  readonly onChange: (id: string) => void;
  /** Shows the label above the choices, as a field of a form has it. */
  readonly isLabelShown?: boolean;
  /** Help under the choices, for a field of a form. */
  readonly description?: string;
  /** What is wrong with the choice, shown in place of the help. */
  readonly errorMessage?: string;
}

/** A few choices in a row, one of them always chosen: a filter over a list, or a language. */
export function Segmented({ label, options, selected, onChange, isLabelShown = false, description, errorMessage }: SegmentedProps) {
  const group = (
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
          {option.swatch !== undefined && (
            <svg aria-hidden="true" viewBox="0 0 16 16" className={segmentedSwatchClass}>
              <circle cx="8" cy="8" r="7" fill={option.swatch} />
            </svg>
          )}
          {option.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
  if (!isLabelShown && description === undefined && errorMessage === undefined) return group;
  return (
    <div className={segmentedFieldClass}>
      {isLabelShown && (
        <span aria-hidden="true" className={segmentedLabelClass}>
          {label}
        </span>
      )}
      {group}
      {errorMessage !== undefined ? <p className={segmentedErrorClass}>{errorMessage}</p> : description !== undefined && <p className={segmentedDescriptionClass}>{description}</p>}
    </div>
  );
}
