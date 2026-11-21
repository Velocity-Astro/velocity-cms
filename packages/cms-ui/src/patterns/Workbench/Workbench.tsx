import type { ReactNode } from 'react';
import { FocusScope } from 'react-aria';
import {
  workbenchBodyVariants,
  workbenchFormVariants,
  workbenchOutlineClass,
  workbenchPaneVariants,
  workbenchVariants,
  type WorkbenchVariants,
} from './Workbench.variants.js';

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
  /** With the whole window, on the left of the pane: the way around it, such as an `Outline` of the page's sections. */
  readonly outline?: ReactNode;
  /** Names the outline's column for screen readers, such as "Sections of the page". */
  readonly outlineLabel?: string;
}

/**
 * A form with what it makes shown large beside it. On a narrow screen the pane follows below.
 * With `view="whole"` the two take the whole window, over the editor's frame: the outline on the
 * left, the pane in the middle, and the form a panel on the right that can be put away. Going from
 * one view to the other keeps both as they are: nothing typed is lost and the pane is not made again.
 */
export function Workbench({ paneLabel, children, pane, bar, isFormAway = false, outline, outlineLabel, view = 'beside' }: WorkbenchProps) {
  const isWhole = view === 'whole';
  const form = <div className={workbenchFormVariants({ view, isAway: isWhole && isFormAway })}>{children}</div>;
  return (
    // With the whole window, the keyboard stays in it: what is behind cannot be seen.
    <FocusScope contain={isWhole}>
      <div className={workbenchVariants({ view })}>
        {isWhole && bar}
        <div className={workbenchBodyVariants({ view })}>
          {isWhole && outline !== undefined && (
            <aside aria-label={outlineLabel} className={workbenchOutlineClass}>
              {outline}
            </aside>
          )}
          {/* The form keeps its place among the children in both views, so it is never made again: whole, it is drawn on the right. */}
          {form}
          <section aria-label={paneLabel} className={workbenchPaneVariants({ view })}>
            {pane}
          </section>
        </div>
      </div>
    </FocusScope>
  );
}
