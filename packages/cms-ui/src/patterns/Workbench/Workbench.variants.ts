/** One column on a narrow screen; from `xl` up, the form in a column of its own width and the pane taking the rest. */
export const workbenchClass = 'flex w-full flex-col gap-6 xl:flex-row xl:items-start';
export const workbenchFormClass = 'flex min-w-0 flex-col gap-6 xl:w-lg xl:shrink-0';
/** The pane stays in view while the form scrolls under the bar at the top. */
export const workbenchPaneClass = 'pane-tall min-w-0 xl:sticky xl:top-24 xl:flex-1';
