import type { ReactNode } from 'react';
import { textVariants, type TextVariants } from './Text.variants.js';

export interface TextProps extends TextVariants {
  /** `p` for a paragraph, `span` inside other text, `div` when it holds more than words. */
  readonly as?: 'p' | 'span' | 'div';
  readonly children?: ReactNode;
}

/** Body text in one of the editor's sizes, tones and weights. */
export function Text({ as: Element = 'p', children, ...variants }: TextProps) {
  return <Element className={textVariants(variants)}>{children}</Element>;
}
