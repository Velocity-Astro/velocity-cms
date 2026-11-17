import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Heading } from '../../components/Heading/index.js';
import { Text } from '../../components/Text/index.js';
import { emptyStateClass, emptyStateIconClass, emptyStateIconSize, emptyStateTextClass } from './EmptyState.variants.js';

export interface EmptyStateProps {
  /** What is missing: "No listings yet". */
  readonly title: string;
  /** Why it is empty, or what adding the first one does. */
  readonly description?: string;
  readonly icon?: LucideIcon;
  /** The one thing to do next, usually a primary `Button`. */
  readonly action?: ReactNode;
  /** The heading's place in the page outline. */
  readonly level?: 2 | 3 | 4;
}

/** What a screen shows where its content will be, before there is any. */
export function EmptyState({ title, description, icon: Icon, action, level = 2 }: EmptyStateProps) {
  return (
    <div className={emptyStateClass}>
      {Icon && (
        <span className={emptyStateIconClass}>
          <Icon aria-hidden size={emptyStateIconSize} />
        </span>
      )}
      <div className={emptyStateTextClass}>
        <Heading level={level} size="md">
          {title}
        </Heading>
        {description !== undefined && <Text tone="secondary">{description}</Text>}
      </div>
      {action}
    </div>
  );
}
