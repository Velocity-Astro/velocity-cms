/** Helpers every `SearchIndex` adapter shares, so they agree on words and on excerpts. */

/** The words of a query or a text: lower case, accents removed, punctuation dropped. */
export function searchWords(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0);
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
}

/** Markers an adapter puts around matched words before the text is escaped. Never found in content. */
export const MARK_OPEN = '\u0001';
export const MARK_CLOSE = '\u0002';

/** Escapes a passage and turns the markers into `<mark>` tags. */
export function markedExcerpt(passage: string): string {
  return escapeHtml(passage).replaceAll(MARK_OPEN, '<mark>').replaceAll(MARK_CLOSE, '</mark>');
}
