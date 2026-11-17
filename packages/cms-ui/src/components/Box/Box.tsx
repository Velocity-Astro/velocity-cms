import type { ReactNode } from 'react';
import { boxVariants, type BoxVariants } from './Box.variants.js';

export interface BoxProps extends BoxVariants {
  /** The element to render. A landmark such as `main` or `aside` should be used once per screen. */
  readonly as?: 'div' | 'section' | 'main' | 'aside' | 'header' | 'footer' | 'nav';
  /** Required when `as` is a landmark that appears more than once, such as two `nav`s. */
  readonly label?: string;
  readonly children?: ReactNode;
}

/** A surface: padding, background, border, radius and shadow, each from the tokens. */
export function Box({ as: Element = 'div', label, children, ...variants }: BoxProps) {
  return (
    <Element className={boxVariants(variants)} aria-label={label}>
      {children}
    </Element>
  );
}
