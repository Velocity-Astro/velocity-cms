import { LoaderCircle, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button as AriaButton, type PressEvent } from 'react-aria-components';
import { buttonVariants, iconSize, spinnerClass, type ButtonVariants } from './Button.variants.js';

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
  size,
  ...variants
}: ButtonProps) {
  const Leading = isPending ? LoaderCircle : Icon;
  return (
    <AriaButton
      className={buttonVariants({ size, ...variants })}
      type={type}
      isDisabled={isDisabled}
      isPending={isPending}
      autoFocus={autoFocus}
      {...(onPress && { onPress })}
    >
      {Leading && <Leading aria-hidden size={iconSize[size ?? 'md']} {...(isPending && { className: spinnerClass })} />}
      {children}
    </AriaButton>
  );
}
