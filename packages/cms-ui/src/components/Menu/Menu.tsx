import type { LucideIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { Menu as AriaMenu, MenuItem as AriaMenuItem, MenuTrigger, Popover } from 'react-aria-components';
import { menuClass, menuIconSize, menuItemVariants, menuPopoverClass } from './Menu.variants.js';

export interface MenuAction {
  readonly id: string;
  /** What the action does: "Duplicate", "Delete". */
  readonly label: string;
  readonly icon?: LucideIcon;
  /** `danger` for an action that destroys something. */
  readonly tone?: 'default' | 'danger';
  readonly isDisabled?: boolean;
}

export interface MenuProps {
  /** The control that opens the menu: a `Button` or an `IconButton`. */
  readonly trigger: ReactElement;
  readonly actions: readonly MenuAction[];
  /** Called with the id of the action chosen. */
  readonly onAction: (id: string) => void;
  readonly placement?: 'bottom start' | 'bottom end' | 'top start' | 'top end';
}

/** A list of actions that opens from a button. */
export function Menu({ trigger, actions, onAction, placement = 'bottom end' }: MenuProps) {
  return (
    <MenuTrigger>
      {trigger}
      <Popover className={menuPopoverClass} placement={placement}>
        <AriaMenu
          className={menuClass}
          onAction={(key) => onAction(String(key))}
          disabledKeys={actions.filter((action) => action.isDisabled).map((action) => action.id)}
        >
          {actions.map(({ id, label, icon: Icon, tone }) => (
            <AriaMenuItem key={id} id={id} className={menuItemVariants({ tone })} textValue={label}>
              {Icon && <Icon aria-hidden size={menuIconSize} />}
              {label}
            </AriaMenuItem>
          ))}
        </AriaMenu>
      </Popover>
    </MenuTrigger>
  );
}
