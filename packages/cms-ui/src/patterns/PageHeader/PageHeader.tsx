import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Heading } from '../../components/Heading/index.js';
import { Text } from '../../components/Text/index.js';
import { usePageBar } from '../page-bar.js';
import { pageHeaderActionsClass, pageHeaderTitleVariants, pageHeaderVariants } from './PageHeader.variants.js';

export interface PageHeaderProps {
  /** The name of the screen. It becomes the page's only level 1 heading. */
  readonly title: string;
  /** One sentence on what the screen is for, or how much it holds. */
  readonly description?: string;
  /** The screen's buttons, main action last. */
  readonly actions?: ReactNode;
}

/**
 * The top of every screen: its title, what it is for, and its main actions. Inside `AppShell` it is
 * drawn in the shell's bar, so the screen's own area holds only its content.
 */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  const bar = usePageBar();
  // The shell is still drawing its bar: the header comes once there is a place for it.
  if (bar === null) return null;
  const place = bar === undefined ? 'page' : 'bar';
  // In the shell's bar, which is the page's header already, it is one part of it.
  const Element = place === 'bar' ? 'div' : 'header';
  const header = (
    <Element className={pageHeaderVariants({ place })}>
      <div className={pageHeaderTitleVariants({ place })}>
        <Heading level={1} {...(place === 'bar' && { size: 'lg' as const })}>
          {title}
        </Heading>
        {description !== undefined && (
          <Text tone={place === 'bar' ? 'muted' : 'secondary'} size={place === 'bar' ? 'sm' : 'base'} truncate={place === 'bar'}>
            {description}
          </Text>
        )}
      </div>
      {actions !== undefined && <div className={pageHeaderActionsClass}>{actions}</div>}
    </Element>
  );
  return bar === undefined ? header : createPortal(header, bar);
}
