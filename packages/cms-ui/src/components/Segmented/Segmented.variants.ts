import { cva } from 'class-variance-authority';
import { fieldDescriptionClass, fieldErrorClass, fieldLabelClass } from '../field.js';

export const segmentedClass = 'inline-flex flex-wrap gap-1';

/** With its words shown, a choice is as wide as they are; with only its icon, it is square. */
export const segmentedOptionVariants = cva(
  [
    'inline-flex h-8 cursor-default items-center gap-2 rounded-md text-sm font-medium text-foreground-secondary',
    'transition-colors motion-fast',
    'outline-none data-hovered:text-foreground data-selected:bg-background-tertiary data-selected:text-foreground',
    'data-focus-visible:ring-2 data-focus-visible:ring-ring data-disabled:text-foreground-subtle',
  ],
  {
    variants: { isIconOnly: { true: 'w-8 justify-center', false: 'px-3' } },
    defaultVariants: { isIconOnly: false },
  },
);
/** The words of a choice shown only as its icon: read out, and shown in a tooltip. */
export const segmentedHiddenLabelClass = 'sr-only';
export const segmentedIconSize = 16;

/** The sample of a colour beside a choice, with a line around it so a colour like the page's still shows. */
export const segmentedSwatchClass = 'h-4 w-4 shrink-0 stroke-border-strong';

/** The choices as a field of a form: its label above, its help or its problem under. */
export const segmentedFieldClass = 'flex min-w-0 flex-col items-start gap-2';
export const segmentedLabelClass = fieldLabelClass;
export const segmentedDescriptionClass = fieldDescriptionClass;
export const segmentedErrorClass = fieldErrorClass;
