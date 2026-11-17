import type { ReactNode } from 'react';
import { Heading } from '../../components/Heading/index.js';
import { Stack } from '../../components/Stack/index.js';
import { Text } from '../../components/Text/index.js';
import { pageHeaderActionsClass, pageHeaderClass } from './PageHeader.variants.js';

export interface PageHeaderProps {
  /** The name of the screen. It becomes the page's only level 1 heading. */
  readonly title: string;
  /** One sentence on what the screen is for. */
  readonly description?: string;
  /** The screen's buttons, main action last. */
  readonly actions?: ReactNode;
}

/** The top of every screen: its title, what it is for, and its main actions. */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className={pageHeaderClass}>
      <Stack gap={1}>
        <Heading level={1}>{title}</Heading>
        {description !== undefined && <Text tone="secondary">{description}</Text>}
      </Stack>
      {actions !== undefined && <div className={pageHeaderActionsClass}>{actions}</div>}
    </header>
  );
}
