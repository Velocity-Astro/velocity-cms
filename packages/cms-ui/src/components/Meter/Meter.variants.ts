import { cva } from 'class-variance-authority';

export const meterClass = 'flex w-full flex-col gap-2';
export const meterHeadClass = 'flex items-baseline justify-between gap-3 text-sm';
export const meterLabelClass = 'font-medium text-foreground-muted';
export const meterValueClass = 'font-semibold text-foreground tabular-nums';
export const meterTrackClass = 'flex h-2 w-full overflow-hidden rounded-full bg-background-tertiary';
/**
 * The brand's colour, a screen's one orange, on how far along something is. How much of the track
 * it fills goes in twentieths: a width from the scale, never one made up.
 */
export const meterFillVariants = cva('h-full rounded-full bg-brand-fill transition-all motion-slide', {
  variants: {
    step: {
      0: 'w-0',
      1: 'w-1/20',
      2: 'w-2/20',
      3: 'w-3/20',
      4: 'w-4/20',
      5: 'w-5/20',
      6: 'w-6/20',
      7: 'w-7/20',
      8: 'w-8/20',
      9: 'w-9/20',
      10: 'w-10/20',
      11: 'w-11/20',
      12: 'w-12/20',
      13: 'w-13/20',
      14: 'w-14/20',
      15: 'w-15/20',
      16: 'w-16/20',
      17: 'w-17/20',
      18: 'w-18/20',
      19: 'w-19/20',
      20: 'w-full',
    },
  },
  defaultVariants: { step: 0 },
});

export type MeterStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20;
