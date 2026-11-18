/** What a visitor answered, in words. */
export function answerText(value: unknown, yes: string): string {
  if (value === undefined || value === null) return '';
  if (value === true) return yes;
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : JSON.stringify(value);
}
