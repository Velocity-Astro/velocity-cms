import { useId, type ReactNode } from 'react';
import { cardBodyClass, cardClass, cardDescriptionClass, cardHeaderClass, cardTitleClass } from './Card.variants.js';

export interface CardProps {
  /** What the card holds, such as "Price and status". It becomes a level 2 heading and names the card. */
  readonly title?: string;
  /** One sentence under the title. */
  readonly description?: string;
  readonly children: ReactNode;
}

/** A framed part of a screen with its own heading, such as one section of a long form. */
export function Card({ title, description, children }: CardProps) {
  const titleId = useId();
  return (
    <section className={cardClass} {...(title !== undefined && { 'aria-labelledby': titleId })}>
      {title !== undefined && (
        <div className={cardHeaderClass}>
          <h2 id={titleId} className={cardTitleClass}>
            {title}
          </h2>
          {description !== undefined && <p className={cardDescriptionClass}>{description}</p>}
        </div>
      )}
      <div className={cardBodyClass}>{children}</div>
    </section>
  );
}
