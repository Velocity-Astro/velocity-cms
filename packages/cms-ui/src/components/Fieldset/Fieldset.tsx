import type { ReactNode } from 'react';
import { fieldsetDescriptionClass, fieldsetLegendVariants, fieldsetVariants } from './Fieldset.variants.js';

export interface FieldsetProps {
  /** What the fields inside have in common, such as "Address". Read out before each of them. */
  readonly legend: string;
  /** Help for the whole set. */
  readonly description?: string;
  /**
   * Set where the name is already in view just above, such as the heading of a row that opens.
   * The legend is still read out, and the set is drawn without its frame.
   */
  readonly isLegendHidden?: boolean;
  /** The fields. */
  readonly children?: ReactNode;
}

/** Several fields that belong together, under one name. */
export function Fieldset({ legend, description, isLegendHidden = false, children }: FieldsetProps) {
  return (
    <fieldset className={fieldsetVariants({ frame: isLegendHidden ? 'none' : 'box' })}>
      <legend className={fieldsetLegendVariants({ hidden: isLegendHidden })}>{legend}</legend>
      {description !== undefined && <p className={fieldsetDescriptionClass}>{description}</p>}
      {children}
    </fieldset>
  );
}
