import type { ReactNode } from 'react';
import {
  welcomeActionsClass,
  welcomeAsideClass,
  welcomeClass,
  welcomeDescriptionClass,
  welcomeEyebrowClass,
  welcomeInnerClass,
  welcomeMarkClass,
  welcomeTextClass,
  welcomeTitleClass,
} from './Welcome.variants.js';

export interface WelcomeProps {
  /** A few words over the title, such as today's date. */
  readonly eyebrow?: string;
  /** The screen's one heading: "Good morning, Dana. 3 drafts are waiting." */
  readonly title: string;
  /** Words inside the title to set apart, such as "3 drafts". Its first appearance is marked. */
  readonly highlight?: string;
  /** One or two sentences under the title. */
  readonly description?: string;
  /** What to do first: one main `Button` and one or two others. */
  readonly actions?: ReactNode;
  /** Beside the words, from a tablet's width up: a `SiteWindow`. A phone leaves it out. */
  readonly aside?: ReactNode;
}

/** The title with the highlighted words marked, where they appear in it. */
function marked(title: string, highlight: string | undefined): ReactNode {
  const at = highlight === undefined || highlight === '' ? -1 : title.indexOf(highlight);
  if (highlight === undefined || at < 0) return title;
  return (
    <>
      {title.slice(0, at)}
      <mark className={welcomeMarkClass}>{highlight}</mark>
      {title.slice(at + highlight.length)}
    </>
  );
}

/** The top of a screen that greets the person: what matters now in large words, what to do about it, and the site beside it. */
export function Welcome({ eyebrow, title, highlight, description, actions, aside }: WelcomeProps) {
  return (
    <section className={welcomeClass}>
      <div className={welcomeInnerClass}>
        <div className={welcomeTextClass}>
          {eyebrow !== undefined && <p className={welcomeEyebrowClass}>{eyebrow}</p>}
          <h1 className={welcomeTitleClass}>{marked(title, highlight)}</h1>
          {description !== undefined && <p className={welcomeDescriptionClass}>{description}</p>}
          {actions !== undefined && <div className={welcomeActionsClass}>{actions}</div>}
        </div>
        {aside !== undefined && <div className={welcomeAsideClass}>{aside}</div>}
      </div>
    </section>
  );
}
