import type { ReactNode } from 'react';
import { useFocusWithin } from 'react-aria';
import { presenceMarkLabelVariants, presenceMarkVariants } from './PresenceMark.variants.js';

export interface PresenceMarkProps {
  /** Who else is at what is inside now, as words: "Ana is here". Left out, nobody is and nothing is shown. */
  readonly label?: string | undefined;
  /** Called when the person's own focus comes inside, from outside it. */
  readonly onEnter?: (() => void) | undefined;
  /** What someone can be at: a field, usually. */
  readonly children?: ReactNode;
}

/**
 * Says that someone else is working where the person may be about to: a ring round what it holds,
 * and who it is in words. It also says when the person's own focus comes inside, so their editor
 * can tell the others where they are.
 */
export function PresenceMark({ label, onEnter, children }: PresenceMarkProps) {
  const { focusWithinProps } = useFocusWithin({ onFocusWithin: () => onEnter?.() });
  return (
    <div {...focusWithinProps} className={presenceMarkVariants({ taken: label !== undefined })} {...(label !== undefined && { 'data-taken': '' })}>
      {children}
      {/* Read out when someone arrives, without taking the person from what they are doing. */}
      {label !== undefined && (
        <p role="status" className={presenceMarkLabelVariants()}>
          {label}
        </p>
      )}
    </div>
  );
}
