import type { ReactNode } from 'react';
import { inlineVariants, type InlineVariants } from './Inline.variants.js';

export interface InlineProps extends InlineVariants {
  readonly as?: 'div' | 'ul' | 'ol';
  readonly children?: ReactNode;
}

/** Children in a row, with the same gap between each. */
export function Inline({ as: Element = 'div', children, ...variants }: InlineProps) {
  return <Element className={inlineVariants(variants)}>{children}</Element>;
}
