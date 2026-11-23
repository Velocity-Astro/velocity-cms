/**
 * One column on a narrow screen; the main column and a side column from `xl` up. The width is the
 * screen's (`PageBody`), so a split lines up with what is above and below it.
 */
export const splitClass = 'flex w-full flex-col gap-6 xl:flex-row xl:items-start';
export const splitMainClass = 'flex min-w-0 flex-1 flex-col gap-6';
/** The side column stays in view while the main column scrolls, as far from the top as the screen's own padding. */
export const splitAsideClass = 'flex w-full shrink-0 flex-col gap-6 xl:sticky xl:top-8 xl:w-80';
