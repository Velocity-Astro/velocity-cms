/** The words of a name, lowercased and without accents or signs: `Listed on` gives `listed`, `on`. */
function wordsOf(name: string): string[] {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** A key cannot start with a number, so one that would is left without its first numbers. */
const startingWithALetter = (words: string[]): string[] => {
  const [first = '', ...rest] = words;
  const trimmed = first.replace(/^[0-9]+/, '');
  return trimmed === '' ? (rest.length > 0 ? startingWithALetter(rest) : []) : [trimmed, ...rest];
};

/** A key for a field, from what it is called: `Listed on` becomes `listedOn`. */
export function fieldKeyFrom(name: string): string {
  return startingWithALetter(wordsOf(name))
    .map((word, index) => (index === 0 ? word : `${word.charAt(0).toUpperCase()}${word.slice(1)}`))
    .join('');
}

/** A key for a content type, from what it is called: `Case studies` becomes `case-studies`. */
export function typeKeyFrom(name: string): string {
  return startingWithALetter(wordsOf(name)).join('-');
}
