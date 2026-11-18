import { useId, type ReactNode } from 'react';
import { cardActionsClass, cardBodyClass, cardClass, cardDescriptionClass, cardFooterClass, cardHeaderClass, cardHeadingClass, cardTitleClass } from './Card.variants.js';

export interface CardProps {
  /** What the card holds, such as "Price and status". It becomes a level 2 heading and names the card. */
  readonly title?: string;
  /** One sentence under the title. */
  readonly description?: string;
  /** What stands beside the title: a state and a switch, or one button. Shown only with a title. */
  readonly actions?: ReactNode;
  /** What can be done with the whole card, in a row under what it holds: a few buttons. */
  readonly footer?: ReactNode;
  readonly children?: ReactNode;
}

/** A framed part of a screen with its own heading, such as one section of a long form. */
export function Card({ title, description, actions, footer, children }: CardProps) {
  const titleId = useId();
  return (
    <section className={cardClass} {...(title !== undefined && { 'aria-labelledby': titleId })}>
      {title !== undefined && (
        <div className={cardHeaderClass}>
          <div className={cardHeadingClass}>
            <h2 id={titleId} className={cardTitleClass}>
              {title}
            </h2>
            {description !== undefined && <p className={cardDescriptionClass}>{description}</p>}
          </div>
          {actions !== undefined && <div className={cardActionsClass}>{actions}</div>}
        </div>
      )}
      {children !== undefined && <div className={cardBodyClass}>{children}</div>}
      {footer !== undefined && <div className={cardFooterClass}>{footer}</div>}
    </section>
  );
}
