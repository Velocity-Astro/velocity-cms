import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-aria-components';
import {
  saveBarActionsClass,
  saveBarBackClass,
  saveBarBackIconSize,
  saveBarClass,
  saveBarHeadingClass,
  saveBarStatusClass,
  saveBarTitleClass,
} from './SaveBar.variants.js';

export interface SaveBarBack {
  readonly href: string;
  /** Where it goes, such as "Listings". */
  readonly label: string;
}

export interface SaveBarProps {
  /** Names the bar for screen readers, such as "Save and publish". */
  readonly label: string;
  /** The way back to the list this was opened from. */
  readonly back?: SaveBarBack;
  /** What is being edited. It becomes the page's level 1 heading. */
  readonly title?: string;
  /** Where the entry stands: a `Tag` and a few words, such as "Saved 2 minutes ago". */
  readonly status: ReactNode;
  /** The buttons, main action last. */
  readonly actions: ReactNode;
}

/** The bar that stays at the top of an editing screen: the way back, what is being edited, its state and its save buttons. */
export function SaveBar({ label, back, title, status, actions }: SaveBarProps) {
  return (
    <div role="region" aria-label={label} className={saveBarClass}>
      {back !== undefined && (
        <Link href={back.href} className={saveBarBackClass}>
          <ChevronLeft aria-hidden size={saveBarBackIconSize} />
          {back.label}
        </Link>
      )}
      <div className={saveBarHeadingClass}>
        {title !== undefined && <h1 className={saveBarTitleClass}>{title}</h1>}
        <div className={saveBarStatusClass} aria-live="polite">
          {status}
        </div>
      </div>
      <div className={saveBarActionsClass}>{actions}</div>
    </div>
  );
}
