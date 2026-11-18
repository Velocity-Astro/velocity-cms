/** The most a file of rows may hold. Past this the person is asked to split it. */
export const MAX_CSV_ROWS = 5000;

/**
 * Reads a table saved as text (CSV): rows of cells, with quoted cells that may hold the
 * separator, a line break or a doubled quote. The separator is the comma, or the semicolon or
 * tab when the first line has more of those, as spreadsheets in some countries save it. Empty
 * rows are left out and every cell is trimmed.
 */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, '');
  const firstLine = source.split(/\r?\n/, 1)[0] ?? '';
  const count = (mark: string) => firstLine.split(mark).length - 1;
  const separator = [',', ';', '\t'].reduce((best, mark) => (count(mark) > count(best) ? mark : best), ',');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const endCell = () => {
    row.push(cell.trim());
    cell = '';
  };
  const endRow = () => {
    endCell();
    if (row.some((value) => value !== '')) rows.push(row);
    row = [];
  };
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character !== '"') cell += character;
      else if (source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = false;
    } else if (character === '"' && cell.trim() === '') {
      cell = '';
      quoted = true;
    } else if (character === separator) endCell();
    else if (character === '\n') endRow();
    else if (character !== '\r') cell += character;
  }
  endRow();
  return rows;
}
