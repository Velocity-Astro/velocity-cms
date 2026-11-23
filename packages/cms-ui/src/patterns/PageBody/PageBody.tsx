import type { ReactNode } from 'react';
import { pageBodyClass, pageBodyInnerVariants } from './PageBody.variants.js';

export interface PageBodyProps {
  /** `wide` (the default) for lists, tables, boards and dashboards; `narrow` for settings and other forms read top to bottom. */
  readonly width?: 'wide' | 'narrow';
  /** Set when the area sits inside another that already has the gutter, such as a tab of a screen. */
  readonly isInset?: boolean;
  readonly children: ReactNode;
}

/**
 * A screen's own area, below its bar: the screen's gutter and its content centred in one of two
 * widths. Every screen draws its content in one, so screens line up with each other on any window.
 */
export function PageBody({ width = 'wide', isInset = false, children }: PageBodyProps) {
  const inner = <div className={pageBodyInnerVariants({ width })}>{children}</div>;
  return isInset ? inner : <div className={pageBodyClass}>{inner}</div>;
}
