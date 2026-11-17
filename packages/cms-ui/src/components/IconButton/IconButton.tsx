import type { LucideIcon } from 'lucide-react';
import { Button as AriaButton, type PressEvent } from 'react-aria-components';
import { Tooltip } from '../Tooltip/index.js';
import { iconButtonIconSize, iconButtonVariants, type IconButtonVariants } from './IconButton.variants.js';

export interface IconButtonProps extends IconButtonVariants {
  /** What the button does. Read out by screen readers and shown as its tooltip. */
  readonly label: string;
  readonly icon: LucideIcon;
  readonly onPress?: (event: PressEvent) => void;
  readonly isDisabled?: boolean;
}

/** A button that shows only an icon. Its label is its accessible name and its tooltip. */
export function IconButton({ label, icon: Icon, onPress, isDisabled = false, size, variant }: IconButtonProps) {
  return (
    <Tooltip content={label}>
      <AriaButton
        className={iconButtonVariants({ size, variant })}
        aria-label={label}
        isDisabled={isDisabled}
        {...(onPress && { onPress })}
      >
        <Icon aria-hidden size={iconButtonIconSize[size ?? 'md']} />
      </AriaButton>
    </Tooltip>
  );
}
