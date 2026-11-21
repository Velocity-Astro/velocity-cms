import type { LucideIcon } from 'lucide-react';
import { ToggleButton, ToggleButtonGroup } from 'react-aria-components';
import { Tooltip } from '../Tooltip/index.js';
import {
  segmentedClass,
  segmentedDescriptionClass,
  segmentedErrorClass,
  segmentedFieldClass,
  segmentedHiddenLabelClass,
  segmentedIconSize,
  segmentedLabelClass,
  segmentedOptionVariants,
  segmentedSwatchClass,
} from './Segmented.variants.js';

export interface SegmentedOption {
  readonly id: string;
  readonly label: string;
  readonly isDisabled?: boolean;
  /** A colour to show beside the label, where the choice is a colour of the site's, as CSS writes one. A sample only. */
  readonly swatch?: string;
  /** An icon before the label. With `areLabelsHidden`, the icon alone. */
  readonly icon?: LucideIcon;
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
  /** Shows each choice as its icon alone, where every choice has one: its words are read out and shown in a tooltip. */
  readonly areLabelsHidden?: boolean;
}

/** A few choices in a row, one of them always chosen: a filter over a list, or a language. */
export function Segmented({ label, options, selected, onChange, isLabelShown = false, description, errorMessage, areLabelsHidden = false }: SegmentedProps) {
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
      {options.map((option) => {
        const Icon = option.icon;
        const isIconOnly = areLabelsHidden && Icon !== undefined;
        const button = (
          <ToggleButton key={option.id} id={option.id} className={segmentedOptionVariants({ isIconOnly })} isDisabled={option.isDisabled ?? false}>
            {option.swatch !== undefined && (
              <svg aria-hidden="true" viewBox="0 0 16 16" className={segmentedSwatchClass}>
                <circle cx="8" cy="8" r="7" fill={option.swatch} />
              </svg>
            )}
            {Icon && <Icon aria-hidden size={segmentedIconSize} />}
            {isIconOnly ? <span className={segmentedHiddenLabelClass}>{option.label}</span> : option.label}
          </ToggleButton>
        );
        return isIconOnly ? (
          <Tooltip key={option.id} content={option.label} placement="bottom">
            {button}
          </Tooltip>
        ) : (
          button
        );
      })}
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
