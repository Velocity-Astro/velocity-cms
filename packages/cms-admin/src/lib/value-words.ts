/** The keys of a section that say which section it is, not what it holds. */
const NAMES = new Set(['id', 'block']);

/** Every word and number a value holds, however deep, in order: what a person would know it by. */
export function wordsIn(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() === '' ? [] : [value.trim()];
  if (typeof value === 'number') return [String(value)];
  if (Array.isArray(value)) return value.flatMap(wordsIn);
  if (typeof value === 'object' && value !== null) return Object.entries(value).flatMap(([key, inner]) => (NAMES.has(key) ? [] : wordsIn(inner)));
  return [];
}

/**
 * What one version of a value says that the other does not, as a few words to tell the two apart
 * by: for a short text all of it, for a page of sections only the words that differ. Empty when
 * the difference is not one of words (an order, a switch).
 */
export function differingWords(value: unknown, other: unknown, most = 240): string {
  const theirs = new Set(wordsIn(other));
  const words = wordsIn(value).filter((word) => !theirs.has(word)).join(' · ');
  return words.length > most ? `${words.slice(0, most).trimEnd()}…` : words;
}
