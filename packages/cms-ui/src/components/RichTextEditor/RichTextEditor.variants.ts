import { cva } from 'class-variance-authority';
import { fieldDescriptionClass, fieldErrorClass, fieldHiddenLabelClass, fieldLabelClass, fieldRequiredMarkClass, floatingItemClass, floatingPanelClass } from '../field.js';

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
    'relative flex min-w-0 flex-col rounded-md border bg-input transition-colors motion-fast',
    'has-focus-visible:border-input-focus has-focus-visible:ring-1 has-focus-visible:ring-input-focus',
  ],
  {
    variants: { isInvalid: { true: 'border-destructive', false: 'border-input-border hover:border-border-strong' } },
    defaultVariants: { isInvalid: false },
  },
);

/** The toolbar stays at the top of the window while a long text is written below it. */
export const richTextEditorToolbarClass = 'sticky top-0 z-10 flex flex-wrap items-center gap-0.5 rounded-t-md border-b border-border bg-input px-1.5 py-1';
export const richTextEditorSeparatorClass = 'mx-1 h-5 w-px bg-border';
const toolLookClass = [
  'inline-flex shrink-0 cursor-default items-center justify-center rounded-sm text-foreground-secondary',
  'transition-colors motion-fast outline-none',
  'data-hovered:bg-secondary data-hovered:text-foreground data-pressed:bg-secondary-hover',
  'data-selected:bg-background-tertiary data-selected:text-foreground',
  'data-focus-visible:ring-2 data-focus-visible:ring-ring data-disabled:opacity-50',
].join(' ');
export const richTextEditorToolClass = `${toolLookClass} size-8`;
export const richTextEditorToolIconSize = 16;

/** A tool that opens a menu: its icon and a small caret. */
export const richTextEditorToolMenuClass = `${toolLookClass} h-8 gap-0.5 px-1.5`;

/** The bar over chosen words. */
export const richTextEditorBubbleClass = `${floatingPanelClass} flex items-center gap-0.5 overflow-visible`;

/** The layer the bar over chosen words is drawn in: above the toolbar, which stays in view. */
export const richTextEditorBubbleLayerClass = 'layer-overlay';

/** Where the menu that / opens stands: moved under the cursor as it opens. */
export const richTextEditorAnchorClass = 'pointer-events-none absolute size-0';

/** The menu of a tool: the choices of a look, what can be added, the actions of a table. */
export const richTextEditorMenuPanelClass = `${floatingPanelClass} min-w-48 max-h-96`;
export const richTextEditorMenuClass = 'outline-none';
export const richTextEditorMenuItemClass = cva(floatingItemClass, {
  variants: { tone: { default: 'text-foreground', danger: 'text-destructive' } },
  defaultVariants: { tone: 'default' },
});
export const richTextEditorMenuIconSize = 16;
/** The sample of a colour beside its name. */
export const richTextEditorSwatchClass = 'size-4 shrink-0 rounded-full border border-border';

/** The search at the top of the menu that / opens. */
export const richTextEditorSlashSearchClass = 'flex items-center gap-2 border-b border-border px-2 pb-1.5 text-foreground-muted';
export const richTextEditorSlashInputClass = 'h-8 w-full bg-transparent text-base text-foreground outline-none placeholder:text-foreground-subtle';
export const richTextEditorSlashEmptyClass = 'px-2 py-1.5 text-sm text-foreground-muted';

/** The picture shown in the settings of a picture. */
export const richTextEditorPicturePreviewClass = 'max-h-32 w-full rounded-sm border border-border object-contain';

/** The keys that format text, listed. */
export const richTextEditorShortcutListClass = 'flex flex-col gap-1 text-sm text-foreground';
export const richTextEditorShortcutRowClass = 'flex items-center justify-between gap-4';
export const richTextEditorShortcutKeysClass = 'rounded-sm border border-border bg-background-tertiary px-1.5 font-mono text-xs text-foreground-secondary';

/** How many words a long text holds, and how long it takes to read. */
export const richTextEditorCountClass = 'text-sm text-foreground-muted';

/** The text itself. `rich-text` in styles.css draws headings, lists, quotes and links inside it. */
export const richTextEditorContentClass = 'rich-text min-h-32 px-3 py-2 text-base text-foreground outline-none';

/** The small panel a link's address is typed in. */
export const richTextEditorLinkPanelClass = `${floatingPanelClass} w-80 p-3`;
export const richTextEditorLinkOuterClass = 'outline-none';
export const richTextEditorLinkDialogClass = 'flex flex-col gap-3';
export const richTextEditorLinkActionsClass = 'flex justify-end gap-2';
