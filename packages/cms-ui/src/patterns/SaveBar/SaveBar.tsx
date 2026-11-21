import { ChevronLeft } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button, Link } from 'react-aria-components';
import {
  saveBarActionsClass,
  saveBarBackClass,
  saveBarBackLabelClass,
  saveBarBackIconSize,
  saveBarCenterClass,
  saveBarHeadingVariants,
  saveBarNoteClass,
  saveBarStatusClass,
  saveBarTitleClass,
  saveBarVariants,
} from './SaveBar.variants.js';
import { usePageBar, usePageBarBack } from '../page-bar.js';

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
  /** Where the entry stands, such as a `Tag` saying Draft. Beside the title, on its one row. */
  readonly status: ReactNode;
  /**
   * A few words more about it, such as "Saved 2 minutes ago", after the status. Shown from `lg` up, where the
   * row has room for them; read out on every window, with the status.
   */
  readonly note?: ReactNode;
  /** The buttons, main action last. */
  readonly actions: ReactNode;
  /** In the middle of the bar, from `md` up: controls for what is shown, such as the widths of a page. */
  readonly center?: ReactNode;
  /**
   * `screen` for the bar of an editing screen, drawn in the shell's bar inside `AppShell`. `section` for a
   * form inside a screen that has its own header, where it stays at the top of that part. `window` for a
   * bar across a whole window.
   */
  readonly across?: 'screen' | 'section' | 'window';
}

/** The bar that stays at the top of an editing screen: the way back, what is being edited, its state and its save buttons. */
export function SaveBar({ label, back, title, status, note, actions, center, across = 'screen' }: SaveBarProps) {
  const shellBar = usePageBar();
  const inShell = across === 'screen' && shellBar !== undefined;
  // A bar that leads back has the way back where a phone shows the menu: the shell leaves its menu and search out there.
  const leadsBack = usePageBarBack();
  const isLeadingBack = inShell && back !== undefined;
  useEffect(() => {
    if (!isLeadingBack || leadsBack === undefined) return;
    leadsBack(true);
    return () => leadsBack(false);
  }, [isLeadingBack, leadsBack]);
  // The shell is still drawing its bar: this one comes once there is a place for it.
  if (inShell && shellBar === null) return null;
  const bar = (
    <div role="region" aria-label={label} className={saveBarVariants({ across: inShell ? 'shell' : across })}>
      {back?.href !== undefined && (
        <Link href={back.href} className={saveBarBackClass}>
          <ChevronLeft aria-hidden size={saveBarBackIconSize} />
          <span className={saveBarBackLabelClass}>{back.label}</span>
        </Link>
      )}
      {back !== undefined && back.href === undefined && (
        <Button className={saveBarBackClass} {...(back.onPress && { onPress: back.onPress })}>
          <ChevronLeft aria-hidden size={saveBarBackIconSize} />
          <span className={saveBarBackLabelClass}>{back.label}</span>
        </Button>
      )}
      <div className={saveBarHeadingVariants({ hasCenter: center !== undefined })}>
        {title !== undefined && <h1 className={saveBarTitleClass}>{title}</h1>}
        <div className={saveBarStatusClass} aria-live="polite">
          {status}
          {note !== undefined && <span className={saveBarNoteClass}>{note}</span>}
        </div>
      </div>
      {center !== undefined && <div className={saveBarCenterClass}>{center}</div>}
      <div className={saveBarActionsClass}>{actions}</div>
    </div>
  );
  return inShell && shellBar ? createPortal(bar, shellBar) : bar;
}
