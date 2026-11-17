import type { ReactNode } from 'react';
import { gridVariants, type GridVariants } from './Grid.variants.js';

export interface GridProps extends GridVariants {
  /** `ul` and `ol` expect `li` children. */
  readonly as?: 'div' | 'ul' | 'ol';
  readonly children?: ReactNode;
}

/** Children in equal columns, with the same gap between each. */
export function Grid({ as: Element = 'div', children, ...variants }: GridProps) {
  return <Element className={gridVariants(variants)}>{children}</Element>;
}
