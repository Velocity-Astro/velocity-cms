import { LoaderCircle, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button as AriaButton, type PressEvent } from 'react-aria-components';
import { buttonLabelVariants, buttonVariants, iconSize, spinnerClass, type ButtonVariants } from './Button.variants.js';

export interface ButtonProps extends ButtonVariants {
  /** The words on the button. Say what it does: "Publish", not "OK". */
  readonly children: ReactNode;
  /** A Lucide icon shown before the words. Decoration only. */
  readonly icon?: LucideIcon;
  readonly onPress?: (event: PressEvent) => void;
  /** `submit` sends the form the button is in. */
  readonly type?: 'button' | 'submit' | 'reset';
  readonly isDisabled?: boolean;
  /** The action is under way: the button shows a spinner, stays focusable and ignores presses. */
  readonly isPending?: boolean;
  /** Takes focus when it appears. For the safe choice in a dialog, and nowhere else. */
  readonly autoFocus?: boolean;
  /**
   * On a phone (below `md`) the button shows its icon alone, square, and its words are only read out:
   * for a screen's main button in the bar at the top, where a phone has room for one row. Needs `icon`.
   */
  readonly collapses?: boolean;
}

/** Starts an action. */
export function Button({
  children,
  icon: Icon,
  onPress,
  type = 'button',
  isDisabled = false,
  isPending = false,
  autoFocus = false,
  collapses = false,
  size,
  ...variants
}: ButtonProps) {
  const Leading = isPending ? LoaderCircle : Icon;
  // Without an icon there would be nothing left to see: such a button never collapses.
  const isCollapsing = collapses && Icon !== undefined;
  return (
    <AriaButton
      className={buttonVariants({ size, ...variants, collapses: isCollapsing })}
      type={type}
      isDisabled={isDisabled}
      isPending={isPending}
      autoFocus={autoFocus}
      {...(onPress && { onPress })}
    >
      {Leading && <Leading aria-hidden size={iconSize[size ?? 'md']} {...(isPending && { className: spinnerClass })} />}
      {isCollapsing ? <span className={buttonLabelVariants({ collapses: true })}>{children}</span> : children}
    </AriaButton>
  );
}
