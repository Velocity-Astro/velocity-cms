import { cva } from 'class-variance-authority';
import { fieldDescriptionClass, fieldErrorClass, fieldHiddenLabelClass, fieldLabelClass, fieldRequiredMarkClass } from '../../components/field.js';

export const imagePickerClass = 'flex min-w-0 flex-col gap-1.5';
export const imagePickerLabelVariants = cva('', {
  variants: { isLabelHidden: { true: fieldHiddenLabelClass, false: fieldLabelClass } },
  defaultVariants: { isLabelHidden: false },
});
export const imagePickerRequiredMarkClass = fieldRequiredMarkClass;
export const imagePickerDescriptionClass = fieldDescriptionClass;
export const imagePickerErrorClass = fieldErrorClass;

/** The picture, its name and the button, on one line. */
export const imagePickerRowClass = 'flex min-w-0 items-center gap-3';
export const imagePickerThumbClass = 'h-14 w-20 shrink-0 rounded-md border border-border bg-background-secondary object-cover';
export const imagePickerPlaceholderClass =
  'flex h-14 w-20 shrink-0 items-center justify-center rounded-md border border-dashed border-border-strong bg-background-secondary';
export const imagePickerPlaceholderIconClass = 'size-5 text-foreground-subtle';
export const imagePickerNameClass = 'min-w-0 flex-1 truncate text-sm text-foreground-secondary';

/** The images to choose from, three or four to a row. */
export const imagePickerChoicesClass = 'grid grid-cols-2 gap-3 py-2 outline-none sm:grid-cols-3';
export const imagePickerChoiceClass = [
  'flex cursor-default flex-col gap-1.5 rounded-md border border-border bg-card p-1.5 outline-none',
  'transition-colors motion-fast',
  'data-hovered:border-border-strong data-focus-visible:ring-2 data-focus-visible:ring-input-focus',
  'data-selected:border-input-focus data-selected:ring-1 data-selected:ring-input-focus',
].join(' ');
export const imagePickerChoiceImageClass = 'aspect-video w-full rounded-sm bg-background-secondary object-cover';
export const imagePickerChoiceNameClass = 'truncate px-0.5 text-sm text-foreground';
export const imagePickerEmptyClass = 'py-6 text-center text-sm text-foreground-muted';

/** The upload button with its note, above the images. */
export const imagePickerUploadClass = 'flex min-w-0 flex-wrap items-center gap-3 pt-2';
export const imagePickerUploadHintClass = 'min-w-0 text-sm text-foreground-muted';
export const imagePickerUploadErrorClass = 'min-w-0 text-sm text-destructive';
