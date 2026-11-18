import { fieldDescriptionClass, fieldErrorClass, fieldLabelClass } from '../../components/field.js';

export const repeaterClass = 'flex min-w-0 flex-col gap-2';
export const repeaterLabelClass = fieldLabelClass;
export const repeaterDescriptionClass = fieldDescriptionClass;
export const repeaterErrorClass = fieldErrorClass;
export const repeaterListClass = 'flex flex-col gap-2';
export const repeaterItemClass = 'flex items-start gap-1';
export const repeaterItemContentClass = 'min-w-0 flex-1';
/** As tall as one line of a field, so the buttons sit beside a row's first line. */
export const repeaterItemActionsClass = 'flex h-10 shrink-0 items-center';
export const repeaterEmptyClass = 'rounded-md border border-dashed border-border px-3 py-4 text-sm text-foreground-muted';
export const repeaterAddClass = 'flex';
