import type { ReactNode } from 'react';
import { headingVariants, sizeForLevel, type HeadingVariants } from './Heading.variants.js';

export interface HeadingProps extends HeadingVariants {
  /** Where the heading sits in the page outline. One level 1 per screen, and no skipped levels. */
  readonly level: 1 | 2 | 3 | 4;
  readonly children?: ReactNode;
}

const ELEMENTS = { 1: 'h1', 2: 'h2', 3: 'h3', 4: 'h4' } as const;

/** A title. `level` sets its place in the outline; `size` changes only how big it looks. */
export function Heading({ level, size, truncate, children }: HeadingProps) {
  const Element = ELEMENTS[level];
  return <Element className={headingVariants({ size: size ?? sizeForLevel[level], truncate })}>{children}</Element>;
}
