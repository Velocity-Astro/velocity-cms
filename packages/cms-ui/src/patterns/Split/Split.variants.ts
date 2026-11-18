/** One column on a narrow screen; the main column and a side column from `xl` up. */
export const splitClass = 'mx-auto flex w-full max-w-7xl flex-col gap-6 xl:flex-row xl:items-start';
export const splitMainClass = 'flex min-w-0 flex-1 flex-col gap-6';
/** The side column stays in view while the main column scrolls under the bar at the top. */
export const splitAsideClass = 'flex w-full shrink-0 flex-col gap-6 xl:sticky xl:top-24 xl:w-80';
