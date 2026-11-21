/**
 * The scales layout parts accept. Every value is a token: a step on Velocity's 4px spacing
 * scale, or a named surface. Tailwind needs whole class names in the source, so each scale is
 * written out rather than built from a number.
 */
export const gap = {
  0: 'gap-0',
  1: 'gap-1',
  2: 'gap-2',
  3: 'gap-3',
  4: 'gap-4',
  5: 'gap-5',
  6: 'gap-6',
  8: 'gap-8',
  10: 'gap-10',
  12: 'gap-12',
} as const;

export const padding = {
  0: 'p-0',
  1: 'p-1',
  2: 'p-2',
  3: 'p-3',
  4: 'p-4',
  5: 'p-5',
  6: 'p-6',
  8: 'p-8',
  10: 'p-10',
  12: 'p-12',
} as const;

export const paddingX = {
  0: 'px-0',
  1: 'px-1',
  2: 'px-2',
  3: 'px-3',
  4: 'px-4',
  5: 'px-5',
  6: 'px-6',
  8: 'px-8',
  10: 'px-10',
  // A screen's own gutter, which a narrow window cannot spare.
  12: 'px-4 md:px-12',
} as const;

export const paddingY = {
  0: 'py-0',
  1: 'py-1',
  2: 'py-2',
  3: 'py-3',
  4: 'py-4',
  5: 'py-5',
  6: 'py-6',
  8: 'py-8',
  // A screen's own gutter, which a narrow window cannot spare.
  10: 'py-6 md:py-10',
  12: 'py-12',
} as const;

/** A step on the spacing scale, in units of 4px. */
export type Space = keyof typeof gap;
