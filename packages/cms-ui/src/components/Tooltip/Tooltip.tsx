import type { ReactElement } from 'react';
import { Tooltip as AriaTooltip, TooltipTrigger } from 'react-aria-components';
import { tooltipClass, tooltipDelay, tooltipOffset } from './Tooltip.variants.js';

export interface TooltipProps {
  /** A few words. They are read out as the control's description. */
  readonly content: string;
  /** One control from this package, such as a `Button`. */
  readonly children: ReactElement;
  readonly placement?: 'top' | 'bottom' | 'left' | 'right';
}

/** A short hint shown when a control is hovered or focused. */
export function Tooltip({ content, children, placement = 'top' }: TooltipProps) {
  return (
    <TooltipTrigger delay={tooltipDelay}>
      {children}
      <AriaTooltip className={tooltipClass} placement={placement} offset={tooltipOffset}>
        {content}
      </AriaTooltip>
    </TooltipTrigger>
  );
}
