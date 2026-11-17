import type { ReactNode } from 'react';
import { stackVariants, type StackVariants } from './Stack.variants.js';

export interface StackProps extends StackVariants {
  /** `ul` and `ol` expect `li` children; `form` is for a form's fields. */
  readonly as?: 'div' | 'section' | 'ul' | 'ol' | 'form';
  readonly children?: ReactNode;
}

/** Children in a column, with the same gap between each. */
export function Stack({ as: Element = 'div', children, ...variants }: StackProps) {
  return <Element className={stackVariants(variants)}>{children}</Element>;
}
