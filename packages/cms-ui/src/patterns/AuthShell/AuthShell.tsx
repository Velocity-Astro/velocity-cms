import type { ReactNode } from 'react';
import { Heading } from '../../components/Heading/index.js';
import { Text } from '../../components/Text/index.js';
import {
  authShellBrandClass,
  authShellCardClass,
  authShellClass,
  authShellFooterClass,
  authShellHeadingClass,
} from './AuthShell.variants.js';

export interface AuthShellProps {
  /** The site's name or logo. */
  readonly brand: ReactNode;
  /** What this screen is for: "Sign in". The page's only level 1 heading. */
  readonly title: string;
  /** One sentence under the title. */
  readonly description?: string;
  /** The form. */
  readonly children: ReactNode;
  /** A quiet line under the form, such as a link to help. */
  readonly footer?: ReactNode;
}

/** The frame around the screens before sign-in: one card in the middle of the page. */
export function AuthShell({ brand, title, description, children, footer }: AuthShellProps) {
  return (
    <main className={authShellClass}>
      <div className={authShellCardClass}>
        <div className={authShellBrandClass}>{brand}</div>
        <div className={authShellHeadingClass}>
          <Heading level={1} size="lg">
            {title}
          </Heading>
          {description !== undefined && <Text tone="secondary">{description}</Text>}
        </div>
        {children}
        {footer !== undefined && <div className={authShellFooterClass}>{footer}</div>}
      </div>
    </main>
  );
}
