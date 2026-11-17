import type { FieldDef } from '@velocity/cms-core';
import { Registry } from '@velocity/cms-core';
import { createContext, useContext, type ComponentType, type ReactNode } from 'react';

/** What every field control is given. */
export interface FieldControlProps {
  readonly field: FieldDef;
  /** The field's label in the editor's language. */
  readonly label: string;
  /** A sentence on what to put in the field, in the editor's language, if the field has one. */
  readonly help?: string | undefined;
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
export interface FieldControl {
  /** The editor name a field type asks for: `text-input`. */
  readonly type: string;
  readonly Component: ComponentType<FieldControlProps>;
  /**
   * How much room the control needs. `compact` controls (a number, a date, a choice) sit side
   * by side in a form; everything else takes a row of its own. Defaults to `full`.
   */
  readonly width?: 'full' | 'compact';
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
