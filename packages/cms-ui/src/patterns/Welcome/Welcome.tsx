import type { ReactNode } from 'react';
import {
  welcomeActionsClass,
  welcomeAsideClass,
  welcomeClass,
  welcomeDescriptionClass,
  welcomeEyebrowClass,
  welcomeInnerClass,
  welcomeNameClass,
  welcomeTextClass,
  welcomeTitleClass,
} from './Welcome.variants.js';

export interface WelcomeProps {
  /** A few words over the title, such as today's date. */
  readonly eyebrow?: string;
  /** The screen's one heading, a greeting: "Good morning,". */
  readonly title: string;
  /** Who is greeted, on a line of its own under the title in the brand's colour, never broken across two. */
  readonly name?: string;
  /** One or two sentences under the title, in smaller words: what is waiting, where things stand. */
  readonly description?: string;
  /** What to do first: one main `Button` and one or two others. */
  readonly actions?: ReactNode;
  /** Beside the words, from a tablet's width up: a `SiteWindow`. A phone leaves it out. */
  readonly aside?: ReactNode;
}

/** The top of a screen that greets the person: a greeting and their name in large words, what stands now under it, what to do about it, and the site beside it. */
export function Welcome({ eyebrow, title, name, description, actions, aside }: WelcomeProps) {
  const hasName = name !== undefined && name !== '';
  return (
    <section className={welcomeClass}>
      <div className={welcomeInnerClass}>
        <div className={welcomeTextClass}>
          {eyebrow !== undefined && <p className={welcomeEyebrowClass}>{eyebrow}</p>}
          <h1 className={welcomeTitleClass}>
            {title}
            {hasName && (
              <>
                {' '}
                <mark className={welcomeNameClass} title={name}>
                  {name}
                </mark>
              </>
            )}
          </h1>
          {description !== undefined && <p className={welcomeDescriptionClass}>{description}</p>}
          {actions !== undefined && <div className={welcomeActionsClass}>{actions}</div>}
        </div>
        {aside !== undefined && <div className={welcomeAsideClass}>{aside}</div>}
      </div>
    </section>
  );
}
