import type { FieldDef } from '@velocity-astro/cms-core';
import { Registry } from '@velocity-astro/cms-core';
import { createContext, useContext, type ComponentType, type ReactNode } from 'react';

/** What every field control is given. */
export interface FieldControlProps {
  readonly field: FieldDef;
  /** The field's label in the editor's language. */
  readonly label: string;
  /** A sentence on what to put in the field, in the editor's language, if the field has one. */
  readonly help?: string | undefined;
  /** True for a row of a list, whose label is in view above the rows. A control that can, hides its own. */
  readonly isLabelHidden?: boolean;
  /** The stored value, or `undefined` when the field is empty. */
  readonly value: unknown;
  /** Call with the new value, or `undefined` to empty the field. */
  readonly onChange: (value: unknown) => void;
  /** Where the field is in the entry, as field keys: `address.city`. */
  readonly path: string;
  /** What the server found wrong with this field, if anything. */
  readonly problem: string | undefined;
  /** Every problem the server found, by path. A control that holds other fields passes it on. */
  readonly problems: ReadonlyMap<string, string>;
}

/**
 * How one kind of field is filled in. A field type names its control (`FieldType.editor` in
 * `cms-core`), and the control with that name is drawn for it, so nothing in the editor asks
 * which type a field is. A plugin's field type brings its own control the same way.
 */
/** What a field's summary is given: the field and one stored value of it. */
export interface FieldSummaryProps {
  readonly field: FieldDef;
  readonly value: unknown;
}

/** One place in a value where plain words are held, and how the value reads with other words there. */
export interface WordsPlace {
  /** Where in the value, as keys joined with dots (`0.text`), or nothing for the value itself. */
  readonly place: string;
  /** The value with these words at the place, or `undefined` when that leaves the field empty. */
  readonly put: (words: string) => unknown;
}

/** One place in a value where a picture is held: the image's name there now, and how the value reads with another. */
export interface PicturePlace extends WordsPlace {
  readonly name: string | null;
}

/** One place in a value where a link is held: the field it is a value of, the link there now, and how the value reads with another. */
export interface LinkPlace {
  readonly place: string;
  /** The field whose control changes the link: the field itself, or the one a group or a list holds there. */
  readonly field: FieldDef;
  readonly link: unknown;
  /** The value with this link at the place, or `undefined` when that leaves the field empty. */
  readonly put: (link: unknown) => unknown;
}

type ControlFor = (type: string) => FieldControl | undefined;

export interface FieldControl {
  /** The editor name a field type asks for: `text-input`. */
  readonly type: string;
  readonly Component: ComponentType<FieldControlProps>;
  /**
   * How much room the control needs. `compact` controls (a number, a date, a choice) sit side
   * by side in a form; everything else takes a row of its own. Defaults to `full`.
   */
  readonly width?: 'full' | 'compact';
  /**
   * How a value reads in a list of entries, where there is no room for the control. Without
   * one, text and numbers are shown as they are stored and anything else is left out.
   */
  readonly Summary?: ComponentType<FieldSummaryProps>;
  /**
   * True for a control whose field is the page itself, such as its sections. An entry with one,
   * and a page of its own, is edited with the page shown beside the form.
   */
  readonly showsPage?: boolean;
  /**
   * What a value of this kind is called in a few words, if it has words of its own: a group's
   * first line of text. A list whose items have a control with this shows them as rows that
   * open, each under that name, in place of every item laid out in full.
   */
  readonly titleOf?: (field: FieldDef, value: unknown) => string | undefined;
  /**
   * Where a value of this kind holds plain words, exactly as a page shows them: the places words
   * can be typed straight on the page beside the form. A control that holds other fields asks
   * theirs (`controlFor`). Without it, the field is edited only in the form.
   */
  readonly words?: (field: FieldDef, value: unknown, controlFor: (type: string) => FieldControl | undefined) => readonly WordsPlace[];
  /**
   * Where a value of this kind holds a picture of the site's: the places a picture can be changed
   * from the page itself. A control that holds other fields asks theirs. Without it, the field is
   * changed only in the form.
   */
  readonly pictures?: (field: FieldDef, value: unknown, controlFor: ControlFor) => readonly PicturePlace[];
  /**
   * Where a value of this kind holds a link: the places a link or a button can be changed from
   * the page itself, in a window that holds the control of the field there. A control that holds
   * other fields asks theirs. Without it, the field is changed only in the form.
   */
  readonly links?: (field: FieldDef, value: unknown, controlFor: ControlFor) => readonly LinkPlace[];
  /** `end` when summaries are figures, so a column of them lines up. */
  readonly summaryAlign?: 'start' | 'end';
}

export type FieldControls = Registry<FieldControl>;

/** An empty set of controls, ready to be filled. */
export function createFieldControlRegistry(): FieldControls {
  return new Registry<FieldControl>('field control');
}

const FieldControlsContext = createContext<FieldControls | null>(null);

export interface FieldControlsProviderProps {
  readonly controls: FieldControls;
  readonly children: ReactNode;
}

export function FieldControlsProvider({ controls, children }: FieldControlsProviderProps) {
  return <FieldControlsContext value={controls}>{children}</FieldControlsContext>;
}

/** Every control the editor has. */
export function useFieldControls(): FieldControls {
  const controls = useContext(FieldControlsContext);
  if (!controls) throw new Error('useFieldControls() was called outside <AdminApp>. Render the screen inside it.');
  return controls;
}
