import type { ReactNode } from 'react';
import { splitAsideClass, splitClass, splitMainClass } from './Split.variants.js';

export interface SplitProps {
  /** Names the side column for screen readers, such as "Publishing". */
  readonly asideLabel: string;
  /** What the screen is for: the wide column. */
  readonly children: ReactNode;
  /** What goes with it: the narrow column, which stays in view on a wide screen. */
  readonly aside: ReactNode;
}

/** A wide column with a narrow one beside it. On a narrow screen the narrow one follows below. */
export function Split({ asideLabel, children, aside }: SplitProps) {
  return (
    <div className={splitClass}>
      <div className={splitMainClass}>{children}</div>
      <aside aria-label={asideLabel} className={splitAsideClass}>
        {aside}
      </aside>
    </div>
  );
}
