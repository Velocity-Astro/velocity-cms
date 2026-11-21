import { Ellipsis, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../../components/Button/index.js';
import { Heading } from '../../components/Heading/index.js';
import { IconButton } from '../../components/IconButton/index.js';
import { Menu } from '../../components/Menu/index.js';
import { Text } from '../../components/Text/index.js';
import { usePageBar } from '../page-bar.js';
import {
  pageHeaderActionsVariants,
  pageHeaderDescriptionVariants,
  pageHeaderMoreClass,
  pageHeaderSecondaryClass,
  pageHeaderTitleVariants,
  pageHeaderVariants,
} from './PageHeader.variants.js';

/** One of a screen's other buttons: a button from `md` up, an item of the screen's one menu on a phone. */
export interface PageAction {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly onPress: () => void;
  /** How it looks as a button: `secondary` (the default), or `ghost` for what is pressed seldom, such as erasing. */
  readonly variant?: 'secondary' | 'ghost';
  /** `danger` for what cannot be undone: red in the menu. */
  readonly tone?: 'default' | 'danger';
  readonly isDisabled?: boolean;
  /** Under way: the button shows a spinner. */
  readonly isPending?: boolean;
}

export interface PageHeaderSecondary {
  /** Names the menu they fold into on a phone, such as "More actions". */
  readonly moreLabel: string;
  readonly actions: readonly PageAction[];
}

export interface PageHeaderProps {
  /** The name of the screen. It becomes the page's only level 1 heading. */
  readonly title: string;
  /** One sentence on what the screen is for, or how much it holds. Left out on a phone, in the bar. */
  readonly description?: string;
  /**
   * The screen's main buttons, main action last, shown on every window. In the bar a phone has one row, so
   * keep to one or two, and give a button `collapses` so it is its icon alone there.
   */
  readonly actions?: ReactNode;
  /** The screen's other buttons, before the main ones: buttons from `md` up, one menu on a phone. */
  readonly secondary?: PageHeaderSecondary;
}

/**
 * The top of every screen: its title, what it is for, and its actions. Inside `AppShell` it is drawn in the
 * shell's bar, so the screen's own area holds only its content; on a phone it is one row there: the title,
 * cut to fit, the menu of other actions and the main ones.
 */
export function PageHeader({ title, description, actions, secondary }: PageHeaderProps) {
  const bar = usePageBar();
  // The shell is still drawing its bar: the header comes once there is a place for it.
  if (bar === null) return null;
  const place = bar === undefined ? 'page' : 'bar';
  const inBar = place === 'bar';
  // In the shell's bar, which is the page's header already, it is one part of it.
  const Element = inBar ? 'div' : 'header';
  const others = secondary !== undefined && secondary.actions.length > 0 ? secondary : undefined;
  const header = (
    <Element className={pageHeaderVariants({ place })}>
      <div className={pageHeaderTitleVariants({ place })}>
        <Heading level={1} {...(inBar && { size: 'lg' as const, truncate: true })}>
          {title}
        </Heading>
        {description !== undefined && (
          <div className={pageHeaderDescriptionVariants({ place })}>
            <Text tone={inBar ? 'muted' : 'secondary'} size={inBar ? 'sm' : 'base'} truncate={inBar}>
              {description}
            </Text>
          </div>
        )}
      </div>
      {(others !== undefined || actions !== undefined) && (
        <div className={pageHeaderActionsVariants({ place })}>
          {others !== undefined && (
            <>
              <div className={pageHeaderSecondaryClass}>
                {others.actions.map((action) => (
                  <Button
                    key={action.id}
                    variant={action.variant ?? 'secondary'}
                    icon={action.icon}
                    onPress={action.onPress}
                    {...(action.isDisabled !== undefined && { isDisabled: action.isDisabled })}
                    {...(action.isPending !== undefined && { isPending: action.isPending })}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
              <div className={pageHeaderMoreClass}>
                <Menu
                  placement="bottom end"
                  trigger={<IconButton label={others.moreLabel} icon={Ellipsis} />}
                  actions={others.actions.map(({ id, label, icon, tone, isDisabled }) => ({
                    id,
                    label,
                    icon,
                    ...(tone !== undefined && { tone }),
                    ...(isDisabled !== undefined && { isDisabled }),
                  }))}
                  onAction={(id) => others.actions.find((action) => action.id === id)?.onPress()}
                />
              </div>
            </>
          )}
          {actions}
        </div>
      )}
    </Element>
  );
  return bar === undefined ? header : createPortal(header, bar);
}
