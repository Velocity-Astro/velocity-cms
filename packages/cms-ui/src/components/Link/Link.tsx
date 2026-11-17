import type { ReactNode } from 'react';
import { Link as AriaLink } from 'react-aria-components';
import { linkVariants, type LinkVariants } from './Link.variants.js';

export interface LinkProps extends LinkVariants {
  readonly href: string;
  /** The words of the link. Say where it goes: "Edit listing", not "Click here". */
  readonly children: ReactNode;
  /** Opens another site in a new tab. Say so in the words, such as "View on site". */
  readonly opensInNewTab?: boolean;
  readonly isDisabled?: boolean;
}

/** Goes to another page. */
export function Link({ href, children, opensInNewTab = false, isDisabled = false, tone }: LinkProps) {
  return (
    <AriaLink
      className={linkVariants({ tone })}
      href={href}
      isDisabled={isDisabled}
      {...(opensInNewTab && { target: '_blank', rel: 'noopener noreferrer' })}
    >
      {children}
    </AriaLink>
  );
}
