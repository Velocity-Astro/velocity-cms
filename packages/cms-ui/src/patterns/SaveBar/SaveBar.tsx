import type { ReactNode } from 'react';
import { saveBarActionsClass, saveBarClass, saveBarStatusClass } from './SaveBar.variants.js';

export interface SaveBarProps {
  /** Names the bar for screen readers, such as "Save and publish". */
  readonly label: string;
  /** Where the entry stands: a `Tag` and a few words, such as "Saved 2 minutes ago". */
  readonly status: ReactNode;
  /** The buttons, main action last. */
  readonly actions: ReactNode;
}

/** The bar that stays at the bottom of an editing screen, with the entry's state and its save buttons. */
export function SaveBar({ label, status, actions }: SaveBarProps) {
  return (
    <div role="region" aria-label={label} className={saveBarClass}>
      <div className={saveBarStatusClass} aria-live="polite">
        {status}
      </div>
      <div className={saveBarActionsClass}>{actions}</div>
    </div>
  );
}
