import { cva } from 'class-variance-authority';
import { fieldDescriptionClass, fieldErrorClass, fieldHiddenLabelClass, fieldLabelClass, fieldRequiredMarkClass, floatingPanelClass } from '../field.js';

export const richTextEditorClass = 'flex min-w-0 flex-col gap-1.5';
export const richTextEditorLabelVariants = cva('', {
  variants: { isLabelHidden: { true: fieldHiddenLabelClass, false: fieldLabelClass } },
  defaultVariants: { isLabelHidden: false },
});
export const richTextEditorRequiredMarkClass = fieldRequiredMarkClass;
export const richTextEditorDescriptionClass = fieldDescriptionClass;
export const richTextEditorErrorClass = fieldErrorClass;

/** The toolbar and the text in one box, which lights up as a text field does. */
export const richTextEditorBoxVariants = cva(
  [
    'flex min-w-0 flex-col rounded-md border bg-input transition-colors motion-fast',
    'has-focus-visible:border-input-focus has-focus-visible:ring-1 has-focus-visible:ring-input-focus',
  ],
  {
    variants: { isInvalid: { true: 'border-destructive', false: 'border-input-border hover:border-border-strong' } },
    defaultVariants: { isInvalid: false },
  },
);

export const richTextEditorToolbarClass = 'flex flex-wrap items-center gap-0.5 border-b border-border px-1.5 py-1';
export const richTextEditorSeparatorClass = 'mx-1 h-5 w-px bg-border';
export const richTextEditorToolClass = [
  'inline-flex size-8 shrink-0 cursor-default items-center justify-center rounded-sm text-foreground-secondary',
  'transition-colors motion-fast outline-none',
  'data-hovered:bg-secondary data-hovered:text-foreground data-pressed:bg-secondary-hover',
  'data-selected:bg-background-tertiary data-selected:text-foreground',
  'data-focus-visible:ring-2 data-focus-visible:ring-ring data-disabled:opacity-50',
].join(' ');
export const richTextEditorToolIconSize = 16;

/** The text itself. `rich-text` in styles.css draws headings, lists, quotes and links inside it. */
export const richTextEditorContentClass = 'rich-text min-h-32 px-3 py-2 text-base text-foreground outline-none';

/** The small panel a link's address is typed in. */
export const richTextEditorLinkPanelClass = `${floatingPanelClass} w-80 p-3`;
export const richTextEditorLinkOuterClass = 'outline-none';
export const richTextEditorLinkDialogClass = 'flex flex-col gap-3';
export const richTextEditorLinkActionsClass = 'flex justify-end gap-2';
