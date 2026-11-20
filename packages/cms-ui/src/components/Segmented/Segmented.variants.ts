import { fieldDescriptionClass, fieldErrorClass, fieldLabelClass } from '../field.js';

export const segmentedClass = 'inline-flex flex-wrap gap-1';

export const segmentedOptionClass = [
  'inline-flex h-8 cursor-default items-center gap-2 rounded-md px-3 text-sm font-medium text-foreground-secondary',
  'transition-colors motion-fast',
  'outline-none data-hovered:text-foreground data-selected:bg-background-tertiary data-selected:text-foreground',
  'data-focus-visible:ring-2 data-focus-visible:ring-ring data-disabled:text-foreground-subtle',
].join(' ');

/** The sample of a colour beside a choice, with a line around it so a colour like the page's still shows. */
export const segmentedSwatchClass = 'h-4 w-4 shrink-0 stroke-border-strong';

/** The choices as a field of a form: its label above, its help or its problem under. */
export const segmentedFieldClass = 'flex min-w-0 flex-col items-start gap-2';
export const segmentedLabelClass = fieldLabelClass;
export const segmentedDescriptionClass = fieldDescriptionClass;
export const segmentedErrorClass = fieldErrorClass;
