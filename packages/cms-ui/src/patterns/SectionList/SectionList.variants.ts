import { cva, type VariantProps } from 'class-variance-authority';
import { fieldDescriptionClass, fieldErrorClass, fieldLabelClass } from '../../components/field.js';

export const sectionListClass = 'flex min-w-0 flex-col gap-2';
export const sectionListLabelClass = fieldLabelClass;
export const sectionListDescriptionClass = fieldDescriptionClass;
export const sectionListErrorClass = fieldErrorClass;
export const sectionListItemsClass = 'flex flex-col gap-2';
export const sectionListEmptyClass = 'rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-foreground-muted';
export const sectionListAddClass = 'flex';

export const sectionVariants = cva('motion-rise min-w-0 rounded-lg border bg-card', {
  variants: {
    state: {
      default: 'border-border',
      problem: 'border-destructive',
      /** Being dragged: it stays in its place, faded, until it is dropped. */
      dragging: 'border-border opacity-50',
      /** A section is held over it with the keyboard, and would take its place. */
      target: 'border-ring ring-2 ring-ring',
    },
  },
  defaultVariants: { state: 'default' },
});

export const sectionHeaderClass = 'flex items-center gap-1 py-1 pr-2 pl-1';
/** The handle a section is dragged by. */
export const sectionGripClass = [
  'grid h-8 w-6 shrink-0 cursor-grab place-items-center rounded-md text-foreground-subtle outline-none',
  'transition-colors motion-fast data-hovered:bg-secondary data-hovered:text-foreground data-pressed:cursor-grabbing',
  'data-focus-visible:ring-2 data-focus-visible:ring-input-focus',
].join(' ');
/** Where a dragged section would land, between two others. */
export const sectionDropLineClass = 'my-1 h-0.5 rounded-full bg-ring';
export const sectionHeadingClass = 'min-w-0 flex-1';
export const sectionTriggerClass = [
  'flex w-full min-w-0 cursor-default items-center gap-3 rounded-md px-2 py-2 text-left outline-none',
  'transition-colors motion-fast data-hovered:bg-secondary',
  'data-focus-visible:ring-2 data-focus-visible:ring-input-focus',
].join(' ');
export const sectionChevronClass = 'shrink-0 text-foreground-muted';

export const sectionIconVariants = cva('grid size-8 shrink-0 place-items-center rounded-md', {
  variants: {
    tone: {
      default: 'bg-secondary text-secondary-foreground',
      quiet: 'bg-background-secondary text-foreground-subtle',
    },
  },
  defaultVariants: { tone: 'default' },
});

export const sectionTextClass = 'flex min-w-0 flex-1 flex-col';
export const sectionTitleVariants = cva('truncate text-sm font-medium', {
  variants: {
    tone: {
      default: 'text-foreground',
      quiet: 'text-foreground-muted',
    },
  },
  defaultVariants: { tone: 'default' },
});
export const sectionSummaryClass = 'truncate text-sm text-foreground-muted';
export const sectionActionsClass = 'flex shrink-0 items-center';
export const sectionPanelClass = 'border-t border-border p-4';
export const sectionProblemClass = 'px-4 pb-3 text-sm text-destructive';

/** The sizes of a section's icons, in pixels. */
export const sectionIconSize = 16;

export type SectionVariants = VariantProps<typeof sectionVariants>;
