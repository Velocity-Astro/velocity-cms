import type { ReactNode } from 'react';
import { fieldsetClass, fieldsetDescriptionClass, fieldsetLegendClass } from './Fieldset.variants.js';

export interface FieldsetProps {
  /** What the fields inside have in common, such as "Address". Read out before each of them. */
  readonly legend: string;
  /** Help for the whole set. */
  readonly description?: string;
  /** The fields. */
  readonly children?: ReactNode;
}

/** Several fields that belong together, under one name. */
export function Fieldset({ legend, description, children }: FieldsetProps) {
  return (
    <fieldset className={fieldsetClass}>
      <legend className={fieldsetLegendClass}>{legend}</legend>
      {description !== undefined && <p className={fieldsetDescriptionClass}>{description}</p>}
      {children}
    </fieldset>
  );
}
