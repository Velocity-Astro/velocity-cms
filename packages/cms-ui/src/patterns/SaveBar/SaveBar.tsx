import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button, Link } from 'react-aria-components';
import {
  saveBarActionsClass,
  saveBarBackClass,
  saveBarBackIconSize,
  saveBarHeadingClass,
  saveBarStatusClass,
  saveBarTitleClass,
  saveBarVariants,
} from './SaveBar.variants.js';

export interface SaveBarBack {
  /** Where it goes. Left out, `onPress` says what going back does. */
  readonly href?: string;
  /** What going back does, where it is not another address: closing a view that took the window. */
  readonly onPress?: () => void;
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
  /** `window` for a bar across a whole window, in place of one at the top of a screen. */
  readonly across?: 'screen' | 'window';
}

/** The bar that stays at the top of an editing screen: the way back, what is being edited, its state and its save buttons. */
export function SaveBar({ label, back, title, status, actions, across = 'screen' }: SaveBarProps) {
  return (
    <div role="region" aria-label={label} className={saveBarVariants({ across })}>
      {back?.href !== undefined && (
        <Link href={back.href} className={saveBarBackClass}>
          <ChevronLeft aria-hidden size={saveBarBackIconSize} />
          {back.label}
        </Link>
      )}
      {back !== undefined && back.href === undefined && (
        <Button className={saveBarBackClass} {...(back.onPress && { onPress: back.onPress })}>
          <ChevronLeft aria-hidden size={saveBarBackIconSize} />
          {back.label}
        </Button>
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
