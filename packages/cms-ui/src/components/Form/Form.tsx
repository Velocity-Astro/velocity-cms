import type { ReactNode } from 'react';
import { Form as AriaForm } from 'react-aria-components';
import { formVariants, type FormVariants } from './Form.variants.js';

export interface FormProps extends FormVariants {
  /** Called when the form is sent, by its submit button or by Enter in a field. The page does not reload. */
  readonly onSubmit: () => void;
  /** Names the form for screen readers when the page has more than one. */
  readonly label?: string;
  readonly children: ReactNode;
}

/** Fields that are sent together, in a column. */
export function Form({ onSubmit, label, children, gap }: FormProps) {
  return (
    <AriaForm
      className={formVariants({ gap })}
      // The app checks the values and words the errors, so they are in its language and its style.
      validationBehavior="aria"
      {...(label !== undefined && { 'aria-label': label })}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </AriaForm>
  );
}
