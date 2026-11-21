import { cva, type VariantProps } from 'class-variance-authority';
import { fieldControlClass, floatingPanelClass } from '../field.js';

export const colorPickerVariants = cva('flex flex-col gap-1.5', {
  variants: {
    width: {
      full: 'w-full',
      md: 'w-80',
      sm: 'w-48',
    },
  },
  defaultVariants: { width: 'full' },
});

/** The button with the colour in it, then the hex colour typed beside it. */
export const colorPickerRowClass = 'flex items-center gap-2';
export const colorPickerSwatchButtonClass = [
  'flex size-10 shrink-0 cursor-default items-center justify-center rounded-md border border-input-border bg-input p-1',
  'outline-none transition-colors motion-fast data-hovered:border-border-strong',
  'data-focus-visible:ring-2 data-focus-visible:ring-ring data-disabled:opacity-50',
].join(' ');
export const colorPickerSwatchClass = 'size-full rounded-sm';
export const colorPickerInputClass = `${fieldControlClass} min-w-0 flex-1 font-mono uppercase`;

/** The panel the colour is chosen in. */
export const colorPickerPopoverClass = `${floatingPanelClass} p-3`;
export const colorPickerDialogClass = 'flex w-56 flex-col gap-3 outline-none';
/** Shades of the hue: saturation across, brightness up. */
export const colorPickerAreaClass = 'aspect-square w-full rounded-md';
export const colorPickerThumbClass = [
  'size-5 rounded-full border-2 border-background shadow-md',
  'data-focus-visible:size-6 data-dragging:size-6',
].join(' ');
export const colorPickerSliderClass = 'flex w-full flex-col';
export const colorPickerTrackClass = 'h-6 w-full rounded-md';
export const colorPickerSliderThumbClass = `${colorPickerThumbClass} top-1/2`;
/** The colours a template suggests, a press away. */
export const colorPickerPresetsClass = 'grid grid-cols-6 gap-2';
export const colorPickerPresetClass = [
  'size-7 cursor-default rounded-md outline-none',
  'data-selected:ring-2 data-selected:ring-ring data-selected:ring-offset-2 data-selected:ring-offset-background-elevated',
  'data-focus-visible:ring-2 data-focus-visible:ring-ring',
].join(' ');
export const colorPickerPresetSwatchClass = 'size-full rounded-md';

export type ColorPickerVariants = VariantProps<typeof colorPickerVariants>;
