/**
 * The label, help and error of a form field. Shared by every field component, so a text field
 * and a select line up when they sit side by side.
 */
export const fieldLabelClass = 'text-sm font-medium text-foreground';
export const fieldRequiredMarkClass = 'text-destructive';
export const fieldDescriptionClass = 'text-sm text-foreground-muted';
export const fieldErrorClass = 'text-sm text-destructive';

/** The box a person types or chooses in. */
export const fieldBoxClass = [
  'w-full rounded-md border border-input-border bg-input px-3 text-base text-foreground',
  'transition-colors motion-fast',
  'outline-none data-hovered:border-border-strong data-focused:border-input-focus data-focused:ring-1 data-focused:ring-input-focus',
  'data-focus-visible:border-input-focus data-focus-visible:ring-1 data-focus-visible:ring-input-focus',
  'data-invalid:border-destructive data-invalid:data-focused:ring-destructive',
  'data-disabled:bg-background-secondary data-disabled:text-foreground-muted',
].join(' ');

/** The box at the height of one line, which a button lines up with. */
export const fieldControlClass = `${fieldBoxClass} h-10`;

/** A panel that floats over the page: a select's list, a menu. */
export const floatingPanelClass =
  'layer-overlay overflow-auto rounded-md border border-border bg-background-elevated p-1 shadow-lg outline-none';

/** One choice inside a floating panel. */
export const floatingItemClass = [
  'flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-base outline-none',
  'data-focused:bg-secondary data-hovered:bg-secondary',
  'data-disabled:text-foreground-subtle',
].join(' ');
