import type { ReactNode } from 'react';
import { FocusScope } from 'react-aria';
import { workbenchBodyVariants, workbenchFormVariants, workbenchPaneVariants, workbenchVariants, type WorkbenchVariants } from './Workbench.variants.js';

export interface WorkbenchProps extends WorkbenchVariants {
  /** Names the pane for screen readers, such as "The page". */
  readonly paneLabel: string;
  /** What is worked on: the form, in a column of its own. */
  readonly children: ReactNode;
  /** What the work makes, shown large beside it and kept in view: the page. */
  readonly pane: ReactNode;
  /** Across the top when the workbench has the whole window: what is edited, the way back and the save buttons. */
  readonly bar?: ReactNode;
  /** With the whole window, whether the form is put away at the side so the pane has it all. */
  readonly isFormAway?: boolean;
}

/**
 * A form with what it makes shown large beside it. On a narrow screen the pane follows below.
 * With `view="whole"` the two take the whole window, over the editor's frame, and the form is a
 * panel at the side that can be put away. Going from one view to the other keeps both as they
 * are: nothing typed is lost and the pane is not made again.
 */
export function Workbench({ paneLabel, children, pane, bar, isFormAway = false, view = 'beside' }: WorkbenchProps) {
  const isWhole = view === 'whole';
  return (
    // With the whole window, the keyboard stays in it: what is behind cannot be seen.
    <FocusScope contain={isWhole}>
      <div className={workbenchVariants({ view })}>
        {isWhole && bar}
        <div className={workbenchBodyVariants({ view })}>
          <div className={workbenchFormVariants({ view, isAway: isWhole && isFormAway })}>{children}</div>
          <section aria-label={paneLabel} className={workbenchPaneVariants({ view })}>
            {pane}
          </section>
        </div>
      </div>
    </FocusScope>
  );
}
