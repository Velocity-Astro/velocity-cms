import type { ReactNode } from 'react';
import { workbenchClass, workbenchFormClass, workbenchPaneClass } from './Workbench.variants.js';

export interface WorkbenchProps {
  /** Names the pane for screen readers, such as "The page". */
  readonly paneLabel: string;
  /** What is worked on: the form, in a column of its own. */
  readonly children: ReactNode;
  /** What the work makes, shown large beside it and kept in view: the page. */
  readonly pane: ReactNode;
}

/** A form with what it makes shown large beside it. On a narrow screen the pane follows below. */
export function Workbench({ paneLabel, children, pane }: WorkbenchProps) {
  return (
    <div className={workbenchClass}>
      <div className={workbenchFormClass}>{children}</div>
      <section aria-label={paneLabel} className={workbenchPaneClass}>
        {pane}
      </section>
    </div>
  );
}
