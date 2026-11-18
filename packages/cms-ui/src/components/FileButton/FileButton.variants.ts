/** A file button is a button: it has no look of its own. What it offers the file chooser is here. */
export const fileKinds = {
  /** The kinds of image a site can show. What a file really is, the server decides. */
  image: ['image/jpeg', 'image/png', 'image/webp'],
  /** A table saved from a spreadsheet as text, one row on each line. */
  csv: ['text/csv', '.csv'],
} as const;

export type FileKind = keyof typeof fileKinds;
